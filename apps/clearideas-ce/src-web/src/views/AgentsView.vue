<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ManifestEditor from '../components/agents/ManifestEditor.vue'
import MarkdownRenderer from '../components/base/MarkdownRenderer.vue'
import { starterAgentManifest, useAgentStore, useSiteStore } from '../stores'
import type { Agent, AgentScheduleDefinition } from '../types/domain'

const agentStore = useAgentStore()
const siteStore = useSiteStore()
const {
  agents,
  runs,
  schedules,
  runDetails,
  runtimeConfigured,
  loading,
  running,
  loadingRunDetails,
  output,
  events,
} = storeToRefs(agentStore)
const { sites } = storeToRefs(siteStore)
const selectedId = ref('')
const manifestText = ref(JSON.stringify(starterAgentManifest, null, 2))
const siteId = ref('')
const variableValues = reactive<Record<string, string>>({})
const saving = ref(false)
const runDetailsDialog = ref(false)
const schedule = reactive({
  kind: 'daily' as 'once' | 'daily' | 'weekly' | 'monthly',
  dateTime: '',
  time: '09:00',
  days: '1',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
})

const selected = computed(() => agents.value.find(agent => agent.id === selectedId.value))
const parsedManifest = computed<any | null>(() => {
  try {
    return JSON.parse(manifestText.value)
  } catch {
    return null
  }
})
const variables = computed(() => parsedManifest.value?.variables ?? [])
const usesSiteTools = computed(() =>
  (parsedManifest.value?.steps ?? []).some((step: any) => Array.isArray(step.tools) && step.tools.length > 0),
)
const renderedOutput = computed(() =>
  renderValue(output.value),
)
const renderedRunDetailsOutput = computed(() => renderValue(runDetails.value?.output))
const renderedRunTranscript = computed(() =>
  runDetails.value?.transcript?.length
    ? `\`\`\`json\n${JSON.stringify(runDetails.value.transcript, null, 2)}\n\`\`\``
    : '',
)
const runDetailsError = computed(() => {
  const error = runDetails.value?.error
  if (!error) return ''
  return typeof error === 'string' ? error : error.message ?? JSON.stringify(error)
})

onMounted(async () => {
  await Promise.all([agentStore.loadAgents(), siteStore.getSitesIfRequired()])
  if (agents.value[0]) selectAgent(agents.value[0])
})

watch(selectedId, async id => {
  if (!id) return
  await Promise.all([agentStore.loadRuns(id), agentStore.loadSchedules(id)])
})

function selectAgent(agent: Agent) {
  selectedId.value = agent.id
  manifestText.value = JSON.stringify(agent.manifest, null, 2)
  resetVariables()
}

function newAgent() {
  selectedId.value = ''
  manifestText.value = JSON.stringify(starterAgentManifest, null, 2)
  runs.value = []
  schedules.value = []
  resetVariables()
  closeRunDetails()
}

function resetVariables() {
  for (const key of Object.keys(variableValues)) delete variableValues[key]
  for (const variable of variables.value) {
    variableValues[variable.key] = variable.value == null
      ? ''
      : typeof variable.value === 'string'
        ? variable.value
        : JSON.stringify(variable.value)
  }
}

function variableOverrides() {
  return variables.value
    .filter((variable: any) => variableValues[variable.key] !== '')
    .map((variable: any) => ({ key: variable.key, value: parseVariable(variable.type, variableValues[variable.key]) }))
}

async function save() {
  if (!parsedManifest.value) throw new Error('Manifest JSON is invalid.')
  saving.value = true
  try {
    const agent = await agentStore.saveAgent(selectedId.value || undefined, parsedManifest.value)
    selectAgent(agent)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!selected.value || !window.confirm(`Delete “${selected.value.name}”? Run history will be kept.`)) return
  await agentStore.removeAgent(selected.value.id)
  newAgent()
}

async function run() {
  if (!selected.value) return
  await agentStore.runAgent(selected.value.id, {
    variables: variableOverrides(),
    ...(siteId.value ? { siteId: siteId.value } : {}),
  })
}

async function createSchedule() {
  if (!selected.value) return
  await agentStore.createSchedule(selected.value.id, {
    definition: scheduleDefinition(),
    variables: variableOverrides(),
    ...(siteId.value ? { siteId: siteId.value } : {}),
    enabled: true,
  })
}

async function openRunDetails(run: AgentRun) {
  runDetailsDialog.value = true
  agentStore.clearRunDetails()
  await agentStore.loadRun(run.runId)
}

