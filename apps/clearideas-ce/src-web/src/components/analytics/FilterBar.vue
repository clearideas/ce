<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSiteStore } from '../../stores'
import type { AnalyticsFilter } from '../../stores/analytics.store'

type ActionPreset = {
  label: string
  actions: string[]
}

interface Props {
  displayActions?: boolean
  displayLimit?: boolean
  displaySites?: boolean
  displayRefresh?: boolean
  actions?: string[]
  defaultActions?: string[]
  limits?: number[]
  defaultLimit?: number
  isRefreshing?: boolean
  actionPresets?: ActionPreset[]
}

const props = withDefaults(defineProps<Props>(), {
  displayActions: true,
  displayLimit: true,
  displaySites: true,
  displayRefresh: true,
  actions: () => ['viewed', 'file-viewed', 'downloaded', 'uploaded', 'created', 'deleted'],
  limits: () => [10, 25, 50],
  defaultLimit: 10,
  isRefreshing: false,
  actionPresets: () => [],
})

const filter = defineModel<AnalyticsFilter>('filter', {
  type: Object,
  default: () => ({
    sites: [],
    actions: [],
    startDate: undefined,
    endDate: undefined,
    limit: 10,
  }),
})

const emit = defineEmits<{ refresh: [] }>()
const siteStore = useSiteStore()
const { sites } = storeToRefs(siteStore)
const showActionsDropdown = ref(false)

const siteItems = computed(() =>
  sites.value
    .filter(site => ['owner', 'admin'].includes(site.currentUserRole ?? ''))
    .map(site => ({ title: site.name, value: site.id })),
)
const allActionValues = computed(() => props.actions)
const normalizedSelectedActions = computed(() => (filter.value.actions || []).filter(action => allActionValues.value.includes(action)))
const areAllActionsSelected = computed(() => allActionValues.value.length > 0 && normalizedSelectedActions.value.length === allActionValues.value.length)
const selectedPreset = computed(() => props.actionPresets.find(preset => preset.actions.join('|') === normalizedSelectedActions.value.join('|')))
const actionsDisplayText = computed(() => {
  if (!filter.value.actions || filter.value.actions.length === 0 || areAllActionsSelected.value) return 'All actions'
  if (selectedPreset.value) return selectedPreset.value.label
  return `${filter.value.actions.length} actions`
})

function toggleAction(actionValue: string) {
  if (!filter.value.actions || filter.value.actions.length === 0 || areAllActionsSelected.value || selectedPreset.value) {
    filter.value = { ...filter.value, actions: [actionValue] }
    return
  }

  const index = normalizedSelectedActions.value.indexOf(actionValue)
  filter.value = {
    ...filter.value,
    actions: index > -1 ? normalizedSelectedActions.value.filter(action => action !== actionValue) : [...normalizedSelectedActions.value, actionValue],
  }
}

function isActionSelected(actionValue: string) {
  return normalizedSelectedActions.value.includes(actionValue)
}

function selectAllActions() {
  filter.value = { ...filter.value, actions: [] }
}

function selectActionPreset(preset: ActionPreset) {
  filter.value = { ...filter.value, actions: [...preset.actions] }
}

function actionLabel(action: string) {
  return action.split('-').filter(Boolean).map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ')
}

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function thirtyDaysAgoInput() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}

onMounted(async () => {
  await siteStore.getSitesIfRequired()
  if ((filter.value.actions?.length ?? 0) === 0 && props.defaultActions) filter.value.actions = [...props.defaultActions]
  if (!filter.value.limit && props.defaultLimit) filter.value.limit = props.defaultLimit
})

watch(allActionValues, availableActions => {
  const availableActionSet = new Set(availableActions)
  const sanitizedActions = (filter.value.actions || []).filter(action => availableActionSet.has(action))
  if (sanitizedActions.length !== (filter.value.actions || []).length) {
    filter.value = { ...filter.value, actions: sanitizedActions.length > 0 ? sanitizedActions : [...(props.defaultActions ?? [])] }
  }
}, { immediate: true })
</script>

