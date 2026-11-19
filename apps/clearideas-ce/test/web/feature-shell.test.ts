import { beforeEach, describe, expect, it } from 'vitest'
import { PREFERENCES_STORAGE_KEY, THEME_STORAGE_KEY } from '../../src-web/src/stores/preferences.store'
import { byText, mountApp, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — the app shell (App.vue, AppLayout, Navbar, VerticalNav(+Link), ThemeToggle,
 * NavUserProfileMenu, Footer, preferences sync) through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const app = () => document.body.querySelector('.v-application')!
const mainNav = () => document.body.querySelector<HTMLElement>('[role="navigation"][aria-label="Main"]')!

describe('App shell (desktop)', () => {
  it('switches theme, persists it locally and syncs it to the profile', async () => {
    await mountApp('/sites')
    await waitFor(() => expect(mainNav()).not.toBeNull())
    expect(app().classList.contains('v-theme--light')).toBe(true)

    document.body.querySelector<HTMLButtonElement>('button[aria-label="Switch to dark mode"]')!.click()
    await waitFor(() => expect(app().classList.contains('v-theme--dark')).toBe(true))
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.body.querySelector('button[aria-label="Switch to light mode"]')).not.toBeNull()
    // Write-through to attributes.ui is debounced and silent.
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1), { timeout: 3000 })
    expect(backend.calls('PATCH', '/api/profile')[0].body).toMatchObject({
      attributes: { ui: { theme: 'dark' } },
    })
  })

  it('applies the profile’s saved preferences on boot (server wins over the browser)', async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ tileView: false }))
    backend.state.profile.attributes!.ui = { tileView: true, theme: 'dark' }
    await mountApp('/sites')
    await waitFor(() => expect(app().classList.contains('v-theme--dark')).toBe(true))
    await waitFor(() => expect(document.body.querySelector('.site-tile-item')).not.toBeNull())
  })

  it('collapses the navigation to a rail and remembers it', async () => {
    await mountApp('/sites')
    await waitFor(() => expect(mainNav()).not.toBeNull())
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')!.click()
    await waitFor(() =>
      expect(
        document.body.querySelector('.layout-vertical-nav')?.classList.contains('v-navigation-drawer--rail'),
      ).toBe(true),
    )
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}').navRail).toBe(true)
  })

  it('navigates from the main navigation and marks the current section', async () => {
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(mainNav()).not.toBeNull())
    byText('[aria-label="Main"] a', 'Users')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/users'))
    await waitFor(() =>
      expect(mainNav().querySelector('a[aria-current="page"]')?.textContent?.trim()).toBe('Users'),
    )
    // Favourite sites are shortcuts in the navigation.
    byText('[aria-label="Main"] a', 'Product Handbook')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}`))
  })

  it('opens the account menu, goes to Settings and logs out', async () => {
    const { router } = await mountApp('/sites')
    await waitFor(() =>
      expect(document.body.querySelector('button[aria-label^="Account menu"]')).not.toBeNull(),
    )
    document.body.querySelector<HTMLButtonElement>('button[aria-label^="Account menu"]')!.click()
    await waitFor(() => expect(byText('.v-overlay-container .v-list-item', 'Settings')).toBeDefined())
    expect(document.body.querySelector('.v-overlay-container')?.textContent).toContain('ada@example.test')
    byText('.v-overlay-container .v-list-item', 'Settings')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/settings'))

    document.body.querySelector<HTMLButtonElement>('button[aria-label^="Account menu"]')!.click()
    await waitFor(() => expect(byText('.v-overlay-container .v-list-item', 'Log out')).toBeDefined())
    byText('.v-overlay-container .v-list-item', 'Log out')!.click()
    await waitFor(() => expect(backend.calls('POST', '/api/auth/logout')).toHaveLength(1))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
  })

  it('has a footer link to Settings', async () => {
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(document.body.querySelector('.app-footer')).not.toBeNull())
    document.body.querySelector<HTMLAnchorElement>('.app-footer a[href="/settings"]')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/settings'))
  })

  it('returns to the login page when the session expires mid-use', async () => {
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(mainNav()).not.toBeNull())
    backend.state.session = null as never
    await router.push('/users')
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
  })
})

describe('App shell (mobile, 390 px)', () => {
  it('uses a hamburger to open the navigation drawer, and collapses search to a button', async () => {
    const { wrapper, router } = await mountApp('/sites', { width: 390 })
    const toggle = await waitFor(() => {
      const el = document.body.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.body.querySelector('button[aria-label="Search content"]')).not.toBeNull()

    toggle.click()
    await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('true'))
    await waitFor(() =>
      expect(
        document.body
          .querySelector('.layout-vertical-nav')
          ?.classList.contains('v-navigation-drawer--active'),
      ).toBe(true),
    )
    byText('[aria-label="Main"] a', 'Analytics')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/analytics/dashboard'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('site rows use the overflow menu for favourite/users actions', async () => {
    const { wrapper } = await mountApp('/sites', { width: 390 })
    await waitFor(() => expect(queryAll('.site-list-container tbody tr').length).toBe(3))
    expect(wrapper.find('button[aria-label="Add Engineering Wiki to favourites"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="More actions for Engineering Wiki"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Add to favourites')!.click()
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1))
  })
})
