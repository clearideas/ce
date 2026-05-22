import { computed, onBeforeUnmount } from 'vue'
import { useTheme } from 'vuetify'
import { updateAlertTheme } from './useAlert'

const themeStorageKey = 'app-theme'
let mediaQuery: MediaQueryList | undefined
let removeSystemListener: (() => void) | undefined

function systemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function savedTheme() {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(themeStorageKey)
  return value === 'dark' || value === 'light' ? value : null
}

export function useAppTheme() {
  const theme = useTheme()

  function setTheme(value: string, options: { persist?: boolean } = {}) {
    const themeName = value === 'dark' ? 'dark' : 'light'
    theme.global.name.value = themeName
    updateAlertTheme(themeName)
    if (options.persist !== false && typeof window !== 'undefined') {
      window.localStorage.setItem(themeStorageKey, themeName)
    }
  }

  function initializeTheme() {
    setTheme(savedTheme() ?? systemTheme(), { persist: false })
  }

  function watchSystemTheme() {
    if (typeof window === 'undefined') return
    if (removeSystemListener) return

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => {
      if (!savedTheme()) setTheme(systemTheme(), { persist: false })
    }

    mediaQuery.addEventListener('change', onSystemThemeChange)
    removeSystemListener = () => mediaQuery?.removeEventListener('change', onSystemThemeChange)
  }

  function stopWatchingSystemTheme() {
    removeSystemListener?.()
    removeSystemListener = undefined
  }

  const themeSwitcherIcon = computed(() =>
    theme.global.name.value === 'dark' ? 'fasl fa-sun-bright' : 'fasl fa-moon-stars',
  )

  function themeSwitcher() {
    setTheme(theme.global.name.value === 'dark' ? 'light' : 'dark')
  }

  onBeforeUnmount(stopWatchingSystemTheme)

  return {
    currentTheme: computed(() => theme.global.name.value),
    initializeTheme,
    setTheme,
    themeSwitcher,
    themeSwitcherIcon,
    watchSystemTheme,
  }
}
