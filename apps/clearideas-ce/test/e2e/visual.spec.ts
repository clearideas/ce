import { expect, test, type Page } from '@playwright/test'
import type { TestCeRuntime } from '../harness/runtime.js'
import { FakeChatModel } from '../harness/fake-chat-model.js'
import { startCeServer, type CeTestServer } from './helpers/server.js'
import { setTheme, signInViaApi, themeFromProject } from './helpers/ui.js'

/**
 * Visual baselines for the screens the style consolidation (plan Batch C: tokens,
 * `overrides.scss`, side-nav layouts) touches. Runs in every browser project (light, dark, mobile).
 *
 * - `npm run test:ce:visual:update` captures/refreshes the baselines (commit the PNGs under
 *   `test/e2e/__screenshots__`).
 * - `npm run test:ce:visual` compares against them; a diff is expected whenever a change is
 *   deliberate — review the report, then update.
 *
 * The functional e2e run (`test:ce:e2e`) excludes these (`--grep-invert @visual`) so a missing or
 * stale baseline never blocks it. Seeded data is deterministic; relative timestamps are masked.
 */
let ctx: TestCeRuntime
let ce: CeTestServer
let baseURL: string
let siteId: string
let folderId: string

const email = 'visual@clearideas.local'

test.describe('visual baselines', { tag: '@visual' }, () => {
  test.beforeAll(async ({ browser }) => {
    ce = await startCeServer({ chatModelAdapter: new FakeChatModel() })
    ctx = ce.ctx
    baseURL = ce.baseURL

    // Seed once: two sites (one favourite), a folder and a file, a second site member.
    const page = await browser.newPage()
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    const api = async (route: string, input: { method?: string; body?: unknown } = {}) => {
      const response = await page.request.fetch(`${baseURL}${route}`, {
        method: input.method ?? 'GET',
        data: input.body,
        headers: input.body ? { 'content-type': 'application/json' } : undefined,
      })
      expect(response.ok(), `${input.method ?? 'GET'} ${route}`).toBe(true)
      return response.json()
    }
    const primary = await api('/api/sites', { method: 'POST', body: { name: 'Product Handbook' } })
    siteId = primary.site.id
    await api('/api/sites', { method: 'POST', body: { name: 'Engineering Wiki' } })
    await api(`/api/sites/${siteId}`, {
      method: 'PATCH',
      body: { tags: ['docs', 'internal'], attributes: { ai: { chatEnabled: true, mcpEnabled: false } } },
    })
    const folder = await api(`/api/sites/${siteId}/folders`, { method: 'POST', body: { name: 'Policies' } })
    folderId = folder.folder.id
    const body = Buffer.from('# Welcome\n\nThis is the handbook.\n')
    const target = await api('/api/files/upload-target', {
      method: 'POST',
      body: { siteId, fileName: 'welcome.md', contentType: 'text/markdown', size: body.byteLength },
    })
    const upload = await page.request.put(`${baseURL}${target.target.url}`, {
      data: body,
      headers: { 'content-type': 'text/markdown', ...(target.target.headers ?? {}) },
    })
    expect(upload.ok()).toBe(true)
    await api('/api/profile', {
      method: 'PATCH',
      body: { attributes: { sites: { favourites: [siteId] } } },
    })
    await page.close()
  })

  test.afterAll(async () => {
    await ce.close()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    await setTheme(page, themeFromProject(testInfo))
  })

  test('login', async ({ page }) => {
    await page.goto(`${baseURL}/login`)
    await expect(page.getByRole('heading', { name: 'Sign in with email code' })).toBeVisible()
    await snapshot(page, 'login.png')
  })

  test('sites list', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/sites`)
    await expect(page.getByText('Product Handbook').first()).toBeVisible()
    await expect(page.getByText('Engineering Wiki').first()).toBeVisible()
    await snapshot(page, 'sites-list.png')
  })

  test('sites tiles', async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem('ci-ui-preferences', JSON.stringify({ tileView: true })),
    )
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/sites`)
    await expect(page.getByText('Product Handbook').first()).toBeVisible()
    await snapshot(page, 'sites-tiles.png')
  })

  test('new site dialog', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/sites`)
    await page.getByRole('button', { name: 'New site' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await snapshot(page, 'new-site-dialog.png')
  })

  test('site content', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/site/${siteId}/content`)
    await expect(page.getByText('Policies').first()).toBeVisible()
    await expect(page.getByText('welcome.md').first()).toBeVisible()
    await snapshot(page, 'site-content.png')
  })

  test('site folder (empty)', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/site/${siteId}/${folderId}/content`)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
    await snapshot(page, 'site-folder-empty.png')
  })

  test('site users', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/site/${siteId}/users`)
    await expect(page.getByText('Visual Tester').first()).toBeVisible()
    await snapshot(page, 'site-users.png')
  })

  test('site settings', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/site/${siteId}/settings`)
    await expect(page.getByRole('button', { name: 'Save' }).first()).toBeAttached()
    await snapshot(page, 'site-settings.png')
  })

  test('site ai', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/site/${siteId}/ai`)
    await expect(page.getByText('SITE AI').first()).toBeVisible()
    await snapshot(page, 'site-ai.png')
  })

  test('ask', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/ask`)
    await expect(page.getByText('Ask about your documents')).toBeVisible()
    await snapshot(page, 'ask.png')
  })

  test('users', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/users`)
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeAttached()
    await expect(page.getByText('Visual Tester').first()).toBeVisible()
    await snapshot(page, 'users.png')
  })

  test('profile settings', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/settings`)
    await expect(page).toHaveTitle('Settings · Clear Ideas CE')
    await snapshot(page, 'settings.png')
  })

  test('agents', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/agents`)
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
    await snapshot(page, 'agents.png')
  })

  test('analytics dashboard', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Visual Tester')
    await page.goto(`${baseURL}/analytics/dashboard`)
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
    await snapshot(page, 'analytics-dashboard.png')
  })
})

/** Full-viewport screenshot with time-relative text masked and fonts settled. */
async function snapshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    fullPage: false,
    mask: [
      page.getByText(/\b(just now|\d+ (seconds?|minutes?|hours?) ago|in \d+ (seconds?|minutes?|hours?))\b/),
    ],
    maskColor: '#999999',
  })
}
