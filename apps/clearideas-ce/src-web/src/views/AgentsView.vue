<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ManifestEditor from '../components/agents/ManifestEditor.vue'
import BaseDialog from '../components/base/BaseDialog.vue'
import MarkdownRenderer from '../components/base/MarkdownRenderer.vue'
import { starterAgentManifest, useAgentStore, useProfileStore, useSiteStore } from '../stores'
import type { Agent, AgentManifest, AgentRun, AgentSchedule, AgentScheduleDefinition } from '../types/domain'
import PageHeader from '../components/base/PageHeader.vue'
import BaseButton from '../components/base/BaseButton.vue'
import LoadError from '../components/base/LoadError.vue'
import { ICONS } from '../icons'
import { useAlert } from '../composables/useAlert'
import { errorMessage } from '../utils/errors'

const agentStore = useAgentStore()
const alert = useAlert()
/** Store actions already toast their failure; the view only needs to stop here. */
const quietly = (promise: Promise<unknown>) => promise.catch(() => undefined)
const siteStore = useSiteStore()
const profileStore = useProfileStore()
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
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const schedule = reactive({
  kind: 'daily' as 'once' | 'daily' | 'weekly' | 'monthly',
  dateTime: '',
  time: '09:00',
  days: '1',
  timeZone: browserTimeZone,
})

const selected = computed(() => agents.value.find(agent => agent.id === selectedId.value))
const parsedManifest = computed<AgentManifest | null>(() => {
  try {
    const parsed: unknown = JSON.parse(manifestText.value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AgentManifest) : null
  } catch {
    return null
  }
})
const variables = computed(() => parsedManifest.value?.variables ?? [])
const usesSiteTools = computed(() =>
  (parsedManifest.value?.steps ?? []).some(step => Array.isArray(step.tools) && step.tools.length > 0),
)
const renderedOutput = computed(() => renderValue(output.value))
const renderedRunDetailsOutput = computed(() => renderValue(runDetails.value?.output))
const renderedRunTranscript = computed(() =>
  runDetails.value?.transcript?.length
    ? `\`\`\`json\n${JSON.stringify(runDetails.value.transcript, null, 2)}\n\`\`\``
    : '',
)
const runDetailsError = computed(() => {
  const error = runDetails.value?.error
  if (!error) return ''
  return typeof error === 'string' ? error : (error.message ?? JSON.stringify(error))
})

const loadError = ref('')

async function loadAgents() {
  loadError.value = ''
  try {
    await Promise.all([agentStore.loadAgents(), siteStore.getSitesIfRequired()])
  } catch (error) {
    loadError.value = errorMessage(error, 'Agents could not be loaded.')
    return
  }
  if (!selectedId.value && agents.value[0]) selectAgent(agents.value[0])
}

/** Schedules default to the time zone saved in the user's profile (Settings → Profile), like analytics. */
async function applyProfileTimeZone() {
  try {
    await profileStore.ensureProfile()
  } catch {
    return
  }
  const saved = profileStore.user?.attributes?.timeZone
  if (saved && schedule.timeZone === browserTimeZone) schedule.timeZone = saved
}

onMounted(() => {
  void loadAgents()
  void applyProfileTimeZone()
})

watch(selectedId, async id => {
  if (!id) return
  try {
    await Promise.all([agentStore.loadRuns(id), agentStore.loadSchedules(id)])
  } catch (error) {
    alert.add({ message: errorMessage(error, 'Runs could not be loaded.'), type: 'error', timeout: 5000 })
  }
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
    variableValues[variable.key] =
      variable.value == null
        ? ''
        : typeof variable.value === 'string'
          ? variable.value
          : JSON.stringify(variable.value)
  }
}

function variableOverrides() {
  return variables.value
    .filter(variable => variableValues[variable.key] !== '')
    .map(variable => ({
      key: variable.key,
      value: parseVariable(variable.type, variableValues[variable.key]),
    }))
}

async function save() {
  if (!parsedManifest.value) return
  saving.value = true
  try {
    const agent = await agentStore.saveAgent(selectedId.value || undefined, parsedManifest.value)
    selectAgent(agent)
  } catch {
    // saveAgent has shown the error.
  } finally {
    saving.value = false
  }
}

const deleteDialog = ref(false)
const deleting = ref(false)

