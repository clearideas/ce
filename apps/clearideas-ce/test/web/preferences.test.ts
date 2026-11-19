import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const { updateProfile } = vi.hoisted(() => ({ updateProfile: vi.fn() }))
vi.mock('../../src-web/src/api/client', () => ({
  ceApi: { updateProfile, profile: vi.fn(), account: vi.fn() },
}))
vi.mock('../../src-web/src/composables/useAlert', () => ({ useAlert: () => ({ add: vi.fn() }) }))

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  THEME_STORAGE_KEY,
  sanitizePreferences,
  usePreferencesStore,
} from '../../src-web/src/stores/preferences.store'

describe('preferences store (plan item 3.2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    updateProfile.mockReset()
    updateProfile.mockImplementation(async (input: { attributes?: { ui?: unknown } }) => ({
      profile: { id: 'u', email: 'e', attributes: { ui: input.attributes?.ui } },
    }))
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('boots from localStorage before the profile is available', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ tileView: true, sitePageSize: 50 }))
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const store = usePreferencesStore()
    expect(store.preferences).toMatchObject({
      tileView: true,
      sitePageSize: 50,
      theme: 'dark',
      userPageSize: 25,
    })
    expect(store.hydrated).toBe(false)
  })

  it('ignores malformed or out-of-range stored values', () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      '{"tileView":"yes","sitePageSize":7,"searchResultsWidth":99999,"theme":"blue"}',
    )
    const store = usePreferencesStore()
    expect(store.preferences).toEqual(DEFAULT_PREFERENCES)
    expect(sanitizePreferences('garbage')).toEqual({})
  })

  it('lets the profile win on hydration and only then writes changes through (once per burst)', async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ tileView: true }))
    const store = usePreferencesStore()

    store.preferences.sitePageSize = 50
    await nextTick()
    vi.runAllTimers()
    expect(updateProfile).not.toHaveBeenCalled() // not hydrated yet: local only

    store.hydrateFromProfile({ attributes: { ui: { tileView: false, userPageSize: 100 } } })
    expect(store.preferences.tileView).toBe(false) // server wins over the local value
    expect(store.preferences.userPageSize).toBe(100)
    expect(store.preferences.sitePageSize).toBe(50) // untouched by the server stays
    await nextTick()
    vi.runAllTimers()
    expect(updateProfile).not.toHaveBeenCalled() // applying the profile is not a user change

    store.preferences.tileView = true
    await nextTick()
    store.preferences.sitePageSize = 10
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(updateProfile.mock.calls[0][0]).toEqual({
      attributes: { ui: expect.objectContaining({ tileView: true, sitePageSize: 10, userPageSize: 100 }) },
    })
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      tileView: true,
      sitePageSize: 10,
    })
  })

  it('keeps the historical theme storage key and clears it for "follow system"', async () => {
    const store = usePreferencesStore()
    store.preferences.theme = 'dark'
    await nextTick()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    store.preferences.theme = null
    await nextTick()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })
})