function closeRunDetails() {
  runDetailsDialog.value = false
  agentStore.clearRunDetails()
}

function scheduleDefinition(): AgentScheduleDefinition {
  if (schedule.kind === 'once') {
    if (!schedule.dateTime) throw new Error('Choose a date and time.')
    return { kind: 'once', runAt: new Date(schedule.dateTime).toISOString(), timeZone: schedule.timeZone }
  }
  if (schedule.kind === 'weekly') {
    return { kind: 'weekly', time: schedule.time, timeZone: schedule.timeZone, daysOfWeek: numberList(schedule.days) }
  }
  if (schedule.kind === 'monthly') {
    return { kind: 'monthly', time: schedule.time, timeZone: schedule.timeZone, daysOfMonth: numberList(schedule.days) }
  }
  return { kind: 'daily', time: schedule.time, timeZone: schedule.timeZone }
}

function parseVariable(type: string, value: string) {
  if (type === 'number') return Number(value)
  if (type === 'boolean') return value === 'true'
  if (['object', 'array', 'json'].includes(type)) return JSON.parse(value)
  return value
}

function numberList(value: string) {
  return [...new Set(value.split(',').map(item => Number(item.trim())).filter(Number.isInteger))]
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function renderValue(value: unknown) {
  return typeof value === 'string'
    ? value
    : value == null
      ? ''
      : `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function runStatusColor(status?: AgentRun['status']) {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'error'
  if (status === 'running') return 'info'
  if (status === 'suspended') return 'warning'
  return 'default'
}

function siteName(id?: string | null) {
  return sites.value.find(site => site.id === id)?.name ?? (id || 'No Site')
}
</script>

<template>
  <div class="agents-view pa-5">
    <div class="d-flex align-center justify-space-between mb-5">
      <div>
        <h1 class="text-h4">Agents</h1>
        <p class="text-medium-emphasis mt-1">Create focused prompt agents that can read content from a Site.</p>
      </div>
      <VBtn color="primary" prepend-icon="fas fa-plus" @click="newAgent">New agent</VBtn>
    </div>

    <VAlert v-if="!runtimeConfigured" type="warning" variant="tonal" class="mb-4">
      Set <code>AI_AGENT_MODEL</code> and the provider API key before running agents.
    </VAlert>

    <VRow>
      <VCol cols="12" md="3">
        <VCard>
          <VCardTitle>Your agents</VCardTitle>
          <VProgressLinear v-if="loading" indeterminate />
          <VList nav>
            <VListItem
              v-for="agent in agents"
              :key="agent.id"
              :active="selectedId === agent.id"
              :title="agent.name"
              :subtitle="agent.description"
              prepend-icon="fas fa-robot"
              @click="selectAgent(agent)"
            />
            <VListItem v-if="agents.length === 0 && !loading" title="No agents yet" subtitle="Start with the included template." />
          </VList>
        </VCard>
      </VCol>

      <VCol cols="12" md="9">
        <VCard class="mb-4">
          <VCardTitle>{{ selected ? selected.name : 'New agent' }}</VCardTitle>
          <VCardText>
            <ManifestEditor v-model="manifestText" :error="!parsedManifest" />
          </VCardText>
          <VCardActions>
            <VBtn color="primary" :loading="saving" :disabled="!parsedManifest" @click="save">Save</VBtn>
            <VBtn v-if="selected" color="error" variant="text" @click="remove">Delete</VBtn>
          </VCardActions>
        </VCard>

        <VCard v-if="selected" class="mb-4">
          <VCardTitle>Run</VCardTitle>
          <VCardText class="run-card__content">
            <section v-if="usesSiteTools" class="run-section">
              <div class="run-section__heading">
                <div class="run-section__title">Context</div>
                <div class="text-body-2 text-medium-emphasis">Choose the Site this run may read from.</div>
              </div>
              <VSelect
                v-model="siteId"
                :items="sites"
                item-title="name"
                item-value="id"
                label="Site"
                clearable
                hide-details="auto"
              />
            </section>

            <section v-if="variables.length" class="run-section">
              <div class="run-section__heading">
                <div class="run-section__title">Inputs</div>
                <div class="text-body-2 text-medium-emphasis">Values used when the manifest is executed.</div>
              </div>
              <div class="run-fields">
                <template v-for="variable in variables" :key="variable.key">
                  <VSelect
                    v-if="variable.type === 'boolean'"
                    v-model="variableValues[variable.key]"
                    :items="['true', 'false']"
                    :label="variable.key"
                    :hint="variable.description"
                    persistent-hint
                  />
                  <VTextarea
                    v-else-if="['object', 'array', 'json'].includes(variable.type)"
                    v-model="variableValues[variable.key]"
                    :label="variable.key"
                    :hint="variable.description"
                    persistent-hint
                    rows="3"
                  />
                  <VTextField
                    v-else
                    v-model="variableValues[variable.key]"
                    :type="variable.type === 'number' ? 'number' : 'text'"
                    :label="variable.key"
                    :hint="variable.description"
                    persistent-hint
                  />
                </template>
              </div>
            </section>

            <div class="run-actions">
              <VBtn color="primary" size="large" prepend-icon="fas fa-play" :loading="running" :disabled="!runtimeConfigured || (usesSiteTools && !siteId)" @click="run">
                Run agent
              </VBtn>
              <span v-if="usesSiteTools && !siteId" class="text-body-2 text-medium-emphasis">Select a Site to run this agent.</span>
            </div>

            <VAlert v-if="running" type="info" variant="tonal" class="mt-4">
              Running… {{ events.length }} events received.
            </VAlert>
            <div v-if="renderedOutput" class="agent-output">
              <div class="run-section__title mb-3">Output</div>
              <MarkdownRenderer :content="renderedOutput" :strip-front-matter="false" />
            </div>
          </VCardText>
        </VCard>

        <VCard v-if="selected" class="mb-4">
          <VCardTitle>Schedule a run</VCardTitle>
          <VCardText class="schedule-card__content">
            <VRow class="schedule-fields">
              <VCol cols="12" sm="3">
                <VSelect v-model="schedule.kind" :items="['once', 'daily', 'weekly', 'monthly']" label="Frequency" />
              </VCol>
              <VCol v-if="schedule.kind === 'once'" cols="12" sm="4">
                <VTextField v-model="schedule.dateTime" type="datetime-local" label="Run at" />
              </VCol>
              <VCol v-else cols="12" sm="3">
                <VTextField v-model="schedule.time" type="time" label="Time" />
              </VCol>
              <VCol v-if="schedule.kind === 'weekly' || schedule.kind === 'monthly'" cols="12" sm="3">
                <VTextField v-model="schedule.days" :label="schedule.kind === 'weekly' ? 'Weekdays (1–7)' : 'Month days (1–31)'" hint="Comma-separated" persistent-hint />
              </VCol>
              <VCol cols="12" sm="4">
                <VTextField v-model="schedule.timeZone" label="Time zone" />
              </VCol>
            </VRow>
            <div class="schedule-actions">
              <VBtn variant="tonal" prepend-icon="fas fa-clock" :disabled="usesSiteTools && !siteId" @click="createSchedule">Create schedule</VBtn>
            </div>
          </VCardText>
          <VDivider />
          <VList>
            <VListItem v-for="item in schedules" :key="item.id" :title="item.definition.kind" :subtitle="`Next: ${formatDate(item.nextRunAt)}${item.lastError ? ` · ${item.lastError}` : ''}`">
              <template #append>
                <VSwitch :model-value="item.enabled" hide-details density="compact" @update:model-value="value => agentStore.setScheduleEnabled(item, Boolean(value))" />
                <VBtn icon="fas fa-trash" variant="text" size="small" aria-label="Delete schedule" @click="agentStore.removeSchedule(item)" />
              </template>
            </VListItem>
            <VListItem v-if="schedules.length === 0" title="No schedules" />
          </VList>
        </VCard>

        <VCard v-if="selected">
          <VCardTitle>Run history</VCardTitle>
          <VTable>
            <thead><tr><th>Status</th><th>Source</th><th>Started</th><th>Run ID</th><th class="text-right">Actions</th></tr></thead>
            <tbody>
              <tr
                v-for="item in runs"
                :key="item.runId"
                class="run-history__row"
                tabindex="0"
                @click="openRunDetails(item)"
                @keydown.enter.prevent="openRunDetails(item)"
                @keydown.space.prevent="openRunDetails(item)"
              >
                <td><VChip :color="runStatusColor(item.status)" size="small" variant="tonal">{{ item.status }}</VChip></td>
                <td>{{ item.source }}</td><td>{{ formatDate(item.createdAt) }}</td><td><code>{{ item.runId }}</code></td>
                <td class="run-history__actions">
                  <VBtn size="small" variant="text" prepend-icon="fas fa-eye" @click.stop="openRunDetails(item)">View</VBtn>
                  <VBtn v-if="item.status === 'failed' || item.status === 'suspended'" size="small" variant="text" :loading="running" @click.stop="agentStore.resumeRun(item)">Resume</VBtn>
                </td>
              </tr>
              <tr v-if="runs.length === 0"><td colspan="5" class="text-medium-emphasis">No runs yet.</td></tr>
            </tbody>
          </VTable>
        </VCard>
      </VCol>
    </VRow>

    <VDialog v-model="runDetailsDialog" max-width="880" scrollable @after-leave="agentStore.clearRunDetails">
      <VCard>
        <VCardTitle class="run-details__header">
          <div>
            <div>Run details</div>
            <code v-if="runDetails" class="text-body-2 text-medium-emphasis">{{ runDetails.runId }}</code>
          </div>
          <VBtn icon="fas fa-xmark" variant="text" aria-label="Close run details" @click="closeRunDetails" />
        </VCardTitle>
        <VProgressLinear v-if="loadingRunDetails" indeterminate />
        <VCardText v-if="runDetails" class="run-details__content">
          <div class="run-details__meta">
            <div class="run-detail-stat">
              <span>Status</span>
              <VChip :color="runStatusColor(runDetails.status)" size="small" variant="tonal">{{ runDetails.status }}</VChip>
            </div>
            <div class="run-detail-stat"><span>Source</span><strong>{{ runDetails.source }}</strong></div>
            <div class="run-detail-stat"><span>Site</span><strong>{{ siteName(runDetails.siteId) }}</strong></div>
            <div class="run-detail-stat"><span>Started</span><strong>{{ formatDate(runDetails.createdAt) }}</strong></div>
            <div class="run-detail-stat"><span>Updated</span><strong>{{ formatDate(runDetails.updatedAt) }}</strong></div>
            <div class="run-detail-stat"><span>Agent revision</span><strong>{{ runDetails.agentRevision }}</strong></div>
          </div>

          <VAlert v-if="runDetailsError" type="error" variant="tonal">{{ runDetailsError }}</VAlert>

          <section class="run-details__section">
            <div class="run-section__title mb-3">Output</div>
            <div v-if="renderedRunDetailsOutput" class="run-details__output">
              <MarkdownRenderer :content="renderedRunDetailsOutput" :strip-front-matter="false" />
            </div>
            <p v-else class="text-body-2 text-medium-emphasis">This run did not produce output.</p>
          </section>

          <VExpansionPanels v-if="renderedRunTranscript" variant="accordion" class="run-details__transcript">
            <VExpansionPanel title="Transcript">
              <VExpansionPanelText>
                <MarkdownRenderer :content="renderedRunTranscript" :strip-front-matter="false" />
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.agents-view { height: 100%; overflow-y: auto; }
.run-card__content { padding-top: 8px; }
.run-section + .run-section { margin-top: 28px; }
.run-section__heading { margin-bottom: 14px; }
.run-section__title { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; line-height: 18px; text-transform: uppercase; }
.run-fields { display: grid; gap: 16px; }
.run-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.agent-output { margin-top: 28px; padding-top: 24px; border-top: 1px solid rgb(var(--v-theme-surface-variant)); }
.schedule-card__content { padding-top: 8px; }
.schedule-fields { margin-bottom: 0; }
.schedule-actions { display: flex; align-items: center; padding-top: 16px; }
.run-history__row { cursor: pointer; transition: background-color 120ms ease; }
.run-history__row:hover,
.run-history__row:focus-visible { background: rgba(var(--v-theme-primary), 0.06); outline: none; }
.run-history__actions { min-width: 116px; text-align: right; white-space: nowrap; }
.run-details__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 24px; }
.run-details__content { display: grid; gap: 24px; padding: 8px 24px 28px; }
.run-details__meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.run-detail-stat { display: flex; min-height: 72px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 5px; padding: 12px 14px; border-radius: 8px; background: rgba(var(--v-theme-on-surface), 0.04); }
.run-detail-stat > span { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); font-size: 12px; }
.run-detail-stat > strong { max-width: 100%; overflow-wrap: anywhere; font-size: 14px; font-weight: 600; }
.run-details__section { padding-top: 4px; }
.run-details__output { padding: 18px; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 8px; background: rgba(var(--v-theme-on-surface), 0.025); }
.run-details__transcript { margin-top: -4px; }
code { overflow-wrap: anywhere; }

@media (max-width: 600px) {
  .agents-view { padding: 16px !important; }
  .run-section + .run-section { margin-top: 24px; }
  .run-details__meta { grid-template-columns: 1fr; }
  .run-history__actions { min-width: auto; }
}
</style>