async function remove() {
  if (!selected.value) return
  deleting.value = true
  try {
    await agentStore.removeAgent(selected.value.id)
    deleteDialog.value = false
    newAgent()
  } catch {
    // removeAgent has shown the error; the dialog stays open for a retry.
  } finally {
    deleting.value = false
  }
}

async function run() {
  if (!selected.value) return
  let variablesInput: ReturnType<typeof variableOverrides>
  try {
    variablesInput = variableOverrides()
  } catch (error) {
    alert.add({
      message: errorMessage(error, 'An input value is not valid JSON.'),
      type: 'error',
      timeout: 5000,
    })
    return
  }
  await quietly(
    agentStore.runAgent(selected.value.id, {
      variables: variablesInput,
      ...(siteId.value ? { siteId: siteId.value } : {}),
    }),
  )
}

async function createSchedule() {
  if (!selected.value) return
  let definition: AgentScheduleDefinition
  try {
    definition = scheduleDefinition()
  } catch (error) {
    alert.add({ message: errorMessage(error, 'The schedule is incomplete.'), type: 'error', timeout: 5000 })
    return
  }
  await quietly(
    agentStore.createSchedule(selected.value.id, {
      definition,
      variables: variableOverrides(),
      ...(siteId.value ? { siteId: siteId.value } : {}),
      enabled: true,
    }),
  )
}

/** Deleting a schedule stops future runs, so it asks first. */
const scheduleToDelete = ref<AgentSchedule | null>(null)
const deletingSchedule = ref(false)

