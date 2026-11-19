import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useAppTheme } from '../../src-web/src/composables/useAppTheme'
import ThemeToggle from '../../src-web/src/layouts/components/ThemeToggle.vue'
import { mountWithVuetify, settle } from './harness'

/**
 * Regression for review finding C7: the OS-theme listener is owned by the app root, so mounting
 * and unmounting a consumer (ThemeToggle is `v-if`-removed on mobile when search expands) must
 * not detach it.
 */
describe('useAppTheme lifecycle', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.mocked(window.matchMedia).mockClear()
  })

  it('keeps the system-theme listener when a consumer unmounts, and releases it on explicit stop', async () => {
    const showToggle = ref(true)
    let stop: (() => void) | undefined

    const Root = defineComponent({
      setup() {
        const theme = useAppTheme()
        theme.initializeTheme()
        theme.watchSystemTheme()
        stop = theme.stopWatchingSystemTheme
        return () => (showToggle.value ? h(ThemeToggle) : h('span'))
      },
    })

    await mountWithVuetify(Root)
    const mediaQuery = vi.mocked(window.matchMedia).mock.results.at(-1)?.value as {
      addEventListener: ReturnType<typeof vi.fn>
      removeEventListener: ReturnType<typeof vi.fn>
    }
    expect(mediaQuery.addEventListener).toHaveBeenCalledTimes(1)

    showToggle.value = false
    await settle()
    expect(mediaQuery.removeEventListener).not.toHaveBeenCalled()

    stop?.()
    expect(mediaQuery.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('persists an explicit toggle and exposes the matching icon', async () => {
    let api: ReturnType<typeof useAppTheme> | undefined
    const Root = defineComponent({
      setup() {
        api = useAppTheme()
        api.initializeTheme()
        return () => h(ThemeToggle)
      },
    })
    const wrapper = await mountWithVuetify(Root)
    expect(api?.currentTheme.value).toBe('light')
    await wrapper.find('button').trigger('click')
    expect(api?.currentTheme.value).toBe('dark')
    expect(window.localStorage.getItem('app-theme')).toBe('dark')
    expect(api?.themeSwitcherIcon.value).toBe('fas fa-sun')
  })
})
