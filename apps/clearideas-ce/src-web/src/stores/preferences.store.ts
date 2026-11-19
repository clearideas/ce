import { defineStore } from 'pinia'
import { reactive, ref, toRaw, watch } from 'vue'
import type { User } from '../types/domain'
import { useProfileStore } from './profile.store'

/**
 * UI preferences: view mode, page sizes, theme, navigation rail, search-results width.
 *
 * Two layers, both authoritative in their moment:
 * - localStorage — read synchronously on boot so the first paint uses the user's choices;
 * - the profile (`attributes.ui`) — source of truth across browsers. When the profile loads, its
 *   values win; afterwards every change is written to both (the PATCH is debounced and silent).
 *
 * `theme` keeps its historical storage key (`app-theme`) so existing browsers and the e2e helper
 * keep working; `null` means "follow the OS".
 */
export type ThemePreference = 'light' | 'dark' | null

export interface UiPreferences {
  tileView: boolean
  sitePageSize: number
  userPageSize: number
  userGroupPageSize: number
  navRail: boolean
  searchResultsWidth: number
  theme: ThemePreference
}

export const DEFAULT_PREFERENCES: Readonly<UiPreferences> = Object.freeze({
  tileView: false,
  sitePageSize: 25,
  userPageSize: 25,
  userGroupPageSize: 25,
  navRail: false,
  searchResultsWidth: 400,
  theme: null,
})

export const PREFERENCES_STORAGE_KEY = 'ci-ui-preferences'
export const THEME_STORAGE_KEY = 'app-theme'
const SYNC_DEBOUNCE_MS = 800
const PAGE_SIZES = new Set([10, 25, 50, 100])

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Accept only well-formed values; anything else falls back to the default. */
export function sanitizePreferences(input: unknown): Partial<UiPreferences> {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Record<string, unknown>
  const out: Partial<UiPreferences> = {}
  if (typeof raw.tileView === 'boolean') out.tileView = raw.tileView
  for (const key of ['sitePageSize', 'userPageSize', 'userGroupPageSize'] as const) {
    if (typeof raw[key] === 'number' && PAGE_SIZES.has(raw[key] as number)) out[key] = raw[key] as number
  }
  if (typeof raw.navRail === 'boolean') out.navRail = raw.navRail
  if (
    typeof raw.searchResultsWidth === 'number' &&
    raw.searchResultsWidth >= 320 &&
    raw.searchResultsWidth <= 2000
  ) {
    out.searchResultsWidth = Math.round(raw.searchResultsWidth)
  }
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === null) out.theme = raw.theme
  return out
}

function readLocal(): Partial<UiPreferences> {
  const store = storage()
  if (!store) return {}
  let parsed: unknown = {}
  try {
    parsed = JSON.parse(store.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')
  } catch {
    parsed = {}
  }
  const prefs = sanitizePreferences(parsed)
  const theme = store.getItem(THEME_STORAGE_KEY)
  if (theme === 'light' || theme === 'dark') prefs.theme = theme
  return prefs
}

function writeLocal(prefs: UiPreferences) {
  const store = storage()
  if (!store) return
  const { theme, ...rest } = prefs
  store.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(rest))
  if (theme) store.setItem(THEME_STORAGE_KEY, theme)
  else store.removeItem(THEME_STORAGE_KEY)
}

export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = reactive<UiPreferences>({ ...DEFAULT_PREFERENCES, ...readLocal() })
  /** True once the profile has been applied; server sync is off until then. */
  const hydrated = ref(false)
  let syncTimer: ReturnType<typeof setTimeout> | undefined
  let applyingProfile = false

  function set<K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) {
    const next = sanitizePreferences({ [key]: value })
    if (!(key in next)) return
    preferences[key] = next[key] as UiPreferences[K]
  }

  /** Apply the profile's saved preferences (server wins) and enable write-through. */
  function hydrateFromProfile(user: Pick<User, 'attributes'> | null | undefined) {
    const fromServer = sanitizePreferences((user?.attributes as { ui?: unknown } | undefined)?.ui)
    applyingProfile = true
    try {
      Object.assign(preferences, fromServer)
    } finally {
      applyingProfile = false
    }
    writeLocal(preferences)
    hydrated.value = true
  }

  async function syncToProfile() {
    if (!hydrated.value) return
    const profileStore = useProfileStore()
    try {
      await profileStore.updateProfile({ attributes: { ui: { ...toRaw(preferences) } } }, { silent: true })
    } catch {
      // Local copy is already saved; the next change retries. Never surface a toast for a preference.
    }
  }

  // Synchronous so that the `applyingProfile` guard covers the assignments made during hydration.
  watch(
    () => ({ ...preferences }),
    () => {
      writeLocal(preferences)
      if (!hydrated.value || applyingProfile) return
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => void syncToProfile(), SYNC_DEBOUNCE_MS)
    },
    { deep: true, flush: 'sync' },
  )

  /** Flush a pending sync immediately (used by tests and before sign-out). */
  async function flush() {
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = undefined
      await syncToProfile()
    }
  }

  return { preferences, hydrated, set, hydrateFromProfile, flush }
})