async function confirmDeleteSchedule() {
  if (!scheduleToDelete.value) return
  deletingSchedule.value = true
  try {
    await agentStore.removeSchedule(scheduleToDelete.value)
    scheduleToDelete.value = null
  } catch {
    // removeSchedule has shown the error.
  } finally {
    deletingSchedule.value = false
  }
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
    return {
      kind: 'weekly',
      time: schedule.time,
      timeZone: schedule.timeZone,
      daysOfWeek: numberList(schedule.days),
    }
  }
  if (schedule.kind === 'monthly') {
    return {
      kind: 'monthly',
      time: schedule.time,
      timeZone: schedule.timeZone,
      daysOfMonth: numberList(schedule.days),
    }
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
  return [
    ...new Set(
      value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(Number.isInteger),
    ),
  ]
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

/** Warning (amber) is a fill colour: as text over its own tint it is ~2:1, so it is never tonal. */
function runStatusVariant(status?: AgentRun['status']) {
  return runStatusColor(status) === 'warning' ? 'flat' : 'tonal'
}

function siteName(id?: string | null) {
  return sites.value.find(site => site.id === id)?.name ?? (id || 'No Site')
}
</script>

<template>
  <div class="agents-view pa-5">
    <PageHeader title="Agents" visible>
      <template #actions>
        <BaseButton text="New agent" :prepend-icon="ICONS.add" @click="newAgent" />
      </template>
    </PageHeader>
    <p class="text-medium-emphasis mt-n2 mb-5">
      Create focused prompt agents that can read content from a Site.
    </p>

    <!-- Only once the server has answered: before that the state is unknown, not "not configured". -->
    <VAlert v-if="runtimeConfigured === false" type="warning" variant="flat" class="mb-4">
      Agents are not configured on the server. Set <code>AI_AGENT_MODEL</code> (or <code>AI_CHAT_MODEL</code>)
      and the provider API key, then restart Clear Ideas.
    </VAlert>

    <VRow>
      <VCol cols="12" md="3">
        <VCard>
          <VCardTitle>Your agents</VCardTitle>
          <VProgressLinear v-if="loading" aria-label="Loading agents" indeterminate />
          <LoadError v-if="loadError" :message="loadError" @retry="loadAgents" />
          <VList v-if="agents.length > 0" nav>
            <VListItem
              v-for="agent in agents"
              :key="agent.id"
              :active="selectedId === agent.id"
              :title="agent.name"
              :subtitle="agent.description"
              prepend-icon="fas fa-robot"
              @click="selectAgent(agent)"
            />
          </VList>
          <!-- Outside the list: an empty VList is still a Tab stop with nothing to act on. -->
          <div v-else-if="!loading && !loadError" class="agents-empty">
            <VListItem nav title="No agents yet" subtitle="Start with the included template." />
          </div>
        </VCard>
      </VCol>

      <VCol cols="12" md="9">
        <VCard class="mb-4">
          <VCardTitle>{{ selected ? selected.name : 'New agent' }}</VCardTitle>
          <VCardText>
            <ManifestEditor v-model="manifestText" :error="!parsedManifest" />
          </VCardText>
          <VCardActions>
            <BaseButton text="Save" :loading="saving" :disabled="!parsedManifest" @click="save" />
            <BaseButton
              v-if="selected"
              text="Delete"
              intent="danger"
              variant="text"
              @click="deleteDialog = true"
            />
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
              <BaseButton
                text="Run agent"
                size="large"
                prepend-icon="fas fa-play"
                :loading="running"
                :disabled="!runtimeConfigured || (usesSiteTools && !siteId)"
                @click="run"
              />
              <span v-if="usesSiteTools && !siteId" class="text-body-2 text-medium-emphasis"
                >Select a Site to run this agent.</span
              >
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
                <VSelect
                  v-model="schedule.kind"
                  :items="['once', 'daily', 'weekly', 'monthly']"
                  label="Frequency"
                />
              </VCol>
              <VCol v-if="schedule.kind === 'once'" cols="12" sm="4">
                <VTextField v-model="schedule.dateTime" type="datetime-local" label="Run at" />
              </VCol>
              <VCol v-else cols="12" sm="3">
                <VTextField v-model="schedule.time" type="time" label="Time" />
              </VCol>
              <VCol v-if="schedule.kind === 'weekly' || schedule.kind === 'monthly'" cols="12" sm="3">
                <VTextField
                  v-model="schedule.days"
                  :label="schedule.kind === 'weekly' ? 'Weekdays (1–7)' : 'Month days (1–31)'"
                  hint="Comma-separated"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" sm="4">
                <VTextField v-model="schedule.timeZone" label="Time zone" />
              </VCol>
            </VRow>
            <div class="schedule-actions">
              <BaseButton
                text="Create schedule"
                intent="secondary"
                prepend-icon="fas fa-clock"
                :disabled="usesSiteTools && !siteId"
                @click="createSchedule"
              />
            </div>
          </VCardText>
          <VDivider />
          <VList>
            <VListItem
              v-for="item in schedules"
              :key="item.id"
              :title="item.definition.kind"
              :subtitle="`Next: ${formatDate(item.nextRunAt)}${item.lastError ? ` · ${item.lastError}` : ''}`"
            >
              <template #append>
                <VSwitch
                  :model-value="item.enabled"
                  :aria-label="`Enable ${item.definition.kind} schedule`"
                  hide-details
                  density="compact"
                  @update:model-value="value => quietly(agentStore.setScheduleEnabled(item, Boolean(value)))"
                />
                <BaseButton
                  :icon="ICONS.delete"
                  intent="tertiary"
                  size="small"
                  :aria-label="`Delete ${item.definition.kind} schedule`"
                  tooltip="Delete schedule"
                  @click="scheduleToDelete = item"
                />
              </template>
            </VListItem>
            <VListItem v-if="schedules.length === 0" title="No schedules" />
          </VList>
        </VCard>

        <VCard v-if="selected">
          <VCardTitle>Run history</VCardTitle>
          <VTable>
            <thead>
              <tr>
                <th>Status</th>
                <th>Source</th>
                <th>Started</th>
                <th>Run ID</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
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
                <td>
                  <VChip
                    :color="runStatusColor(item.status)"
                    size="small"
                    :variant="runStatusVariant(item.status)"
                    >{{ item.status }}</VChip
                  >
                </td>
                <td>{{ item.source }}</td>
                <td>{{ formatDate(item.createdAt) }}</td>
                <td>
                  <code>{{ item.runId }}</code>
                </td>
                <td class="run-history__actions">
                  <BaseButton
                    text="View"
                    intent="tertiary"
                    size="small"
                    prepend-icon="fas fa-eye"
                    @click.stop="openRunDetails(item)"
                  />
                  <BaseButton
                    v-if="item.status === 'failed' || item.status === 'suspended'"
                    text="Resume"
                    intent="tertiary"
                    size="small"
                    :loading="running"
                    @click.stop="quietly(agentStore.resumeRun(item))"
                  />
                </td>
              </tr>
              <tr v-if="runs.length === 0">
                <td colspan="5" class="text-medium-emphasis">No runs yet.</td>
              </tr>
            </tbody>
          </VTable>
        </VCard>
      </VCol>
    </VRow>

    <BaseDialog
      v-model="deleteDialog"
      max-width="480"
      title="Delete agent"
      confirm-text="Delete"
      confirm-intent="danger"
      :loading="deleting"
      @confirm="remove"
    >
      <VCardText> Delete “{{ selected?.name }}”? Run history will be kept. </VCardText>
    </BaseDialog>
    <BaseDialog
      :model-value="scheduleToDelete !== null"
      max-width="480"
      title="Delete schedule"
      confirm-text="Delete"
      confirm-intent="danger"
      :loading="deletingSchedule"
      @update:model-value="value => !value && (scheduleToDelete = null)"
      @confirm="confirmDeleteSchedule"
    >
      <VCardText
        >Delete this {{ scheduleToDelete?.definition.kind }} schedule? Future runs are cancelled.</VCardText
      >
    </BaseDialog>

    <BaseDialog
      v-model="runDetailsDialog"
      max-width="880"
      scrollable
      title="Run details"
      @close="closeRunDetails"
      @after-leave="agentStore.clearRunDetails"
    >
      <template #title>
        <div>Run details</div>
        <code v-if="runDetails" class="text-body-2 text-medium-emphasis">{{ runDetails.runId }}</code>
      </template>
      <VProgressLinear aria-label="Loading run details" v-if="loadingRunDetails" indeterminate />
      <VCardText v-if="runDetails" class="run-details__content">
        <div class="run-details__meta">
          <div class="run-detail-stat">
            <span>Status</span>
            <VChip
              :color="runStatusColor(runDetails.status)"
              size="small"
              :variant="runStatusVariant(runDetails.status)"
              >{{ runDetails.status }}</VChip
            >
          </div>
          <div class="run-detail-stat">
            <span>Source</span><strong>{{ runDetails.source }}</strong>
          </div>
          <div class="run-detail-stat">
            <span>Site</span><strong>{{ siteName(runDetails.siteId) }}</strong>
          </div>
          <div class="run-detail-stat">
            <span>Started</span><strong>{{ formatDate(runDetails.createdAt) }}</strong>
          </div>
          <div class="run-detail-stat">
            <span>Updated</span><strong>{{ formatDate(runDetails.updatedAt) }}</strong>
          </div>
          <div class="run-detail-stat">
            <span>Agent revision</span><strong>{{ runDetails.agentRevision }}</strong>
          </div>
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
    </BaseDialog>
  </div>
</template>

<style scoped>
.agents-empty {
  padding: 8px;
}

.agents-view {
  height: 100%;
  overflow-y: auto;
}

.run-card__content {
  padding-top: 8px;
}

.run-section + .run-section {
  margin-top: 28px;
}

.run-section__heading {
  margin-bottom: 14px;
}

.run-section__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 18px;
  text-transform: uppercase;
}

