import { computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import { ICONS } from '../icons'
import { usePreferencesStore } from '../stores/preferences.store'
import { updateAlertTheme } from './useAlert'

let mediaQuery: MediaQueryList | undefined
let removeSystemListener: (() => void) | undefined
let stopPreferenceWatcher: (() => void) | undefined

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme state for the app. The user's explicit choice lives in the preferences store (persisted
 * locally and to the profile); `null` follows the OS. The OS-theme listener and the preference
 * watcher are module-level and owned by the app root (`App.vue` calls `watchSystemTheme()` /
 * `stopWatchingSystemTheme()`), so mounting and unmounting a consumer such as `ThemeToggle`
 * never detaches them.
 */
export function useAppTheme() {
  const theme = useTheme()
  const preferences = usePreferencesStore()

  function applyTheme(value: 'light' | 'dark') {
    theme.change(value)
    updateAlertTheme(value)
  }

  function setTheme(value: string, options: { persist?: boolean } = {}) {
    const themeName = value === 'dark' ? 'dark' : 'light'
    applyTheme(themeName)
    if (options.persist !== false) preferences.preferences.theme = themeName
  }

  function initializeTheme() {
    applyTheme(preferences.preferences.theme ?? systemTheme())
  }

  function watchSystemTheme() {
    if (typeof window === 'undefined') return
    if (!removeSystemListener) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const onSystemThemeChange = () => {
        if (!preferences.preferences.theme) applyTheme(systemTheme())
      }
      mediaQuery.addEventListener('change', onSystemThemeChange)
      removeSystemListener = () => mediaQuery?.removeEventListener('change', onSystemThemeChange)
    }
    // Profile hydration (another browser's choice) or a reset to "system" must be applied too.
    stopPreferenceWatcher ??= watch(
      () => preferences.preferences.theme,
      value => applyTheme(value ?? systemTheme()),
    )
  }

  function stopWatchingSystemTheme() {
    removeSystemListener?.()
    removeSystemListener = undefined
    stopPreferenceWatcher?.()
    stopPreferenceWatcher = undefined
  }

  const themeSwitcherIcon = computed(() =>
    theme.global.name.value === 'dark' ? ICONS.themeLight : ICONS.themeDark,
  )

  function themeSwitcher() {
    setTheme(theme.global.name.value === 'dark' ? 'light' : 'dark')
  }

  return {
    currentTheme: computed(() => theme.global.name.value),
    initializeTheme,
    setTheme,
    stopWatchingSystemTheme,
    themeSwitcher,
    themeSwitcherIcon,
    watchSystemTheme,
  }
}
