/**
 * Vuetify-mounted component test harness.
 *
 * Every UI test should mount through `mountWithVuetify()` so that the real Vuetify instance
 * (theme, defaults, icon set), a memory router, a testing Pinia, and the `vue-tippy` plugin are
 * present. Stubbing `V*` components hides layout, theming, slot-wiring and icon-resolution bugs —
 * the existing tests that do so predate this harness and are migrated in Phase 4.
 *
 * Example:
 *
 *   const wrapper = mountWithVuetify(BaseButton, { props: { text: 'Save' } })
 *   await expectNoA11yViolations(wrapper)
 *   wrapper.unmount()
 *
 * Overlays (VMenu, VDialog, VSelect menus) teleport to `document.body`; use `attachTo: true`
 * (the default) and query with `document.body.querySelector(...)` or `wrapper.findComponent`.
 * Mounted wrappers are unmounted automatically after each test.
 */
import { createTestingPinia, type TestingOptions } from '@pinia/testing'
import { mount, type MountingOptions, type VueWrapper } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'
import { type Component, type ComponentPublicInstance } from 'vue'
import { createMemoryHistory, createRouter, type Router, type RouteRecordRaw } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '../../../src-web/src/plugins/fontawesome'
import { installTippy } from '../../../src-web/src/plugins/tippy'
import defaults from '../../../src-web/src/plugins/vuetify/defaults'
import { aliases, fa } from '../../../src-web/src/plugins/vuetify/icons'
import theme from '../../../src-web/src/plugins/vuetify/theme'

export interface MountWithVuetifyOptions<Props> extends Omit<MountingOptions<Props>, 'attachTo'> {
  /** Route table for the memory router. A catch-all route is appended when the table has none. */
  routes?: RouteRecordRaw[]
  /** Use an existing router instead of creating a memory router (e.g. the app's real router). */
  router?: Router
  /** Initial route to navigate to before mounting. Defaults to `/` for the harness router. */
  initialRoute?: string
  /** Passed to `createTestingPinia`. Actions are stubbed by default. */
  pinia?: TestingOptions
  /** Theme to start in. */
  themeName?: 'light' | 'dark'
  /** Attach to `document.body` (needed for focus, keyboard and overlay tests). Default `true`. */
  attachTo?: boolean | Element
}

const mounted: VueWrapper<ComponentPublicInstance>[] = []

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  document.body.innerHTML = ''
})

export function createTestVuetify(themeName: 'light' | 'dark' = 'light') {
  return createVuetify({
    components,
    directives,
    defaults,
    theme: { ...theme, defaultTheme: themeName },
    icons: { defaultSet: 'fa', aliases, sets: { fa } },
  })
}

const CATCH_ALL: RouteRecordRaw = {
  path: '/:pathMatch(.*)*',
  name: 'catch-all',
  component: { template: '<div />' },
}

/**
 * Memory router for tests. A catch-all is always present so that links the component renders
 * (RouterLink / `router.resolve`) never log `No match found` for paths the test does not care about.
 */
export function createTestRouter(routes?: RouteRecordRaw[]): Router {
  const table = routes ?? []
  const hasCatchAll = table.some(route => route.path.includes('pathMatch'))
  return createRouter({ history: createMemoryHistory(), routes: hasCatchAll ? table : [...table, CATCH_ALL] })
}

export async function mountWithVuetify<Props>(
  component: Component,
  options: MountWithVuetifyOptions<Props> = {},
): Promise<VueWrapper<ComponentPublicInstance> & { router: Router }> {
  const {
    routes,
    initialRoute,
    pinia,
    themeName,
    attachTo = true,
    global,
    router: providedRouter,
    ...rest
  } = options
  const router = providedRouter ?? createTestRouter(routes)
  // Always start on a real route: before the first navigation the router sits at START_LOCATION
  // (path "") and every RouterLink the component renders resolves against it with a warning.
  if (initialRoute || !providedRouter) {
    await router.push(initialRoute ?? '/')
    await router.isReady()
  }

  const target = attachTo === true ? createMountTarget() : attachTo === false ? undefined : attachTo

  // A Pinia instance passed through `global.plugins` (e.g. one pre-seeded with store state) replaces
  // the harness's own testing Pinia instead of being installed alongside it.
  const providedPinia = global?.plugins?.some(plugin => isPinia(plugin))

  const wrapper = mount(component, {
    ...rest,
    attachTo: target,
    global: {
      ...global,
      plugins: [
        createTestVuetify(themeName),
        router,
        ...(providedPinia ? [] : [createTestingPinia({ createSpy: vi.fn, stubActions: true, ...pinia })]),
        { install: installTippy },
        ...(global?.plugins ?? []),
      ],
    },
  }) as VueWrapper<ComponentPublicInstance> & { router: Router }

  wrapper.router = router
  mounted.push(wrapper)
  return wrapper
}

function isPinia(plugin: unknown): boolean {
  return Boolean(plugin && typeof plugin === 'object' && '_s' in plugin && 'install' in plugin)
}

function createMountTarget() {
  const el = document.createElement('div')
  el.setAttribute('data-test-mount', '')
  document.body.appendChild(el)
  return el
}

/** Flush pending promises and Vue's scheduler. */
export async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
