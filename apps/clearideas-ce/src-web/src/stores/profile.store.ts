import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ceApi } from '../api/client'
import { useAlert } from '../composables/useAlert'
import type { Account, NotificationSettings, User } from '../types/domain'

export const useProfileStore = defineStore('profile', () => {
  const user = ref<User | null>(null)
  const account = ref<Account | null>(null)
  const loading = ref(false)
  const tileView = ref(false)
  const sitePageSize = ref(25)
  const userPageSize = ref(25)
  const userGroupPageSize = ref(25)
  const alert = useAlert()
  const displayName = computed(() => user.value?.displayName || user.value?.name || user.value?.email || '')
  const canManageUsersAndAnalytics = computed(() =>
    (user.value?.roles ?? []).some(role => ['owner', 'admin'].includes(role)),
  )

  async function getProfile() {
    loading.value = true
    try {
      const [accountResponse, profileResponse] = await Promise.all([ceApi.account(), ceApi.profile()])
      account.value = accountResponse.account
      user.value = profileResponse.profile
    } finally {
      loading.value = false
    }
  }

  async function updateProfile(input: {
    displayName?: string
    attributes?: {
      timeZone?: string
      notifications?: NotificationSettings
      sites?: { autoAcceptInvites?: boolean; favourites?: string[]; suppressedSites?: string[]; suppressNotifications?: string[] }
    }
  }, options: { successMessage?: string; silent?: boolean } = {}) {
    try {
      const response = await ceApi.updateProfile(input)
      user.value = response.profile
      if (!options.silent) alert.add({ message: options.successMessage ?? 'Profile settings saved.', type: 'success', timeout: 3000 })
      return response.profile
    } catch (error) {
      if (!options.silent) alert.add({ message: error instanceof Error ? error.message : 'Profile settings could not be saved.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function toggleFavourites(siteId: string) {
    const attributes = user.value?.attributes ?? {}
    const sites = attributes.sites ?? {}
    const favourites = sites.favourites ?? []
    const nextFavourites = favourites.includes(siteId)
      ? favourites.filter(id => id !== siteId)
      : [...favourites, siteId]
    return updateProfile({
      attributes: {
        ...attributes,
        sites: {
          ...sites,
          favourites: nextFavourites,
        },
      },
    }, { successMessage: nextFavourites.includes(siteId) ? 'Site added to favourites.' : 'Site removed from favourites.' })
  }

  async function toggleSuppressedSites(siteId: string) {
    const attributes = user.value?.attributes ?? {}
    const sites = attributes.sites ?? {}
    const suppressedSites = sites.suppressedSites ?? []
    const nextSuppressedSites = suppressedSites.includes(siteId)
      ? suppressedSites.filter(id => id !== siteId)
      : [...suppressedSites, siteId]
    return updateProfile({
      attributes: {
        ...attributes,
        sites: {
          ...sites,
          suppressedSites: nextSuppressedSites,
        },
      },
    }, { successMessage: nextSuppressedSites.includes(siteId) ? 'Site blocked.' : 'Site unblocked.' })
  }

  async function updateAccount(input: { name?: string; attributes?: Account['attributes'] }, options: { successMessage?: string; silent?: boolean } = {}) {
    try {
      const response = await ceApi.updateAccount(input)
      account.value = response.account
      if (!options.silent) alert.add({ message: options.successMessage ?? 'Account settings saved.', type: 'success', timeout: 3000 })
      return response.account
    } catch (error) {
      if (!options.silent) alert.add({ message: error instanceof Error ? error.message : 'Account settings could not be saved.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  return { user, account, loading, tileView,
    sitePageSize,
    userPageSize,
    userGroupPageSize, displayName, canManageUsersAndAnalytics, getProfile, updateProfile, updateAccount, toggleFavourites, toggleSuppressedSites }
})
