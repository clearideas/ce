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

export type AnalyticsRowsResponse<T = Record<string, any>> = {
  rows: T[]
}

export const useAnalyticsStore = defineStore('analytics', () => {
  const currentReport = ref<Record<string, unknown> | null>(null)
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
    monthlyActiveUsers,
  }
})
