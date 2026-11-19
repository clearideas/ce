import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, openSelect, waitFor } from './fixtures/app'
import { installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — Analytics (AnalyticsView, Dashboard, DashboardHorizontalBar, FilterBar,
 * AnalyticsTableReport, UsageTimesBars) through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

async function openAnalytics(category = 'dashboard') {
  const app = await mountApp(`/analytics/${category}`)
  await waitFor(() => expect(backend.calls('GET', '/api/analytics/dashboard').length).toBeGreaterThan(0))
  await waitFor(() => expect(document.body.querySelector('[aria-label="Loading analytics"]')).toBeNull())
  return app
}

describe('Analytics', () => {
  it('redirects /analytics to the dashboard and shows the summary figures', async () => {
    const { wrapper, router } = await mountApp('/analytics')
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/analytics/dashboard'))
    await waitFor(() => expect(document.body.textContent).toContain('Analytics dashboard'))
    expect(wrapper.find('h1').text()).toBe('Analytics')
    expect(document.title).toBe('Analytics · Clear Ideas CE')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Most active content')
    expect(text).toContain('Roadmap.pdf')
    expect(text).toContain('Grace Hopper')
    expect(text).toContain('Storage size')
    // The dashboard request carries the user's time zone and a 30-day window.
    const query = backend.calls('GET', '/api/analytics/dashboard')[0].query
    expect(query.get('timeZone')).toBe('Europe/London')
    expect(query.get('startDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await expectNoBlockingA11yViolations(wrapper)
  })

  it.each([
    ['most-accessed', 'Most accessed content', '/api/analytics/most-accessed', 'Roadmap.pdf'],
    ['most-active', 'Most active users', '/api/analytics/most-active', 'Roadmap.pdf'],
    ['content-activity', 'Content activity', '/api/analytics/content-activity', 'Roadmap.pdf'],
    ['search-terms', 'Search terms', '/api/analytics/search-terms', 'budget'],
  ])('%s report renders its rows', async (category, title, endpoint, cell) => {
    const { wrapper } = await openAnalytics(category)
    await waitFor(() => expect(backend.calls('POST', endpoint)).toHaveLength(1))
    await waitFor(() => expect(document.body.textContent).toContain(cell))
    expect(wrapper.find('h1').text()).toBe(`Analytics: ${title}`)
    const body = backend.calls('POST', endpoint)[0].body as { limit: number; timeZone: string }
    expect(body).toMatchObject({ limit: 10, timeZone: 'Europe/London' })
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('usage times renders a bar per hour', async () => {
    const { wrapper } = await openAnalytics('usage-times')
    await waitFor(() => expect(backend.calls('POST', '/api/analytics/usage-times')).toHaveLength(1))
    await waitFor(() =>
      expect(document.body.querySelector('[aria-label="Activity by hour of day"]')).not.toBeNull(),
    )
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('navigates between reports from the side menu', async () => {
    const { router } = await openAnalytics()
    byText('[role="navigation"][aria-label="Analytics reports"] .v-list-item', 'Search terms')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/analytics/search-terms'))
    await waitFor(() => expect(backend.calls('POST', '/api/analytics/search-terms')).toHaveLength(1))
  })

  it('changing the report limit refreshes with the new limit', async () => {
    await openAnalytics('most-accessed')
    await waitFor(() => expect(backend.calls('POST', '/api/analytics/most-accessed')).toHaveLength(1))
    const limit = document.body.querySelector('input[aria-label="Limit"]')!.closest('.v-input')!
    await openSelect(limit)
    byText('.v-overlay-container .v-list-item', '25')!.click()
    await settle()
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Refresh report"]')!.click()
    await waitFor(() => {
      const calls = backend.calls('POST', '/api/analytics/most-accessed')
      expect((calls.at(-1)!.body as { limit: number }).limit).toBe(25)
    })
  })

  it('shows the empty state with a New site action when there is nothing to analyse', async () => {
    backend.respond('dashboard', { totalSites: 0, totalOwnedOrAdministeredSites: 0 })
    const { wrapper } = await openAnalytics()
    await waitFor(() => expect(document.body.textContent).toContain('Create a site to view analytics'))
    expect(wrapper.findAll('button').some(b => b.text() === 'New site')).toBe(true)
  })

  it('shows the error when the dashboard cannot be loaded', async () => {
    backend.failNext('GET', '/api/analytics/dashboard', 500, { error: 'Analytics unavailable' })
    await openAnalytics()
    await waitFor(() => expect(document.body.textContent).toContain('Analytics unavailable'))
  })
})
