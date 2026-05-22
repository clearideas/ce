<script setup lang="ts">
import { computed } from 'vue'
import { DateTime } from 'luxon'
import prettyBytes from 'pretty-bytes'
import FilterBar from './FilterBar.vue'
import UsageTimesBars from './UsageTimesBars.vue'
import { useAnalyticsStore, type AnalyticsFilter } from '../../stores/analytics.store'

const props = withDefaults(defineProps<{
  title: string
  subtitle: string
  rows: Record<string, any>[]
  loading?: boolean
  report: 'most-accessed' | 'most-active' | 'content-activity' | 'usage-times'
}>(), {
  loading: false,
})

const filter = defineModel<AnalyticsFilter>('filter', { required: true })
const emit = defineEmits<{ refresh: [] }>()
const analyticsStore = useAnalyticsStore()

const actionPresets = [
  { label: 'Viewing', actions: ['viewed', 'file-viewed'] },
  { label: 'Content changes', actions: ['uploaded', 'created', 'deleted'] },
]

const headers = computed(() => {
  if (props.report === 'most-active') return [
    { title: 'User', key: 'name' },
    { title: 'Email', key: 'email' },
    { title: 'Activity', key: 'viewCount', align: 'end' as const },
    { title: 'Last active', key: 'lastActive' },
  ]
  if (props.report === 'content-activity') return [
    { title: 'Action', key: 'name' },
    { title: 'Count', key: 'count', align: 'end' as const },
  ]
  if (props.report === 'usage-times') return [
    { title: 'Hour', key: 'name' },
    { title: 'Activity', key: 'count', align: 'end' as const },
  ]
  return [
    { title: 'Name', key: 'name' },
    { title: 'Site', key: 'siteName' },
    { title: 'Size', key: 'size', align: 'end' as const },
    { title: 'Views', key: 'viewCount', align: 'end' as const },
    { title: 'Last viewed', key: 'lastViewedAt' },
  ]
})

function formatRelative(value: unknown) {
  if (typeof value !== 'string' && !(value instanceof Date)) return ''
  const date = typeof value === 'string' ? DateTime.fromISO(value) : DateTime.fromJSDate(value)
  return date.isValid ? date.toRelative() : ''
}
</script>

<template>
  <VCard variant="outlined" class="analytics-card">
    <VCardTitle>{{ props.title }}</VCardTitle>
    <VCardSubtitle>{{ props.subtitle }}</VCardSubtitle>
    <VCardText>
      <FilterBar v-model:filter="filter" :is-refreshing="props.loading" :display-actions="props.report !== 'usage-times'" :display-limit="props.report !== 'usage-times'" :action-presets="actionPresets" @refresh="emit('refresh')" />
      <UsageTimesBars v-if="props.report === 'usage-times'" :rows="props.rows" :loading="props.loading" />
      <VDataTable v-else :headers="headers" :items="props.rows" :loading="props.loading" item-value="id" class="content-list-table" hide-default-footer>
        <template #item.name="{ item }">
          <div class="d-flex align-center ga-2">
            <VIcon :icon="props.report === 'most-active' ? 'fasl fa-user' : props.report === 'content-activity' ? 'fasl fa-bolt' : props.report === 'usage-times' ? 'fasl fa-clock' : 'fasl fa-file'" color="secondary" size="small" />
            <span>{{ item.name }}</span>
          </div>
        </template>
        <template #item.size="{ item }"><span class="text-secondary">{{ item.size || item.size === 0 ? prettyBytes(item.size) : '' }}</span></template>
        <template #item.viewCount="{ item }"><span class="text-secondary">{{ Number(item.viewCount ?? 0).toLocaleString() }}</span></template>
        <template #item.count="{ item }"><span class="text-secondary">{{ Number(item.count ?? 0).toLocaleString() }}</span></template>
        <template #item.lastViewedAt="{ item }"><span class="text-secondary">{{ formatRelative(item.lastViewedAt) }}</span></template>
        <template #item.lastActive="{ item }"><span class="text-secondary">{{ formatRelative(item.lastActive) }}</span></template>
        <template #bottom><div /></template>
        <template #no-data>
          <VEmptyState title="No analytics yet" text="Activity will appear here once users work with sites and content.">
            <template #media><VIcon icon="fasl fa-chart-line" color="accent-1" /></template>
          </VEmptyState>
        </template>
      </VDataTable>
    </VCardText>
  </VCard>
</template>

<style scoped>
.analytics-card {
  width: 100%;
}
</style>
