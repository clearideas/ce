/**
 * Mount the whole CE web app (App.vue → AppLayout → routed view) for feature tests.
 *
 * Real router table (memory history), real Pinia stores, real Vuetify; the network is the fake
 * backend from `./backend`. Use `waitFor` for anything that depends on requests resolving.
 */
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearContainers } from 'vue3-toastify'
import App from '../../../src-web/src/App.vue'
import { mountWithVuetify } from '../harness'

export interface MountAppOptions {
  /** Viewport width; < 960 renders the mobile shell (drawer + nav icon). Default 1280. */
  width?: number
}

export async function mountApp(path: string, options: MountAppOptions = {}) {
  // The harness empties document.body after each test, detaching vue3-toastify's container; drop
  // it so the next toast re-creates one in the live document.
  clearContainers(false)
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: options.width ?? 1280,
  })
  const { router: appRouter } = await import('../../../src-web/src/router')
  const router = createRouter({ history: createMemoryHistory(), routes: appRouter.getRoutes() })
  const pinia = createPinia()
  const wrapper = await mountWithVuetify(App, { router, initialRoute: path, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, router, pinia }
}

/** Re-run `assertion` (flushing promises and timers between tries) until it passes or times out. */
export async function waitFor<T>(assertion: () => T, { timeout = 10_000, interval = 10 } = {}): Promise<T> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeout) {
    try {
      return assertion()
    } catch (error) {
      lastError = error
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }
  throw lastError
}

/** Elements rendered anywhere in the document (overlays teleport to body). */
export function queryAll(selector: string) {
  return [...document.body.querySelectorAll<HTMLElement>(selector)]
}

export function byText<T extends HTMLElement = HTMLElement>(
  selector: string,
  text: string | RegExp,
): T | undefined {
  return queryAll(selector).find(el =>
    typeof text === 'string' ? el.textContent?.trim() === text : text.test(el.textContent ?? ''),
  ) as T | undefined
}

/** The visible text of every toast currently shown (vue3-toastify renders into document.body). */
export function toasts() {
  return queryAll('.Toastify__toast').map(el => el.textContent?.trim() ?? '')
}

/** Open a VSelect/VAutocomplete menu (Vuetify opens on mousedown on the field). */
export async function openSelect(container: Element) {
  const field = container.querySelector<HTMLElement>('.v-field') ?? (container as HTMLElement)
  field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  field.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
