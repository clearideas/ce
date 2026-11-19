import { usePreferencesStore } from '../stores/preferences.store'

/**
 * UI preferences (view mode, page sizes, theme, nav rail, search-results width).
 *
 * `preferences` is reactive: read it in templates and assign to it directly
 * (`preferences.tileView = true`); every change is persisted locally and, once the profile has
 * loaded, to the profile. Use `set()` for values coming from untrusted input.
 */
export function usePreferences() {
  const store = usePreferencesStore()
  return { preferences: store.preferences, set: store.set, hydrated: store.hydrated }
}
