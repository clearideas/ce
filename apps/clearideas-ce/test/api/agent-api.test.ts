import type { ModelAdapter, ModelRequest, ModelResult } from '@clearideas/agent-runtime'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processPendingAgentTasks } from '../../src/workers/agent-task-worker.js'
import { createTestCeRuntime, signIn, type TestCeRuntime } from '../harness/runtime.js'

class FakeModelAdapter implements ModelAdapter {
  async generate(_request: ModelRequest): Promise<ModelResult> {
    return {
      output: 'A concise agent answer.',
      transcript: [
        {
          id: 'fake-message',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'A concise agent answer.' }],
          createdAt: new Date().toISOString(),
          model: 'test/fake',
        },
      ],
      finishReason: 'stop',
    }
  }
}

describe('CE agent API', () => {
  let ctx: TestCeRuntime
  let agentId = ''

  beforeAll(async () => {
    ctx = await createTestCeRuntime({ agentModelAdapter: new FakeModelAdapter() })
    await signIn({ agent: ctx.agent, email: ctx.email, address: 'agents@clearideas.local' })
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('creates, validates, updates, lists, runs, and retains agent history', async () => {
    const manifest = {
      schemaVersion: '1.0',
      name: 'CE test agent',
      variables: [{ key: 'question', type: 'string', requiresOverride: true }],
      steps: [{ id: 'answer', type: 'prompt', prompt: '{{ question }}', includeInFinalOutput: true }],
    }
    agentId = await ctx.agent
      .post('/api/agents')
      .send({ manifest })
      .expect(201)
      .then(response => response.body.agent.id)

    await ctx.agent.get('/api/agents').expect(200).expect(({ body }) => {
      expect(body.runtimeConfigured).toBe(true)
      expect(body.agents).toEqual([expect.objectContaining({ id: agentId, revision: 1 })])
    })
    await ctx.agent
      .patch(`/api/agents/${agentId}`)
      .send({ manifest: { ...manifest, description: 'Updated' } })
      .expect(200)
      .expect(({ body }) => expect(body.agent.revision).toBe(2))

    const stream = await ctx.agent
      .post(`/api/agents/${agentId}/runs`)
      .send({ variables: [{ key: 'question', value: 'What changed?' }] })
      .expect(200)
      .expect('content-type', /ndjson/)
    const messages = stream.text.trim().split('\n').map(line => JSON.parse(line))
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'accepted' }),
      expect.objectContaining({ kind: 'result', result: expect.objectContaining({ output: 'A concise agent answer.' }) }),
    ]))
    let completedRunId = ''
    await ctx.agent.get(`/api/agent-runs?agentId=${agentId}`).expect(200).expect(({ body }) => {
      expect(body.runs[0]).toMatchObject({ agentId, agentRevision: 2, status: 'completed', output: 'A concise agent answer.' })
      completedRunId = body.runs[0].runId
    })
    await ctx.agent.get(`/api/agent-runs/${completedRunId}`).expect(200).expect(({ body }) => {
      expect(body.run).toMatchObject({
        runId: completedRunId,
        status: 'completed',
        output: 'A concise agent answer.',
        transcript: expect.any(Array),
      })
    })

    await ctx.agent
      .post('/api/agents')
      .send({ manifest: { ...manifest, steps: [{ id: 'bad', type: 'webhook', url: 'https://example.com' }] } })
      .expect(400)
  })

  it('queues and executes a scheduled task through the embedded worker seam', async () => {
    const runAt = new Date(Date.now() + 60_000).toISOString()
    const schedule = await ctx.agent
      .post(`/api/agents/${agentId}/schedules`)
      .send({
        definition: { kind: 'once', runAt, timeZone: 'UTC' },
        variables: [{ key: 'question', value: 'Scheduled question' }],
        enabled: true,
      })
      .expect(201)
      .then(response => response.body.schedule)
    await ctx.runtime.models.AgentScheduleModel.updateOne(
      { _id: schedule.id },
      { $set: { nextRunAt: new Date(Date.now() - 1000) } },
    )
    await processPendingAgentTasks({
      models: ctx.runtime.models,
      agentHost: ctx.runtime.agentHost,
      now: () => new Date(),
    })
    const task = await ctx.runtime.models.AgentTaskModel.findOne({ scheduleId: schedule.id }).lean()
    expect(task).toMatchObject({ status: 'completed', runId: expect.stringMatching(/^run_/) })
    await ctx.agent.get(`/api/agent-runs?agentId=${agentId}`).expect(200).expect(({ body }) => {
      expect(body.runs).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'scheduled', status: 'completed' })]))
    })
  })
})