.run-fields {
  display: grid;
  gap: 16px;
}

.run-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.agent-output {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgb(var(--v-theme-surface-variant));
}

.schedule-card__content {
  padding-top: 8px;
}

.schedule-fields {
  margin-bottom: 0;
}

.schedule-actions {
  display: flex;
  align-items: center;
  padding-top: 16px;
}

.run-history__row {
  cursor: pointer;
  transition: background-color 120ms ease;
}

.run-history__row:hover,
.run-history__row:focus-visible {
  background: rgba(var(--v-theme-primary), 0.06);
  outline: none;
}

.run-history__actions {
  min-width: 116px;
  text-align: right;
  white-space: nowrap;
}

.run-details__content {
  display: grid;
  gap: 24px;
  padding: 8px 24px 28px;
}

.run-details__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.run-detail-stat {
  display: flex;
  min-height: 72px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.run-detail-stat > span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
}

.run-detail-stat > strong {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 600;
}

.run-details__section {
  padding-top: 4px;
}

.run-details__output {
  padding: 18px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.run-details__transcript {
  margin-top: -4px;
}

code {
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .agents-view {
    padding: 16px;
  }

  .run-section + .run-section {
    margin-top: 24px;
  }

  .run-details__meta {
    grid-template-columns: 1fr;
  }

  .run-history__actions {
    min-width: auto;
  }
}
</style>
