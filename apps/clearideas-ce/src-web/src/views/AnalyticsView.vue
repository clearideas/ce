<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dashboard from '../components/analytics/Dashboard.vue'
import AnalyticsTableReport from '../components/analytics/AnalyticsTableReport.vue'
import NewSite from '../components/sites/actions/NewSite.vue'
import { useAnalyticsStore, useProfileStore, type AnalyticsFilter } from '../stores'
import { useDisplay } from 'vuetify'

type AnalyticsCategory = 'dashboard' | 'most-accessed' | 'content-activity' | 'most-active' | 'usage-times'

const route = useRoute()
const router = useRouter()
const analyticsStore = useAnalyticsStore()
const profileStore = useProfileStore()
const { smAndDown } = useDisplay()
const category = ref<AnalyticsCategory>('dashboard')
const dashboardData = ref<Record<string, any> | null>(null)
const rows = ref<Record<string, any>[]>([])
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
  { title: 'Dashboard', icon: 'fasl fa-chart-line', category: 'dashboard' },
  { heading: 'Content' },
  { title: 'Most accessed', icon: 'fasl fa-file', category: 'most-accessed' },
  { title: 'Content activity', icon: 'fasl fa-chart-simple', category: 'content-activity' },
  { heading: 'Users' },
  { title: 'Most active', icon: 'fasl fa-users', category: 'most-active' },
  { heading: 'Engagement' },
  { title: 'Usage times', icon: 'fasl fa-clock', category: 'usage-times' },
] as const

const reportTitle = computed(() => {
  if (category.value === 'most-active') return 'Most active users'
  if (category.value === 'content-activity') return 'Content activity'
  if (category.value === 'usage-times') return 'Usage times'
  return 'Most accessed content'
})

const reportSubtitle = computed(() => {
  if (category.value === 'most-active') return 'Users with the most activity in the selected period.'
  if (category.value === 'content-activity') return 'Counts by action across accessible sites.'
  if (category.value === 'usage-times') return 'Activity grouped by hour of day.'
  return 'Content with the most views in the selected period.'
})
const availableSitesCount = computed(() => Number(dashboardData.value?.totalOwnedOrAdministeredSites ?? dashboardData.value?.totalSites ?? 0))
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
    if (category.value === 'most-active') rows.value = (await analyticsStore.mostActive(analyticsFilter.value)).rows
    else if (category.value === 'content-activity') rows.value = (await analyticsStore.contentActivity(analyticsFilter.value)).rows
    else if (category.value === 'usage-times') rows.value = (await analyticsStore.usageTimes(analyticsFilter.value)).rows
    else rows.value = (await analyticsStore.mostAccessed(analyticsFilter.value)).rows
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load analytics'
  } finally {
    ready.value = true
  }
}

function syncCategoryFromRoute() {
  const routeCategory = Array.isArray(route.params.category) ? route.params.category[0] : route.params.category
  const valid = menu.some(item => 'category' in item && item.category === routeCategory)
  category.value = valid ? routeCategory as AnalyticsCategory : 'dashboard'
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

watch(() => route.params.category, async () => {
  syncCategoryFromRoute()
  await refresh()
})

onMounted(async () => {
  syncCategoryFromRoute()
  await refresh()
})
</script>

<template>
  <div class="analytics-view">
    <div class="settings analytics-shell mobile-collapsible">
      <div class="settings-left settings-menu-pane">
        <VList nav density="compact" open-strategy="single" class="layout-vertical-nav rounded" bg-color="transparent">
          <template v-for="item in menu" :key="'category' in item ? item.category : item.heading">
            <VListSubheader v-if="'heading' in item" class="text-uppercase text-disabled">{{ item.heading }}</VListSubheader>
            <VListItem
              v-else
              v-tippy="smAndDown ? { content: item.title, placement: 'right' } : null"
              :active="category === item.category"
              @click="selectCategory(item.category)"
            >
              <template #prepend><VIcon :icon="item.icon" /></template>
              <template #title>{{ item.title }}</template>
            </VListItem>
          </template>
        </VList>
      </div>

      <div class="settings-right analytics-content">
        <div class="settings-content-viewport">
          <div class="d-flex flex-column ga-3 settings-content-scroll">
            <VAlert v-if="error" type="error" class="mb-4">{{ error }}</VAlert>
            <div v-else-if="!ready" class="analytics-gate analytics-gate--loading">
              <VProgressCircular indeterminate color="primary" :size="38" :width="3" />
            </div>
            <div v-else-if="showAnalyticsEmptyState" class="analytics-gate analytics-gate--empty">
              <VEmptyState title="Create a site to view analytics" justify="center" class="analytics-empty-state">
                <template #media>
                  <VIcon color="accent-1">fasl fa-home mb-6</VIcon>
                </template>
                <template #text>
                  <p class="text-medium-emphasis analytics-empty-state-copy">
                    Analytics will appear here after you create a site and users begin working with content.
                  </p>
                </template>
                <template #actions>
                  <NewSite color="primary" variant="flat" size="large" text="New site" />
                </template>
              </VEmptyState>
            </div>
            <Dashboard v-else-if="category === 'dashboard'" :initial-data="dashboardData" />
            <AnalyticsTableReport v-else v-model:filter="filter" :title="reportTitle" :subtitle="reportSubtitle" :rows="rows" :loading="analyticsStore.loadingAnalytics" :report="category" @refresh="refresh" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-view {
  width: calc(100% + 16px);
  margin-left: -8px;
  margin-right: -8px;
  padding-left: 8px;
  padding-right: 8px;
  box-sizing: border-box;
  overflow: visible;
}

.analytics-shell {
  width: 100%;
}

.analytics-content {
  min-width: 0;
}

.analytics-content :deep(.v-card-title) {
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

.analytics-empty-state-copy {
  max-width: 34rem;
}

@media (max-width: 900px) {
  .analytics-shell {
    flex-direction: row;
  }

  .settings-left {
    flex: 0 0 56px;
    max-width: 56px;
    width: 56px;
  }

  .analytics-content {
    flex: 1 1 auto;
    min-width: 0;
  }
}
</style>
