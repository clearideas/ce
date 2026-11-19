import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VApp } from 'vuetify/components/VApp'
import AppLayout from '../../src-web/src/layouts/AppLayout.vue'
import { useProfileStore } from '../../src-web/src/stores/profile.store'
import { useSiteStore } from '../../src-web/src/stores/site.store'
import { mountWithVuetify, runAxe, settle } from './harness'

/**
 * jsdom approximation of the Playwright page scans (test/e2e/ui-a11y.spec.ts): the real app shell
 * (navbar, drawer, search results, footer) with the real route table, rendered at the main routes
 * and scanned with axe. Layout-dependent rules (colour contrast) are left to the browser scans; the
 * structural/ARIA rules that make up most findings are caught here.
 */
vi.mock('../../src-web/src/api/client', () => ({
  appConfigApi: { get: vi.fn().mockResolvedValue({ docsEnabled: false }) },
  ceApi: {},
  api: {},
}))

const session = { user: { id: 'user-1', name: 'CE User', email: 'ce@example.test' } }

async function mountAt(path: string, width = 1280) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  const routes = (await import('../../src-web/src/router')).router.getRoutes()
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()

  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
  const profileStore = useProfileStore(pinia)
  profileStore.user = {
    id: 'user-1',
    email: 'ce@example.test',
    displayName: 'CE User',
    attributes: {},
  } as never
  const siteStore = useSiteStore(pinia)
  siteStore.sites = [{ id: 'site-1', name: 'Client Documents', currentUserRole: 'owner', folders: [] }]
  // Stubbed actions return undefined; views await these and chain `.catch`, so they must resolve.
  vi.mocked(siteStore.getSitesIfRequired).mockResolvedValue(undefined as never)
  vi.mocked(siteStore.setCurrentSite).mockResolvedValue(undefined as never)

  // VAppBar / VNavigationDrawer / VMain need the VApp layout provider, exactly as in App.vue.
  const Shell = defineComponent({ render: () => h(VApp, null, () => h(AppLayout, { session })) })
  const wrapper = await mountWithVuetify(Shell, { router, global: { plugins: [pinia] } })
  await settle()
  await settle()
  return wrapper
}

async function expectNoStructuralViolations(path: string, width?: number) {
  const wrapper = await mountAt(path, width)
  const results = await runAxe(document.body, { 'color-contrast': { enabled: false } })
  const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(
    blocking,
    blocking
      .map(v => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map(n => n.target.join(' ')).join('\n  ')}`)
      .join('\n'),
  ).toEqual([])
  return wrapper
}

describe('app shell accessibility (structural rules, jsdom)', () => {
  it('/sites on desktop', async () => {
    const wrapper = await expectNoStructuralViolations('/sites')
    expect(wrapper.find('[role="navigation"][aria-label="Main"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label^="Account menu"]').exists()).toBe(true)
  })

  it('/sites on mobile', async () => {
    const wrapper = await expectNoStructuralViolations('/sites', 390)
    expect(wrapper.find('button[aria-label="Open navigation"]').exists()).toBe(true)
  })

  it('/settings on desktop', async () => {
    await expectNoStructuralViolations('/settings')
  })

  it('/settings on mobile', async () => {
    await expectNoStructuralViolations('/settings', 390)
  })
})
