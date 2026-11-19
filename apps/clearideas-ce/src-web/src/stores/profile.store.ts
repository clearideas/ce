import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ceApi } from '../api/client'
import { useAlert } from '../composables/useAlert'
import type { Account, NotificationSettings, User } from '../types/domain'
import { usePreferencesStore, type UiPreferences } from './preferences.store'

export const useProfileStore = defineStore('profile', () => {
  const user = ref<User | null>(null)
  const account = ref<Account | null>(null)
  const loading = ref(false)
  const alert = useAlert()
  const displayName = computed(() => user.value?.displayName || user.value?.name || user.value?.email || '')
  const canManageUsersAndAnalytics = computed(() =>
    (user.value?.roles ?? []).some(role => ['owner', 'admin'].includes(role)),
  )

  /** Concurrent callers (AppLayout, the settings view, …) share one in-flight load. */
  let pendingLoad: Promise<void> | null = null

  function getProfile() {
    pendingLoad ??= loadProfile().finally(() => {
      pendingLoad = null
    })
    return pendingLoad
  }

  async function loadProfile() {
    loading.value = true
    try {
      const [accountResponse, profileResponse] = await Promise.all([ceApi.account(), ceApi.profile()])
      account.value = accountResponse.account
      user.value = profileResponse.profile
      usePreferencesStore().hydrateFromProfile(user.value)
    } finally {
      loading.value = false
    }
  }

  /**
   * Resolve once the profile is available (loading it if nobody has yet). Views that need profile
   * settings for their *first* request — e.g. analytics queries in the user's time zone — await
   * this: routed views mount before the app shell starts its own profile load.
   */
  async function ensureProfile() {
    if (user.value) return
    await getProfile()
  }

  async function updateProfile(
    input: {
      displayName?: string
      attributes?: {
        timeZone?: string
        notifications?: NotificationSettings
        sites?: {
          autoAcceptInvites?: boolean
          favourites?: string[]
          suppressedSites?: string[]
          suppressNotifications?: string[]
        }
        ui?: Partial<UiPreferences>
      }
    },
    options: { successMessage?: string; silent?: boolean } = {},
  ) {
    try {
      const response = await ceApi.updateProfile(input)
      user.value = response.profile
      if (!options.silent)
        alert.add({
          message: options.successMessage ?? 'Profile settings saved.',
          type: 'success',
          timeout: 3000,
        })
      return response.profile
    } catch (error) {
      if (!options.silent)
        alert.add({
          message: error instanceof Error ? error.message : 'Profile settings could not be saved.',
          type: 'error',
          timeout: 5000,
        })
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
    return updateProfile(
      {
        attributes: {
          ...attributes,
          sites: {
            ...sites,
            favourites: nextFavourites,
          },
        },
      },
      {
        successMessage: nextFavourites.includes(siteId)
          ? 'Site added to favourites.'
          : 'Site removed from favourites.',
      },
    )
  }

  async function toggleSuppressedSites(siteId: string) {
    const attributes = user.value?.attributes ?? {}
    const sites = attributes.sites ?? {}
    const suppressedSites = sites.suppressedSites ?? []
    const nextSuppressedSites = suppressedSites.includes(siteId)
      ? suppressedSites.filter(id => id !== siteId)
      : [...suppressedSites, siteId]
    return updateProfile(
      {
        attributes: {
          ...attributes,
          sites: {
            ...sites,
            suppressedSites: nextSuppressedSites,
          },
        },
      },
      { successMessage: nextSuppressedSites.includes(siteId) ? 'Site blocked.' : 'Site unblocked.' },
    )
  }

  async function updateAccount(
    input: { name?: string; attributes?: Account['attributes'] },
    options: { successMessage?: string; silent?: boolean } = {},
  ) {
    try {
      const response = await ceApi.updateAccount(input)
      account.value = response.account
      if (!options.silent)
        alert.add({
          message: options.successMessage ?? 'Account settings saved.',
          type: 'success',
          timeout: 3000,
        })
      return response.account
    } catch (error) {
      if (!options.silent)
        alert.add({
          message: error instanceof Error ? error.message : 'Account settings could not be saved.',
          type: 'error',
          timeout: 5000,
        })
      throw error
    }
  }

  return {
    user,
    account,
    loading,
    displayName,
    canManageUsersAndAnalytics,
    getProfile,
    ensureProfile,
    updateProfile,
    updateAccount,
    toggleFavourites,
    toggleSuppressedSites,
  }
})
