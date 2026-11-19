import { beforeEach, describe, expect, it } from 'vitest'
import { PREFERENCES_STORAGE_KEY } from '../../src-web/src/stores/preferences.store'
import { byText, mountApp, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — Sites page (SitesView, SiteList, SiteTiles, SiteActions, NewSite dialog,
 * SiteItemMenu, empty states) through the real app shell, stores and router; the network is the
 * in-memory fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const rowNames = () =>
  queryAll('.site-list-container tbody tr .content-item .title').map(el => el.textContent?.trim())
const tileNames = () => queryAll('.site-tile-item .title').map(el => el.textContent?.trim())

describe('Sites page', () => {
  it('lists every accessible site alphabetically inside the app shell', async () => {
    const { wrapper } = await mountApp('/sites')
    await waitFor(() =>
      expect(rowNames()).toEqual(['Engineering Wiki', 'Partner Data Room', 'Product Handbook']),
    )

    expect(document.title).toBe('Sites · Clear Ideas CE')
    expect(wrapper.find('[role="navigation"][aria-label="Main"]').exists()).toBe(true)
    // Favourite sites are listed in the main navigation.
    expect(wrapper.find('[role="navigation"][aria-label="Main"]').text()).toContain('Product Handbook')
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('All')
    expect(backend.unhandled).toEqual([])
    // AppLayout, the view and the route watcher share one initial load (no duplicate requests).
    expect(backend.calls('GET', '/api/sites')).toHaveLength(1)
    expect(backend.calls('GET', '/api/profile')).toHaveLength(1)
  })

  it('filters by tab: Favourites and Owned', async () => {
    const { wrapper, router } = await mountApp('/sites/favourites')
    await waitFor(() => expect(rowNames()).toEqual(['Product Handbook']))
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Favourites')

    await router.push('/sites/owned')
    await waitFor(() => expect(rowNames()).toEqual(['Engineering Wiki', 'Product Handbook']))
  })

  it('switching to tiles shows the same sites and persists the choice', async () => {
    const { wrapper } = await mountApp('/sites')
    await waitFor(() => expect(rowNames()).toHaveLength(3))

    await wrapper.get('button[aria-label^="View:"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Tiles')!.click()
    await waitFor(() =>
      expect(tileNames()).toEqual(['Engineering Wiki', 'Partner Data Room', 'Product Handbook']),
    )
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}').tileView).toBe(true)
    // Tags on tiles: "docs" + "internal" fit the tile budget.
    const handbookTile = queryAll('.site-tile-item').find(el => el.textContent?.includes('Product Handbook'))!
    expect(handbookTile.textContent).toContain('docs')
    expect(handbookTile.textContent).toContain('internal')
  })

  it('clicking a row opens the site', async () => {
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(rowNames()).toHaveLength(3))
    const row = queryAll('.site-list-container tbody tr').find(el =>
      el.textContent?.includes('Engineering Wiki'),
    )!
    row.click()
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe(`/site/${ID.wiki}`))
  })

  it('each site name in the list is a link (keyboard path)', async () => {
    await mountApp('/sites')
    await waitFor(() => expect(rowNames()).toHaveLength(3))
    const rowLink = queryAll('.site-list-container tbody tr a.item-link').find(a =>
      a.textContent?.includes('Engineering Wiki'),
    )!
    expect(rowLink.getAttribute('href')).toBe(`/site/${ID.wiki}`)
  })

  it('each tile is one link; the favourite button inside it does not open the site', async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ tileView: true }))
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(tileNames()).toHaveLength(3))
    const tile = queryAll('.site-tile-item').find(el => el.textContent?.includes('Engineering Wiki'))!
    tile.querySelector<HTMLButtonElement>('button[aria-label^="Add Engineering Wiki"]')!.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/sites')
    tile.querySelector<HTMLAnchorElement>('a.item-link--stretched')!.click()
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe(`/site/${ID.wiki}`))
  })

  it('creates a site through the New site dialog and opens it', async () => {
    const { wrapper, router } = await mountApp('/sites')
    await waitFor(() => expect(rowNames()).toHaveLength(3))

    await wrapper
      .findAll('button')
      .find(b => b.text() === 'New site')!
      .trigger('click')
    const dialog = await waitFor(() => {
      const el = document.body.querySelector<HTMLElement>('[role="dialog"]')
      expect(el?.textContent).toContain('New site')
      return el!
    })
    const confirm = () => byText<HTMLButtonElement>('[role="dialog"] button', 'Create site')!
    expect(confirm().disabled).toBe(true) // nothing typed yet

    const input = dialog.querySelector<HTMLInputElement>('input')!
    input.value = 'Board Pack'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(confirm().disabled).toBe(false)
    confirm().click()

    await waitFor(() => expect(backend.calls('POST', '/api/sites')).toHaveLength(1))
    expect(backend.calls('POST', '/api/sites')[0].body).toEqual({ name: 'Board Pack' })
    await waitFor(() => expect(router.currentRoute.value.path).toMatch(/^\/site\/67[0-9a-f]{22}$/))
  })

  it('blocks a shared site only after confirmation', async () => {
    const { wrapper } = await mountApp('/sites')
    await waitFor(() => expect(rowNames()).toHaveLength(3))

    await wrapper.get('button[aria-label="More actions for Partner Data Room"]').trigger('click')
    await settle()
    byText('.v-list-item', /Block site/)!.click()
    await settle()
    expect(backend.calls('PATCH', `/api/site/${ID.partner}/invitation/suppress`)).toHaveLength(0)
    const dialog = document.body.querySelector('[role="dialog"]')!
    byText<HTMLButtonElement>('[role="dialog"] button', 'Block')!.click()
    await waitFor(() =>
      expect(backend.calls('PATCH', `/api/site/${ID.partner}/invitation/suppress`)).toHaveLength(1),
    )
    await waitFor(() => expect(rowNames()).not.toContain('Partner Data Room'))
    expect(dialog).toBeDefined()
  })

  it('favourites a site from its row (profile PATCH keeps the other site settings)', async () => {
    const { wrapper } = await mountApp('/sites')
    await waitFor(() => expect(rowNames()).toHaveLength(3))

    const star = wrapper.get('button[aria-label="Add Engineering Wiki to favourites"]')
    expect(star.attributes('aria-pressed')).toBe('false')
    await star.trigger('click')
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1))
    const patch = backend.calls('PATCH', '/api/profile')[0].body as {
      attributes: { sites: { favourites: string[]; autoAcceptInvites: boolean } }
    }
    expect(patch.attributes.sites.favourites).toEqual([ID.handbook, ID.wiki])
    expect(patch.attributes.sites.autoAcceptInvites).toBe(false)
    await waitFor(() =>
      expect(
        wrapper
          .get('button[aria-label="Remove Engineering Wiki from favourites"]')
          .attributes('aria-pressed'),
      ).toBe('true'),
    )
  })

  it('shows the empty state with a New site call to action when there are no sites', async () => {
    backend.state.sites = []
    const { wrapper } = await mountApp('/sites')
    await waitFor(() => expect(wrapper.text()).toContain('No sites yet'))
    const cta = wrapper
      .findAll('.v-empty-state button, .empty-state button')
      .find(b => b.text().includes('New site'))
    expect(cta).toBeDefined()
    await expectNoA11yViolations(wrapper)
  })

  it('shows the favourites empty state when nothing is favourited', async () => {
    backend.state.profile.attributes!.sites!.favourites = []
    const { wrapper } = await mountApp('/sites/favourites')
    await waitFor(() => expect(wrapper.text()).toMatch(/favourite/i))
    expect(rowNames()).toEqual([])
  })

  it('redirects to the login page when there is no session', async () => {
    backend.state.session = null as never
    const { router } = await mountApp('/sites')
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
  })

  it('shows a retryable error instead of "No sites yet" when the list cannot be loaded', async () => {
    backend.failNext('GET', '/api/sites', 500, { error: 'Database unavailable' })
    const { wrapper } = await mountApp('/sites')
    await waitFor(() => expect(wrapper.find('.load-error').text()).toContain('Database unavailable'))
    expect(wrapper.text()).not.toContain('No sites yet')
    await wrapper
      .findAll('.load-error button')
      .find(b => b.text() === 'Retry')!
      .trigger('click')
    await waitFor(() => expect(rowNames()).toHaveLength(3))
  })
})
