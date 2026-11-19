import { expect, test, type Locator, type Page } from '@playwright/test'
import { FakeChatModel } from '../harness/fake-chat-model.js'
import type { TestCeRuntime } from '../harness/runtime.js'
import { startCeServer, type CeTestServer } from './helpers/server.js'
import {
  expectPageAccessible,
  setTheme,
  signInViaApi,
  signInViaForm,
  themeFromProject,
} from './helpers/ui.js'
import { apiCall, createFolder, createSite, multiPagePdf, uploadFile } from './helpers/seed.js'

/**
 * Accessibility scans of the core pages, run in every browser project (light, dark, mobile).
 *
 * Serious/critical axe violations fail the test; the full report is attached for moderate/minor
 * findings. Add a page here whenever a new route lands.
 */
let ctx: TestCeRuntime
let ce: CeTestServer
let baseURL: string

test.beforeAll(async () => {
  ce = await startCeServer({ chatModelAdapter: new FakeChatModel() })
  ctx = ce.ctx
  baseURL = ce.baseURL
})

test.afterAll(async () => {
  await ce.close()
})

test('login page is accessible and the email-code form works end to end', async ({ page }, testInfo) => {
  await setTheme(page, themeFromProject(testInfo))
  await page.goto(`${baseURL}/login`)
  await expect(page.getByRole('heading', { name: 'Sign in with email code' })).toBeVisible()
  await expectPageAccessible(page, testInfo)

  // The brand typeface is self-hosted (@fontsource-variable/inter); it must be loaded, not a system fallback.
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true)

  await signInViaForm(page, ctx, baseURL, 'a11y@clearideas.local')
  await expect(page).toHaveURL(/\/sites/)
})

test('sites page scan', async ({ page }, testInfo) => {
  await setTheme(page, themeFromProject(testInfo))
  await signInViaApi(page, ctx, baseURL, 'a11y@clearideas.local')
  await page.goto(`${baseURL}/sites`)
  await expect(page).toHaveTitle('Sites · Clear Ideas CE')
  await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeAttached()
  // Scan the settled page (table header + empty state), not the loading skeleton.
  await expect(page.getByText('No sites yet')).toBeVisible()
  await expectPageAccessible(page, testInfo)
})

test('settings page scan', async ({ page }, testInfo) => {
  await setTheme(page, themeFromProject(testInfo))
  await signInViaApi(page, ctx, baseURL, 'a11y@clearideas.local')
  await page.goto(`${baseURL}/settings`)
  await expect(page).toHaveTitle('Settings · Clear Ideas CE')
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible()
  await expectPageAccessible(page, testInfo)
})

/**
 * The same policy on pages that have data (rows, menus, role selectors, charts): the empty-workspace
 * scans above cannot see row-level controls. A separate user owns the seeded workspace so the
 * "No sites yet" scan stays valid.
 */
test.describe('pages with data', () => {
  const dataUser = 'a11y-data@clearideas.local'
  let siteId = ''
  let pdfId = ''
  let conversationId = ''

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signInViaApi(page, ctx, baseURL, dataUser, 'Data Owner')
    siteId = await createSite(page, baseURL, 'Accessibility Handbook')
    await apiCall(page, baseURL, `/api/sites/${siteId}`, {
      method: 'PATCH',
      body: { tags: ['docs'], attributes: { ai: { chatEnabled: true, mcpEnabled: false } } },
    })
    const folderId = await createFolder(page, baseURL, siteId, 'Policies')
    await uploadFile(page, baseURL, {
      siteId,
      name: 'welcome.md',
      contentType: 'text/markdown',
      body: Buffer.from('# Welcome\n'),
    })
    pdfId = await uploadFile(page, baseURL, {
      siteId,
      folderId,
      name: 'guide.pdf',
      contentType: 'application/pdf',
      body: multiPagePdf(2),
    })
    await apiCall(page, baseURL, `/api/site/${siteId}/users`, {
      method: 'POST',
      body: { email: 'invitee@clearideas.local', displayName: 'Invited Person', siteRole: 'viewer' },
    })
    await apiCall(page, baseURL, '/api/account/access-keys', {
      method: 'POST',
      body: { name: 'Scan key', keyType: 'mcp', scopes: ['mcp:read'] },
    })
    await ctx.runtime.search.settle()
    // A stored Ask conversation (the turn streams an AI SDK UI message stream).
    const turn = await page.request.post(`${baseURL}/api/chat`, {
      data: { message: { id: 'scan-1', text: 'What does the welcome file say?' } },
    })
    expect(turn.ok()).toBe(true)
    conversationId =
      /"type":"data-conversation","data":\{"id":"([a-f\d]{24})"/.exec(await turn.text())?.[1] ?? ''
    expect(conversationId).not.toBe('')
    await page.close()
  })

  const pages: Array<{ name: string; path: () => string; ready: (page: Page) => Locator }> = [
    {
      name: 'site content',
      path: () => `/site/${siteId}/content`,
      ready: p => p.getByText('welcome.md').first(),
    },
    {
      name: 'site users',
      path: () => `/site/${siteId}/users`,
      ready: p => p.getByText('Invited Person').first(),
    },
    { name: 'site settings', path: () => `/site/${siteId}/settings`, ready: p => p.getByLabel('Site name') },
    {
      name: 'site PDF options',
      path: () => `/site/${siteId}/settings/pdf-options`,
      ready: p => p.getByText('Enable printing'),
    },
    {
      name: 'site AI',
      path: () => `/site/${siteId}/ai`,
      ready: p => p.getByText('Ask about this site', { exact: true }),
    },
    { name: 'ask', path: () => '/ask', ready: p => p.getByText('Ask about your documents') },
    {
      name: 'ask conversation',
      path: () => `/ask/${conversationId}`,
      ready: p => p.getByRole('list', { name: 'Sources' }),
    },
    {
      name: 'PDF file',
      path: () => `/site/${siteId}/file/${pdfId}`,
      ready: p => p.getByLabel('Page number'),
    },
    { name: 'users', path: () => '/users', ready: p => p.getByText('Invited Person').first() },
    {
      name: 'analytics dashboard',
      path: () => '/analytics/dashboard',
      ready: p => p.getByText('Analytics dashboard'),
    },
    {
      name: 'analytics report',
      path: () => '/analytics/most-accessed',
      ready: p => p.getByRole('heading', { level: 1, name: /Most accessed/ }),
    },
    { name: 'agents', path: () => '/agents', ready: p => p.getByRole('heading', { name: 'Agents' }) },
    {
      name: 'notification settings',
      path: () => '/settings/notifications',
      ready: p => p.getByText('Subscribed sites'),
    },
    { name: 'active sessions', path: () => '/settings/sessions', ready: p => p.getByText('This browser') },
    { name: 'access keys', path: () => '/settings/access-keys', ready: p => p.getByText('Scan key') },
  ]

  for (const target of pages) {
    test(`${target.name} scan`, async ({ page }, testInfo) => {
      await setTheme(page, themeFromProject(testInfo))
      await signInViaApi(page, ctx, baseURL, dataUser, 'Data Owner')
      await page.goto(`${baseURL}${target.path()}`)
      await expect(target.ready(page)).toBeVisible()
      await expectPageAccessible(page, testInfo)
    })
  }
})
