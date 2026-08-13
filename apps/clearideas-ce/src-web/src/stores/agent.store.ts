import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ceApi, streamAgentResume, streamAgentRun } from '../api/client'
import { useAlert } from '../composables/useAlert'
import type { Agent, AgentRun, AgentSchedule, AgentScheduleDefinition } from '../types/domain'

export const starterAgentManifest = {
  schemaVersion: '1.0',
  name: 'Site research assistant',
  description: 'Answers a question using content from a selected Site.',
  model: { ref: 'default' },
  variables: [
    {
      key: 'question',
      type: 'string',
      requiresOverride: true,
      description: 'What should the agent investigate?',
    },
  ],
  steps: [
    {
      id: 'research',
      type: 'prompt',
      systemPrompt: 'Use the Site tools to find relevant sources. State when the available content is insufficient.',
      prompt: '{{ question }}',
      tools: ['search_content', 'retrieve_file_content', 'get_content_metadata'],
      includeInFinalOutput: true,
    },
  ],
}

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([])
  const runs = ref<AgentRun[]>([])
  const runDetails = ref<AgentRun>()
  const schedules = ref<AgentSchedule[]>([])
  const runtimeConfigured = ref(false)
  const loading = ref(false)
  const running = ref(false)
  const loadingRunDetails = ref(false)
  const output = ref<unknown>()
  const events = ref<any[]>([])
  const alert = useAlert()

  async function loadAgents() {
    loading.value = true
    try {
      const response = await ceApi.agents()
      agents.value = response.agents
      runtimeConfigured.value = response.runtimeConfigured
      return agents.value
    } finally {
      loading.value = false
    }
  }

  async function saveAgent(agentId: string | undefined, manifest: unknown) {
    try {
      const response = agentId
        ? await ceApi.updateAgent(agentId, manifest)
        : await ceApi.createAgent(manifest)
      await loadAgents()
      alert.add({ message: agentId ? 'Agent saved.' : 'Agent created.', type: 'success', timeout: 3000 })
      return response.agent
    } catch (error) {
      alert.add({ message: message(error), type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function removeAgent(agentId: string) {
    await ceApi.deleteAgent(agentId)
    await loadAgents()
    alert.add({ message: 'Agent deleted.', type: 'success', timeout: 3000 })
  }

  async function runAgent(
    agentId: string,
    input: { variables: Array<{ key: string; value: unknown }>; siteId?: string },
  ) {
    running.value = true
    output.value = undefined
    events.value = []
    try {
      await streamAgentRun(`/agents/${agentId}/runs`, input, item => {
        if (item.kind === 'event') events.value.push(item.event)
        if (item.kind === 'result') output.value = item.result.output
        if (item.kind === 'error') throw new Error(item.error)
      })
      await loadRuns(agentId)
    } catch (error) {
      alert.add({ message: message(error), type: 'error', timeout: 5000 })
      throw error
    } finally {
      running.value = false
    }
  }

  async function loadRuns(agentId: string) {
    runs.value = (await ceApi.agentRuns(agentId)).runs
  }

  async function loadRun(runId: string) {
    loadingRunDetails.value = true
    try {
      runDetails.value = (await ceApi.agentRun(runId)).run
      return runDetails.value
    } finally {
      loadingRunDetails.value = false
    }
  }

  function clearRunDetails() {
    runDetails.value = undefined
  }

  async function resumeRun(run: AgentRun) {
    running.value = true
    output.value = undefined
    events.value = []
    try {
      await streamAgentResume(run.runId, item => {
        if (item.kind === 'event') events.value.push(item.event)
        if (item.kind === 'result') output.value = item.result.output
        if (item.kind === 'error') throw new Error(item.error)
      })
      await loadRuns(run.agentId)
    } catch (error) {
      alert.add({ message: message(error), type: 'error', timeout: 5000 })
      throw error
    } finally {
      running.value = false
    }
  }

  async function loadSchedules(agentId: string) {
    schedules.value = (await ceApi.agentSchedules(agentId)).schedules
  }

  async function createSchedule(
    agentId: string,
    input: {
      definition: AgentScheduleDefinition
      variables: Array<{ key: string; value: unknown }>
      siteId?: string
      enabled: boolean
    },
  ) {
    await ceApi.createAgentSchedule(agentId, input)
    await loadSchedules(agentId)
    alert.add({ message: 'Schedule created.', type: 'success', timeout: 3000 })
  }

  async function setScheduleEnabled(schedule: AgentSchedule, enabled: boolean) {
    await ceApi.updateAgentSchedule(schedule.id, {
      definition: schedule.definition,
      variables: schedule.variables,
      siteId: schedule.siteId ?? undefined,
      enabled,
    })
    await loadSchedules(schedule.agentId)
  }

  async function removeSchedule(schedule: AgentSchedule) {
    await ceApi.deleteAgentSchedule(schedule.id)
    await loadSchedules(schedule.agentId)
  }

  return {
    agents,
    runs,
    runDetails,
    schedules,
    runtimeConfigured,
    loading,
    running,
    loadingRunDetails,
    output,
    events,
    loadAgents,
    saveAgent,
    removeAgent,
    runAgent,
    loadRuns,
    loadRun,
    clearRunDetails,
    resumeRun,
    loadSchedules,
    createSchedule,
    setScheduleEnabled,
    removeSchedule,
  }
})

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The agent request failed.'
}
