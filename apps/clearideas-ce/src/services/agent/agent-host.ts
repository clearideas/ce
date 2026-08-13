import {
  AgentRuntime,
  createConfiguredModelAdapter,
  JexlConditionEvaluator,
  parseAgentRunManifest,
  parseAgentRuntimeConfig,
  PromptStepExecutor,
  type AgentManifest,
  type AgentVariableOverride,
  type ModelAdapter,
  type RunEvent,
  type RunResult,
} from '@clearideas/agent-runtime'
import { BadRequestError, NotFoundError } from '@clearideas/core/errors'
import { randomUUID } from 'node:crypto'
import type { CeAppContext } from '../../lib/app-context.js'
import { manifestUsesSiteTools, validateCeAgentManifest } from './manifest-policy.js'
import { MongoAgentRunStore, type AgentRunScope } from './mongo-run-store.js'
import { CeSiteToolAdapter } from './site-tool-adapter.js'

export type AgentHostMessage =
  | { kind: 'accepted'; runId: string }
  | { kind: 'event'; event: RunEvent }
  | { kind: 'result'; result: RunResult }

export interface AgentExecutionInput {
  agentId: string
  accountId: string
  userId: string
  variables?: AgentVariableOverride[]
  siteId?: string
  execution?: 'sequential' | 'parallel'
  source?: 'manual' | 'scheduled'
  scheduleId?: string
  taskId?: string
  manifest?: AgentManifest
  agentRevision?: number
}

export class AgentHostService {
  constructor(
    private readonly ctx: CeAppContext,
    private readonly modelAdapter?: ModelAdapter,
  ) {}

  isConfigured() {
    return Boolean(this.modelAdapter || configuredAgentModel())
  }

  async execute(
    input: AgentExecutionInput,
    onMessage: (message: AgentHostMessage) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    const saved = input.manifest
      ? null
      : await this.ctx.models.AgentModel.findOne({
          _id: input.agentId,
          accountId: input.accountId,
        }).lean()
    if (!saved && !input.manifest) throw new NotFoundError('Agent not found.')
    const manifest = validateCeAgentManifest(input.manifest ?? saved.manifest)
    const agentRevision = input.agentRevision ?? Number(saved.revision)
    if (manifestUsesSiteTools(manifest) && !input.siteId) {
      throw new BadRequestError('A Site is required when an agent uses Site tools.')
    }
    if (!this.isConfigured()) throw new BadRequestError('AI_AGENT_MODEL is not configured.')

    const runId = `run_${randomUUID()}`
    const runManifest = parseAgentRunManifest({
      schemaVersion: '1.0',
      agent: { ref: input.agentId },
      runId,
      variables: input.variables ?? [],
      execution: { mode: input.execution ?? 'sequential', maxConcurrency: 2 },
    })
    await onMessage({ kind: 'accepted', runId })

    const scope: AgentRunScope = {
      accountId: input.accountId,
      createdBy: input.userId,
      agentId: input.agentId,
      agentRevision,
      siteId: input.siteId,
      source: input.source ?? 'manual',
      scheduleId: input.scheduleId,
      taskId: input.taskId,
    }
    const runtime = this.createRuntime(manifest, scope, onMessage)
    const result = await runtime.run({
      manifest,
      runId,
      variables: runManifest.variables,
      execution: runManifest.execution,
      signal,
    })
    await onMessage({ kind: 'result', result })
    return result
  }

  async resume(
    input: { runId: string; accountId: string; userId: string },
    onMessage: (message: AgentHostMessage) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    const row = await this.ctx.models.AgentRunModel.findOne({
      runId: input.runId,
      accountId: input.accountId,
    }).lean()
    if (!row) throw new NotFoundError('Agent run not found.')
    if (String(row.createdBy) !== input.userId) {
      throw new NotFoundError('Agent run not found.')
    }
    const manifest = validateCeAgentManifest(row.record.manifest)
    if (manifestUsesSiteTools(manifest) && !row.siteId) {
      throw new BadRequestError('This run does not have a Site context.')
    }
    if (!this.isConfigured()) throw new BadRequestError('AI_AGENT_MODEL is not configured.')

    await onMessage({ kind: 'accepted', runId: input.runId })
    const scope: AgentRunScope = {
      accountId: input.accountId,
      createdBy: input.userId,
      agentId: String(row.agentId),
      agentRevision: Number(row.agentRevision),
      siteId: row.siteId ? String(row.siteId) : undefined,
      source: row.source,
      scheduleId: row.scheduleId ? String(row.scheduleId) : undefined,
      taskId: row.taskId ? String(row.taskId) : undefined,
    }
    const result = await this.createRuntime(manifest, scope, onMessage).run({
      runId: input.runId,
      resume: true,
      signal,
    })
    await onMessage({ kind: 'result', result })
    return result
  }

  private createRuntime(
    manifest: AgentManifest,
    scope: AgentRunScope,
    onMessage: (message: AgentHostMessage) => void | Promise<void>,
  ) {
    const model = this.modelAdapter ?? createConfiguredAgentModel(manifest)
    const tools = scope.siteId
      ? new CeSiteToolAdapter(this.ctx, {
          accountId: scope.accountId,
          userId: scope.createdBy,
          siteId: scope.siteId,
        })
      : undefined
    return new AgentRuntime({
      runStore: new MongoAgentRunStore(this.ctx.models.AgentRunModel, scope),
      stepExecutors: [new PromptStepExecutor({ defaultMaxToolCalls: 10 })],
      conditionEvaluator: new JexlConditionEvaluator(),
      model,
      tools,
      maxParallelSteps: 2,
      eventSinks: [{ emit: event => onMessage({ kind: 'event', event }) }],
    })
  }
}

function configuredAgentModel() {
  return (process.env.AI_AGENT_MODEL ?? process.env.AI_CHAT_MODEL ?? '').trim()
}

function createConfiguredAgentModel(manifest: AgentManifest): ModelAdapter {
  const configured = configuredAgentModel()
  const [provider, ...parts] = configured.split(':')
  const model = parts.join(':')
  if (!provider || !model) {
    throw new BadRequestError(
      'AI_AGENT_MODEL must use provider:model, for example openai:gpt-5.6-luna.',
    )
  }
  try {
    const runtimeConfig = parseAgentRuntimeConfig({
      version: '1.0',
      models: { default: { provider, model } },
    })
    const adapter = createConfiguredModelAdapter(manifest, runtimeConfig, { environment: process.env }, {
      requireProfiles: true,
      allowManifestOptions: false,
    })
    if (!adapter) throw new Error('The agent does not reference a model.')
    return adapter
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'Agent model is invalid.')
  }
}
