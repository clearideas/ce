<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dashboard from '../components/analytics/Dashboard.vue'
import AnalyticsTableReport from '../components/analytics/AnalyticsTableReport.vue'
import EmptyState from '../components/base/EmptyState.vue'
import NewSite from '../components/sites/actions/NewSite.vue'
import { ICONS } from '../icons'
import { useAnalyticsStore, useProfileStore, type AnalyticsFilter } from '../stores'
import type { AnalyticsDashboardData, AnalyticsRow } from '../stores/analytics.store'
import PageHeader from '../components/base/PageHeader.vue'
import SideNavLayout, { type SideNavItem } from '../components/base/SideNavLayout.vue'

type AnalyticsCategory =
  'dashboard' | 'most-accessed' | 'content-activity' | 'search-terms' | 'most-active' | 'usage-times'

const route = useRoute()
const router = useRouter()
const analyticsStore = useAnalyticsStore()
const profileStore = useProfileStore()
const category = ref<AnalyticsCategory>('dashboard')
const dashboardData = ref<AnalyticsDashboardData | null>(null)
const rows = ref<AnalyticsRow[]>([])
const error = ref('')
const ready = ref(false)
const filter = ref<AnalyticsFilter>({
  sites: [],
  actions: [],
  startDate: thirtyDaysAgoInput(),
  endDate: todayInput(),
  limit: 10,
})
const analyticsFilter = computed<AnalyticsFilter>(() => ({
  ...filter.value,
  timeZone: profileStore.user?.attributes?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
}))

const menu = [
  { title: 'Dashboard', icon: 'fas fa-chart-line', category: 'dashboard' },
  { heading: 'Content' },
  { title: 'Most accessed', icon: 'fas fa-file', category: 'most-accessed' },
  { title: 'Content activity', icon: 'fas fa-chart-simple', category: 'content-activity' },
  { title: 'Search terms', icon: 'fas fa-magnifying-glass', category: 'search-terms' },
  { heading: 'Users' },
  { title: 'Most active', icon: 'fas fa-users', category: 'most-active' },
  { heading: 'Engagement' },
  { title: 'Usage times', icon: 'fas fa-clock', category: 'usage-times' },
] as const

const navItems: SideNavItem[] = menu.map(item =>
  'heading' in item
    ? { heading: item.heading }
    : {
        key: item.category,
        label: item.title,
        icon: item.icon,
        href: router.resolve({ name: 'analytics-category', params: { category: item.category } }).href,
      },
)

const reportTitle = computed(() => {
  if (category.value === 'most-active') return 'Most active users'
  if (category.value === 'content-activity') return 'Content activity'
  if (category.value === 'search-terms') return 'Search terms'
  if (category.value === 'usage-times') return 'Usage times'
  return 'Most accessed content'
})

const reportSubtitle = computed(() => {
  if (category.value === 'most-active') return 'Users with the most activity in the selected period.'
  if (category.value === 'content-activity') return 'Counts by action across accessible sites.'
  if (category.value === 'search-terms')
    return 'What people searched for in the sites you administer. Global searches are attributed only to the sites where they matched.'
  if (category.value === 'usage-times') return 'Activity grouped by hour of day.'
  return 'Content with the most views in the selected period.'
})
const availableSitesCount = computed(() =>
  Number(dashboardData.value?.totalOwnedOrAdministeredSites ?? dashboardData.value?.totalSites ?? 0),
)
const showAnalyticsEmptyState = computed(() => ready.value && !error.value && availableSitesCount.value === 0)

async function selectCategory(next: AnalyticsCategory) {
  if (category.value === next) return
  await router.push({ name: 'analytics-category', params: { category: next } })
}

async function refresh() {
  error.value = ''
  ready.value = false
  try {
    const summary = await analyticsStore.dashboard(analyticsFilter.value)
    dashboardData.value = summary
    if (Number(summary?.totalOwnedOrAdministeredSites ?? summary?.totalSites ?? 0) === 0) {
      rows.value = []
      return
    }
    if (category.value === 'dashboard') {
      rows.value = []
      return
    }
    if (category.value === 'most-active')
      rows.value = (await analyticsStore.mostActive(analyticsFilter.value)).rows
    else if (category.value === 'content-activity')
      rows.value = (await analyticsStore.contentActivity(analyticsFilter.value)).rows
    else if (category.value === 'search-terms')
      rows.value = (await analyticsStore.searchTerms(analyticsFilter.value)).rows
    else if (category.value === 'usage-times')
      rows.value = (await analyticsStore.usageTimes(analyticsFilter.value)).rows
    else rows.value = (await analyticsStore.mostAccessed(analyticsFilter.value)).rows
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load analytics'
  } finally {
    ready.value = true
  }
}

function syncCategoryFromRoute() {
  const routeCategory = Array.isArray(route.params.category)
    ? route.params.category[0]
    : route.params.category
  const valid = menu.some(item => 'category' in item && item.category === routeCategory)
  category.value = valid ? (routeCategory as AnalyticsCategory) : 'dashboard'
}

function todayInput() {
  return toDateInput(new Date())
}

function thirtyDaysAgoInput() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return toDateInput(date)
}

function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

watch(
  () => route.params.category,
  async () => {
    syncCategoryFromRoute()
    await refresh()
  },
)

onMounted(async () => {
  syncCategoryFromRoute()
  // Queries are bucketed by the user's saved time zone; do not send the first one without it.
  await profileStore.ensureProfile().catch(() => undefined)
  await refresh()
})
</script>

<template>
  <div class="analytics-view page-bleed">
    <PageHeader
      :title="category === 'dashboard' ? 'Analytics' : `Analytics: ${reportTitle}`"
      document-title="Analytics"
    />
    <SideNavLayout
      class="analytics-shell"
      :items="navItems"
      :model-value="category"
      label="Analytics reports"
      @update:model-value="key => selectCategory(key as AnalyticsCategory)"
    >
      <VAlert v-if="error" type="error" class="mb-4">{{ error }}</VAlert>
      <div v-else-if="!ready" class="analytics-gate analytics-gate--loading">
        <VProgressCircular
          aria-label="Loading analytics"
          indeterminate
          color="primary"
          :size="38"
          :width="3"
        />
      </div>
      <div v-else-if="showAnalyticsEmptyState" class="analytics-gate analytics-gate--empty">
        <EmptyState
          :icon="ICONS.analytics"
          title="Create a site to view analytics"
          text="Analytics will appear here after you create a site and users begin working with content."
        >
          <template #actions>
            <NewSite text="New site" />
          </template>
        </EmptyState>
      </div>
      <Dashboard v-else-if="category === 'dashboard'" :initial-data="dashboardData" />
      <AnalyticsTableReport
        v-else
        v-model:filter="filter"
        :title="reportTitle"
        :subtitle="reportSubtitle"
        :rows="rows"
        :loading="analyticsStore.loadingAnalytics"
        :report="category"
        @refresh="refresh"
      />
    </SideNavLayout>
  </div>
</template>

<style scoped>
.analytics-view {
  overflow: visible;
}

.analytics-shell {
  width: 100%;
}

.analytics-shell :deep(.v-card-title) {
  font-weight: 600;
}

.analytics-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  flex: 1 1 auto;
  padding: 16px 0 12px;
}
</style>
