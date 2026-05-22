<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import prettyBytes from 'pretty-bytes'
import { useAnalyticsStore } from '../../stores'
import DashboardHorizontalBar from './dashboard/DashboardHorizontalBar.vue'

const props = withDefaults(defineProps<{ initialData?: Record<string, any> | null }>(), {
  initialData: null,
})

const analyticsStore = useAnalyticsStore()
const dashboardData = ref<Record<string, any>>({})
const resolvedDashboardData = computed(() => props.initialData ?? dashboardData.value)
const storageParts = computed(() => prettyBytes(resolvedDashboardData.value.storageSize ?? 0, { space: true }).split(' '))
const totalFiles = computed(() => Number(resolvedDashboardData.value.totalContent ?? 0))
const activeUsers = computed(() => Number(resolvedDashboardData.value.monthlyActiveUsers ?? 0))
const totalSites = computed(() => Number(resolvedDashboardData.value.totalSites ?? 0))

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return value === 1 ? singular : plural
}

onMounted(async () => {
  if (!props.initialData) {
    try {
      dashboardData.value = await analyticsStore.dashboard()
    } catch {
      dashboardData.value = {}
    }
  }
})
</script>

<template>
  <VCard variant="outlined" class="analytics-card">
    <VCardTitle>Analytics dashboard</VCardTitle>
    <VCardText>
      <div class="ci-flex-card-grid dashboard-grid dashboard-grid--charts">
        <div class="ci-flex-card-grid__item">
          <VCard variant="outlined" class="dashboard-item dashboard-card">
            <VCardTitle>Most active content</VCardTitle>
            <VCardSubtitle>Total views in the selected period</VCardSubtitle>
            <VCardText v-if="!analyticsStore.loadingAnalytics">
              <div v-if="resolvedDashboardData.mostAccessedContent?.length > 0" style="height: 300px; width: 100%">
                <DashboardHorizontalBar :data="resolvedDashboardData.mostAccessedContent" />
              </div>
              <VEmptyState v-else title="No active documents" text="Views will appear here as files are opened." style="height: 300px; width: 100%">
                <template #media><VIcon color="accent-1">fasl fa-files mb-6</VIcon></template>
              </VEmptyState>
            </VCardText>
            <VCardText v-else><div :style="{ height: '300px' }" class="d-flex justify-center align-center"><VProgressCircular indeterminate color="primary" size="100" width="8" /></div></VCardText>
          </VCard>
        </div>
        <div class="ci-flex-card-grid__item">
          <VCard variant="outlined" class="dashboard-item dashboard-card">
            <VCardTitle>Active users</VCardTitle>
            <VCardSubtitle>Total activity in the selected period</VCardSubtitle>
            <VCardText v-if="!analyticsStore.loadingAnalytics">
              <div v-if="resolvedDashboardData.mostActiveUsers?.length > 0" style="height: 300px; width: 100%">
                <DashboardHorizontalBar :data="resolvedDashboardData.mostActiveUsers" />
              </div>
              <VEmptyState v-else title="No active users" text="User activity will appear here after content is viewed." style="height: 300px; width: 100%">
                <template #media><VIcon color="accent-2">fasl fa-users mb-6</VIcon></template>
              </VEmptyState>
            </VCardText>
            <VCardText v-else><div :style="{ height: '300px' }" class="d-flex justify-center align-center"><VProgressCircular indeterminate color="primary" size="100" width="8" /></div></VCardText>
          </VCard>
        </div>
        <div class="ci-flex-card-grid__item">
          <VCard variant="outlined" class="dashboard-item dashboard-card">
            <VCardTitle>Content activity</VCardTitle>
            <VCardSubtitle>Activity by action type</VCardSubtitle>
            <VCardText v-if="!analyticsStore.loadingAnalytics">
              <div v-if="resolvedDashboardData.contentActivity?.length > 0" style="height: 300px; width: 100%">
                <DashboardHorizontalBar :data="resolvedDashboardData.contentActivity" value-key="count" />
              </div>
              <VEmptyState v-else title="No activity yet" text="Activity totals will appear here after users work with content." style="height: 300px; width: 100%">
                <template #media><VIcon color="accent-3">fasl fa-chart-simple mb-6</VIcon></template>
              </VEmptyState>
            </VCardText>
            <VCardText v-else><div :style="{ height: '300px' }" class="d-flex justify-center align-center"><VProgressCircular indeterminate color="primary" size="100" width="8" /></div></VCardText>
          </VCard>
        </div>
      </div>

      <div class="ci-flex-card-grid dashboard-grid dashboard-grid--stats mt-2">
        <div class="ci-flex-card-grid__item">
          <VCard variant="outlined" class="dashboard-item dashboard-card dashboard-stat-card">
            <VCardTitle>Storage size</VCardTitle>
            <VCardSubtitle>Total storage used</VCardSubtitle>
            <VCardText v-if="!analyticsStore.loadingAnalytics">
              <div class="dashboard-stat-value-row"><span class="dashboard-stat-value">{{ storageParts[0] }}</span><span class="dashboard-stat-unit text-medium-emphasis">{{ storageParts[1] }}</span></div>
            </VCardText>
            <VCardText v-else><div :style="{ height: '48px' }" class="d-flex justify-center align-center"><VProgressCircular indeterminate color="primary" size="40" width="6" /></div></VCardText>
          </VCard>
        </div>
        <div class="ci-flex-card-grid__item"><VCard variant="outlined" class="dashboard-item dashboard-card dashboard-stat-card"><VCardTitle>Total {{ pluralize(totalFiles, 'file') }}</VCardTitle><VCardSubtitle>Total {{ pluralize(totalFiles, 'file') }} stored</VCardSubtitle><VCardText><div class="dashboard-stat-value-row"><span class="dashboard-stat-value">{{ totalFiles.toLocaleString() }}</span><span class="dashboard-stat-unit text-medium-emphasis">{{ pluralize(totalFiles, 'file') }}</span></div></VCardText></VCard></div>
        <div class="ci-flex-card-grid__item"><VCard variant="outlined" class="dashboard-item dashboard-card dashboard-stat-card"><VCardTitle>Active {{ pluralize(activeUsers, 'user') }}</VCardTitle><VCardSubtitle>Unique {{ pluralize(activeUsers, 'user') }} in the last 30 days</VCardSubtitle><VCardText><div class="dashboard-stat-value-row"><span class="dashboard-stat-value">{{ activeUsers.toLocaleString() }}</span><span class="dashboard-stat-unit text-medium-emphasis">{{ pluralize(activeUsers, 'user') }}</span></div></VCardText></VCard></div>
        <div class="ci-flex-card-grid__item"><VCard variant="outlined" class="dashboard-item dashboard-card dashboard-stat-card"><VCardTitle>Total {{ pluralize(totalSites, 'site') }}</VCardTitle><VCardSubtitle>{{ totalSites.toLocaleString() }} {{ pluralize(totalSites, 'site') }} available for analytics</VCardSubtitle><VCardText><div class="dashboard-stat-value-row"><span class="dashboard-stat-value">{{ totalSites.toLocaleString() }}</span><span class="dashboard-stat-unit text-medium-emphasis">{{ pluralize(totalSites, 'site') }}</span></div></VCardText></VCard></div>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.analytics-card {
  width: 100%;
}

.dashboard-item {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.dashboard-grid .ci-flex-card-grid__item {
  display: flex;
}

.dashboard-grid--charts {
  --ci-flex-card-grid-columns-desktop: 3;
}

.dashboard-grid--stats {
  --ci-flex-card-grid-columns-desktop: 4;
}

.dashboard-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.dashboard-stat-card :deep(.v-card-text) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: flex-end;
}

.dashboard-stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.dashboard-stat-value {
  display: block;
  font-size: clamp(2rem, 2.1vw, 2.4rem);
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.dashboard-stat-unit {
  display: block;
  margin-top: 6px;
  font-size: 0.8rem;
  line-height: 1rem;
}
</style>
