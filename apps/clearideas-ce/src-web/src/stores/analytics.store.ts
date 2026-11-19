import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ceApi } from '../api/client'

export type AnalyticsFilter = {
  sites: string[]
  actions: string[]
  startDate?: string
  endDate?: string
  limit: number
  timeZone?: string
}

/**
 * A row of an analytics report. Reports share a loose shape (name/count/…); the columns present
 * depend on the report, so every field is optional.
 */
export type AnalyticsRow = Record<string, unknown> & {
  id?: string
  name?: string
  count?: number
  size?: number
  hour?: number
  viewCount?: number
  userCount?: number
  zeroResultCount?: number
  lastActive?: string
  lastViewedAt?: string
  lastSearchedAt?: string
}

export type AnalyticsRowsResponse<T = AnalyticsRow> = {
  rows: T[]
}

/** Summary figures shown on the analytics dashboard. */
export type AnalyticsDashboardData = Record<string, unknown> & {
  storageSize?: number
  totalContent?: number
  totalSites?: number
  totalOwnedOrAdministeredSites?: number
  monthlyActiveUsers?: number
  mostAccessedContent?: AnalyticsRow[]
  mostActiveUsers?: AnalyticsRow[]
  contentActivity?: AnalyticsRow[]
}

export const useAnalyticsStore = defineStore('analytics', () => {
  const currentReport = ref<AnalyticsDashboardData | null>(null)
  const loadingAnalytics = ref(false)
  const loading = loadingAnalytics

  async function run<T>(callback: () => Promise<T>) {
    loadingAnalytics.value = true
    try {
      return await callback()
    } finally {
      loadingAnalytics.value = false
    }
  }

  async function dashboard(filter?: Partial<AnalyticsFilter>) {
    return run(async () => {
      currentReport.value = await ceApi.dashboard(filter)
      return currentReport.value
    })
  }

  async function mostAccessed(filter: AnalyticsFilter) {
    return run(() => ceApi.mostAccessed(filter))
  }

  async function mostActive(filter: AnalyticsFilter) {
    return run(() => ceApi.mostActive(filter))
  }

  async function contentActivity(filter: AnalyticsFilter) {
    return run(() => ceApi.contentActivity(filter))
  }

  async function usageTimes(filter: AnalyticsFilter) {
    return run(() => ceApi.usageTimes(filter))
  }

  async function searchTerms(filter: AnalyticsFilter) {
    return run(() => ceApi.searchTerms(filter))
  }

  async function monthlyActiveUsers(filter?: Partial<AnalyticsFilter>) {
    return run(async () => {
      currentReport.value = await ceApi.monthlyActiveUsers(filter)
      return currentReport.value
    })
  }

  return {
    currentReport,
    loading,
    loadingAnalytics,
    dashboard,
    mostAccessed,
    mostActive,
    contentActivity,
    usageTimes,
    searchTerms,
    monthlyActiveUsers,
  }
})