<template>
  <div class="filter-bar">
    <div v-if="displaySites" class="item filter-control item--sites">
      <div class="filter-control__label">Sites</div>
      <VSelect
        v-model="filter.sites"
        :items="siteItems"
        item-title="title"
        item-value="value"
        multiple
        chips
        closable-chips
        clearable
        variant="outlined"
        class="filter-control__field"
        placeholder="All sites"
        persistent-placeholder
      />
    </div>

    <div class="item item--date filter-control">
      <div class="filter-control__label">Date range</div>
      <div class="analytics-date-range filter-control__field">
        <VTextField v-model="filter.startDate" type="date" variant="outlined" aria-label="Start date">
          <template #prepend-inner><VIcon icon="fasl fa-calendar" color="secondary" /></template>
        </VTextField>
        <VTextField v-model="filter.endDate" type="date" variant="outlined" aria-label="End date" />
      </div>
    </div>

    <div v-if="props.displayLimit" class="item item--limit filter-control">
      <div class="filter-control__label">Limit</div>
      <VSelect v-model="filter.limit" variant="outlined" class="filter-control__field" :items="props.limits">
        <template #prepend-inner><VIcon icon="fasl fa-sort-amount-down" color="secondary" /></template>
      </VSelect>
    </div>

    <div v-if="displayActions" class="item item--actions filter-control">
      <div class="filter-control__label">Actions</div>
      <VMenu v-model="showActionsDropdown" location="bottom start">
        <template #activator="{ props: menuProps }">
          <VTextField :model-value="actionsDisplayText" readonly variant="outlined" class="filter-control__field" v-bind="menuProps">
            <template #prepend-inner><VIcon icon="fasl fa-list-check" color="secondary" /></template>
            <template #append-inner><VIcon icon="fasl fa-chevron-down" color="secondary" /></template>
          </VTextField>
        </template>

        <VList density="compact" max-width="300" max-height="350">
          <VListItem :active="!filter.actions || filter.actions.length === 0 || areAllActionsSelected" @click="selectAllActions">
            <template #prepend><VIcon icon="fasl fa-circle-check" class="fs-14" color="secondary" /></template>
            All actions
          </VListItem>
          <VListItem v-for="preset in props.actionPresets" :key="preset.label" :active="selectedPreset?.label === preset.label" @click="selectActionPreset(preset)">
            <template #prepend><VIcon icon="fasl fa-wand-magic-sparkles" class="fs-14" color="secondary" /></template>
            {{ preset.label }}
          </VListItem>
          <VDivider class="my-2" />
          <VListItem v-for="option in allActionValues" :key="option" :active="isActionSelected(option)" @click="toggleAction(option)">
            <template #prepend><VIcon icon="fasl fa-bolt" class="fs-14" color="secondary" /></template>
            {{ actionLabel(option) }}
            <template #append><VIcon v-if="isActionSelected(option)" icon="fasl fa-check" color="primary" size="14" /></template>
          </VListItem>
        </VList>
      </VMenu>
    </div>

    <div v-if="props.displayRefresh" cols="auto" class="item filter-control filter-control--action">
      <div class="filter-control__label filter-control__label--visually-hidden">Refresh</div>
      <VBtn v-tippy="{ content: 'Refresh', placement: 'top' }" icon="fasl fa-arrows-rotate" :class="{ 'fa-spin': isRefreshing }" variant="text" color="primary" size="small" slim class="filter-refresh-btn" @click="emit('refresh')" />
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 12px;
  margin-bottom: 30px;
}

.filter-control {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 0 1 auto;
  align-items: stretch;
  inline-size: auto;
  max-inline-size: 100%;
}

.item--sites {
  min-width: 14rem;
  width: fit-content;
  --filter-control-max-width: 18rem;
}

.item--date {
  min-width: 20rem;
  width: fit-content;
  --filter-control-max-width: 30rem;
}

.item--actions {
  min-width: 11rem;
  width: fit-content;
  --filter-control-max-width: 14rem;
}

.item--limit {
  min-width: 7rem;
  width: fit-content;
  --filter-control-max-width: 8rem;
}

.item--sites :deep(.v-field__prepend-inner) {
  display: none;
}

.filter-control__label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.filter-control__label--visually-hidden {
  visibility: hidden;
  display: block;
}

.filter-control__field {
  width: auto;
  min-width: 0;
  max-width: min(100%, var(--filter-control-max-width, 32rem));
}

.filter-control :deep(.v-input) {
  width: fit-content;
  min-width: 100%;
  max-width: min(100%, var(--filter-control-max-width, 32rem));
}

.filter-control :deep(.v-field) {
  min-height: 32px;
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 0.72);
  box-shadow: none;
  width: 100%;
}

.filter-control :deep(.v-field__outline) {
  --v-field-border-opacity: calc(var(--v-border-opacity) * 0.8);
}

.filter-control :deep(.v-field__input) {
  min-height: 32px;
  padding-top: 0;
  padding-bottom: 0;
  align-items: center;
  font-size: 0.88rem;
}

.filter-control :deep(.v-field__prepend-inner .v-icon),
.filter-control :deep(.v-field__append-inner .v-icon) {
  opacity: 0.78;
  font-size: 0.95rem;
}

.filter-control :deep(.v-input__details),
.filter-control :deep(.v-field-label) {
  display: none;
}

.filter-control :deep(.v-field__prepend-inner),
.filter-control :deep(.v-field__append-inner) {
  align-items: center;
  padding-top: 0;
}

.filter-control :deep(.v-select__selection),
.filter-control :deep(.v-field__input input) {
  font-size: 0.88rem;
}

.filter-control :deep(.v-select .v-field__input) {
  display: flex;
  align-items: center;
  padding-top: 0;
  padding-bottom: 0;
}

.filter-control :deep(.v-select .v-field__input input) {
  align-self: center;
}

.filter-control :deep(.v-select .v-field__input input::placeholder) {
  opacity: 1;
  line-height: 32px;
}

.item--sites :deep(.v-chip) {
  height: 20px;
}

.item--sites :deep(.v-chip__content) {
  line-height: 20px;
}

.filter-control--action {
  min-width: auto;
  flex: 0 0 auto;
}

.filter-refresh-btn {
  margin-bottom: 2px;
}

.analytics-date-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.analytics-date-range :deep(.v-input) {
  min-width: 9.5rem;
}

@media (max-width: 900px) {
  .filter-control,
  .filter-control__field,
  .filter-control :deep(.v-input) {
    width: 100%;
    max-width: 100%;
  }

  .item--sites,
  .item--date,
  .item--actions,
  .item--limit {
    min-width: min(100%, 14rem);
  }

  .analytics-date-range {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
