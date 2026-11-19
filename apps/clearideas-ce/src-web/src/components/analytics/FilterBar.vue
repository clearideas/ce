<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSiteStore } from '../../stores'
import { ICONS } from '../../icons'
import BaseButton from '../base/BaseButton.vue'
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
  actions: () => [
    'viewed',
    'file-viewed',
    'file-downloaded',
    'file-uploaded',
    'folder-created',
    'content-deleted',
    'content-searched',
  ],
  limits: () => [10, 25, 50],
  defaultLimit: 10,
  isRefreshing: false,
  actionPresets: () => [],
})

const emit = defineEmits<{ refresh: [] }>()

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

const siteStore = useSiteStore()
const { sites } = storeToRefs(siteStore)

const siteItems = computed(() =>
  sites.value
    .filter(site => ['owner', 'admin'].includes(site.currentUserRole ?? ''))
    .map(site => ({ title: site.name, value: site.id })),
)
const allActionValues = computed(() => props.actions)
const normalizedSelectedActions = computed(() =>
  (filter.value.actions || []).filter(action => allActionValues.value.includes(action)),
)
const areAllActionsSelected = computed(
  () =>
    allActionValues.value.length > 0 &&
    normalizedSelectedActions.value.length === allActionValues.value.length,
)
const selectedPreset = computed(() =>
  props.actionPresets.find(preset => preset.actions.join('|') === normalizedSelectedActions.value.join('|')),
)
const actionsDisplayText = computed(() => {
  if (!filter.value.actions || filter.value.actions.length === 0 || areAllActionsSelected.value)
    return 'All actions'
  if (selectedPreset.value) return selectedPreset.value.label
  return `${filter.value.actions.length} actions`
})

const actionItems = computed(() => allActionValues.value.map(value => ({ title: actionLabel(value), value })))

function setActions(actions: string[]) {
  filter.value = { ...filter.value, actions }
}

function selectAllActions() {
  filter.value = { ...filter.value, actions: [] }
}

function selectActionPreset(preset: ActionPreset) {
  filter.value = { ...filter.value, actions: [...preset.actions] }
}

function actionLabel(action: string) {
  return action
    .split('-')
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

onMounted(async () => {
  await siteStore.getSitesIfRequired()
  if ((filter.value.actions?.length ?? 0) === 0 && props.defaultActions)
    filter.value.actions = [...props.defaultActions]
  if (!filter.value.limit && props.defaultLimit) filter.value.limit = props.defaultLimit
})

watch(
  allActionValues,
  availableActions => {
    const availableActionSet = new Set(availableActions)
    const sanitizedActions = (filter.value.actions || []).filter(action => availableActionSet.has(action))
    if (sanitizedActions.length !== (filter.value.actions || []).length) {
      filter.value = {
        ...filter.value,
        actions: sanitizedActions.length > 0 ? sanitizedActions : [...(props.defaultActions ?? [])],
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="filter-bar">
    <div v-if="displaySites" class="item filter-control item--sites">
      <div class="filter-control__label">Sites</div>
      <VSelect
        v-model="filter.sites"
        aria-label="Sites"
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
          <template #prepend-inner><VIcon icon="fas fa-calendar" color="secondary" /></template>
        </VTextField>
        <VTextField v-model="filter.endDate" type="date" variant="outlined" aria-label="End date" />
      </div>
    </div>

    <div v-if="props.displayLimit" class="item item--limit filter-control">
      <div class="filter-control__label">Limit</div>
      <VSelect
        v-model="filter.limit"
        aria-label="Limit"
        variant="outlined"
        class="filter-control__field"
        :items="props.limits"
      >
        <template #prepend-inner><VIcon icon="fas fa-arrow-down-wide-short" color="secondary" /></template>
      </VSelect>
    </div>

    <div v-if="displayActions" class="item item--actions filter-control">
      <div class="filter-control__label">Actions</div>
      <VSelect
        :model-value="normalizedSelectedActions"
        :items="actionItems"
        multiple
        aria-label="Actions"
        placeholder="All actions"
        persistent-placeholder
        variant="outlined"
        class="filter-control__field"
        menu-icon="fas fa-chevron-down"
        :menu-props="{ maxHeight: 350, maxWidth: 300 }"
        @update:model-value="setActions"
      >
        <template #prepend-inner><VIcon icon="fas fa-list-check" color="secondary" /></template>
        <template #selection="{ index }">
          <span v-if="index === 0">{{ actionsDisplayText }}</span>
        </template>
        <template #prepend-item>
          <VListItem
            :active="normalizedSelectedActions.length === 0 || areAllActionsSelected"
            prepend-icon="fas fa-circle-check"
            title="All actions"
            @click="selectAllActions"
          />
          <VListItem
            v-for="preset in props.actionPresets"
            :key="preset.label"
            :active="selectedPreset?.label === preset.label"
            prepend-icon="fas fa-wand-magic-sparkles"
            :title="preset.label"
            @click="selectActionPreset(preset)"
          />
          <VDivider aria-hidden="true" class="my-2" />
        </template>
      </VSelect>
    </div>

    <div v-if="props.displayRefresh" cols="auto" class="item filter-control filter-control--action">
      <div class="filter-control__label filter-control__label--visually-hidden">Refresh</div>
      <BaseButton
        :icon="ICONS.refresh"
        intent="tertiary"
        color="primary"
        size="small"
        slim
        tooltip="Refresh"
        aria-label="Refresh report"
        :loading="isRefreshing"
        class="filter-refresh-btn"
        @click="emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
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
