import { expect, test, type Page } from '@playwright/test'
import { FakeChatModel } from '../harness/fake-chat-model.js'
import type { TestCeRuntime } from '../harness/runtime.js'
import { startCeServer, type CeTestServer } from './helpers/server.js'
import { apiCall, createSite, multiPagePdf, uploadFile } from './helpers/seed.js'
import { expectToast, setTheme, signInViaApi, signInViaForm, themeFromProject } from './helpers/ui.js'

/**
 * Plan item 4.3 — UI journeys through the real server, in the browser projects. Breadth (every
 * dialog, every settings card, error states) is covered by the Vuetify-mounted feature specs in
 * test/web; these journeys cover what needs a real browser and server: sign-in, file choosers,
 * the search index, pdf.js, persisted preferences across reloads, session revocation, layout, and
 * streamed chat answers (a scripted model on the real agent runtime and tools).
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

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 960
const dialog = (page: Page) => page.getByRole('dialog')

test('workspace journey: site, folder, upload, delete, search, PDF, preferences, unsaved changes', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(page), 'desktop toolbar journey; the mobile shell has its own journey below')
  test.setTimeout(120_000)
  await setTheme(page, themeFromProject(testInfo))
  const email = `journey-${testInfo.project.name}@clearideas.local`
  await signInViaForm(page, ctx, baseURL, email)

  // Empty workspace → "New site" call to action → dialog → the new site.
  await expect(page.getByText('No sites yet')).toBeVisible()
  await page.locator('.v-empty-state').getByRole('button', { name: 'New site' }).click()
  await dialog(page).getByLabel('Name').fill('Journey Site')
  await dialog(page).getByRole('button', { name: 'Create site' }).click()
  await expect(page).toHaveURL(/\/site\/[0-9a-f]{24}$/)
  const siteId = page.url().split('/').pop()!
  await expect(page).toHaveTitle('Journey Site · Clear Ideas CE')

  // New folder.
  await page.getByRole('button', { name: 'New folder' }).first().click()
  await dialog(page).getByLabel('Name').fill('Reports')
  await dialog(page).getByRole('button', { name: 'Create folder' }).click()
  await expect(page.getByRole('main').getByText('Reports', { exact: true })).toBeVisible()

  // Upload three files through the file chooser behind the Upload button.
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload files' }).first().click()
  await (
    await chooser
  ).setFiles([
    { name: 'alpha.txt', mimeType: 'text/plain', buffer: Buffer.from('alpha') },
    { name: 'beta.txt', mimeType: 'text/plain', buffer: Buffer.from('beta') },
    { name: 'guide.pdf', mimeType: 'application/pdf', buffer: multiPagePdf(2) },
  ])
  await expectToast(page, '3 files uploaded.')
  for (const name of ['alpha.txt', 'beta.txt', 'guide.pdf'])
    await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible()

  // Select two rows (ticking must not open them) and delete them after confirmation.
  await page.getByLabel('Select alpha.txt').check()
  await page.getByLabel('Select beta.txt').check()
  await expect(page).toHaveURL(new RegExp(`/site/${siteId}$`))
  await page.getByRole('button', { name: 'Delete 2 items' }).click()
  await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click()
  await expectToast(page, '2 items deleted.')
  await expect(page.getByRole('main').getByText('alpha.txt', { exact: true })).toHaveCount(0)

  // Metadata search (the index is updated asynchronously), then open the result.
  await expect
    .poll(async () => {
      const result = await apiCall<{ results: unknown[] }>(page, baseURL, `/api/site/${siteId}/search`, {
        method: 'POST',
        body: { q: '@contentType:application/pdf' },
      })
      return result.results.length
    })
    .toBeGreaterThan(0)
  const search = page.getByRole('search').getByRole('textbox')
  await search.click()
  await page.keyboard.type('@contentType:application/pdf')
  await page.keyboard.press('Enter')
  await expect(page.locator('.search-results-summary__context')).toContainText('1 result in Journey Site')
  await page.locator('.search-results-item').filter({ hasText: 'guide.pdf' }).click()
  await expect(page).toHaveURL(new RegExp(`/site/${siteId}/file/[0-9a-f]{24}$`))

  // pdf.js renders the document and pages through it.
  const pageNumber = page.getByLabel('Page number')
  await expect(pageNumber).toHaveValue('1')
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(pageNumber).toHaveValue('2')
  await page.getByRole('tab', { name: 'Properties' }).click()
  await expect(page.getByText('guide.pdf Properties')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('guide.pdf')

  // View preference survives a reload.
  await page.goto(`${baseURL}/site/${siteId}`)
  await page.getByRole('button', { name: /^View:/ }).click()
  await page.locator('.v-overlay-container .v-list-item', { hasText: 'Tiles' }).click()
  await expect(page.locator('.content-tile-item').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('.content-tile-item').first()).toBeVisible()

  // Theme and navigation rail.
  const switchTheme = page.getByRole('button', { name: /Switch to (dark|light) mode/ })
  const before = await page.locator('.v-application').getAttribute('class')
  await switchTheme.click()
  await expect(page.locator('.v-application')).not.toHaveAttribute('class', before ?? '')
  await page.getByRole('button', { name: 'Toggle menu' }).click()
  await expect(page.locator('.layout-vertical-nav')).toHaveClass(/v-navigation-drawer--rail/)
  await page.getByRole('button', { name: 'Toggle menu' }).click()

  // Unsaved site settings: leaving asks first; "Keep editing" stays.
  await page.goto(`${baseURL}/site/${siteId}/settings`)
  await page.getByLabel('Site name').fill('Journey Site (renamed)')
  await page.getByRole('tab', { name: 'Content' }).click()
  await expect(dialog(page).getByText('You have changes that have not been saved.')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expectToast(page, 'Site settings saved.')
  await expect(page.getByRole('heading', { level: 1, name: 'Journey Site (renamed)' })).toBeAttached()

  // Sign out from the account menu.
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByText('Log out', { exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('settings journey: profile, notifications, access keys and active sessions', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(isMobile(page), 'desktop settings layout')
  await setTheme(page, themeFromProject(testInfo))
  const email = `settings-${testInfo.project.name}@clearideas.local`
  await signInViaApi(page, ctx, baseURL, email, 'Settings Person')
  await apiCall(page, baseURL, '/api/sites', { method: 'POST', body: { name: 'Notify Site' } })

  // Profile.
  await page.goto(`${baseURL}/settings`)
  await page.getByLabel('Display name').fill('Settings Person Renamed')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expectToast(page, 'Profile updated.')

  // Notifications: unsubscribe from a site.
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Notifications' })
    .click()
  await expect(page).toHaveURL(/\/settings\/notifications$/)
  await page.getByLabel('Notify Site').uncheck()
  await page.getByRole('button', { name: 'Save notification settings' }).click()
  await expectToast(page, 'Notification settings updated.')

  // Access keys: create (secret shown once), then revoke after confirmation.
  await page.goto(`${baseURL}/settings/access-keys`)
  await page
    .getByRole('button', { name: /New access key|Create access key/ })
    .first()
    .click()
  await dialog(page).getByLabel('Name').fill('Journey key')
  await dialog(page).getByLabel('Read MCP context').check()
  await dialog(page)
    .getByRole('button', { name: /Create/ })
    .click()
  await expect(page.getByText('Save this key now')).toBeVisible()
  await page.getByRole('button', { name: 'Revoke access key Journey key' }).click()
  await dialog(page).getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('Revoked').first()).toBeVisible()

  // Active sessions: a second browser signs in; sign it out from here.
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await signInViaApi(otherPage, ctx, baseURL, email, 'Settings Person')
  await page.goto(`${baseURL}/settings/sessions`)
  await expect(page.getByText('This browser')).toBeVisible()
  const otherSessions = page.getByRole('list', { name: 'Other sessions' })
  await expect(otherSessions.getByRole('listitem')).toHaveCount(1)
  await otherSessions.getByRole('button', { name: /^Sign out session on / }).click()
  await dialog(page).getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByText('You are not signed in anywhere else.')).toBeVisible()
  expect((await otherPage.request.get(`${baseURL}/api/auth/session`)).status()).toBe(401)
  await other.close()
})

test('mobile shell: navigation drawer and account menu', async ({ page }, testInfo) => {
  test.skip(!isMobile(page), 'mobile-only layout')
  await setTheme(page, themeFromProject(testInfo))
  await signInViaApi(page, ctx, baseURL, 'mobile-journey@clearideas.local', 'Mobile Person')
  await page.goto(`${baseURL}/sites`)
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click()
  await expect(page).toHaveURL(/\/users$/)
  await expect(page).toHaveTitle('Users · Clear Ideas CE')

  // Search collapses to a button on narrow screens and expands on demand.
  await page.getByRole('button', { name: 'Search content' }).click()
  await expect(page.getByRole('search').getByRole('textbox')).toBeVisible()
  // Expanded search takes the whole bar; closing it brings the account menu back.
  await page.getByRole('button', { name: 'Close search' }).click()
  await expect(page.getByRole('button', { name: 'Search content' })).toBeVisible()

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByText('Log out', { exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('ask journey: question across sites, sources, history, site AI conversation', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await setTheme(page, themeFromProject(testInfo))
  await signInViaApi(page, ctx, baseURL, `ask-${testInfo.project.name}@clearideas.local`, 'Ask Person')
  const siteId = await createSite(page, baseURL, 'Travel Handbook')
  await apiCall(page, baseURL, `/api/sites/${siteId}`, {
    method: 'PATCH',
    body: { attributes: { ai: { enabled: true, chatEnabled: true } } },
  })
  const fileId = await uploadFile(page, baseURL, {
    siteId,
    name: 'travel-policy.md',
    contentType: 'text/markdown',
    body: Buffer.from('Travel must be booked two weeks ahead.'),
  })
  await ctx.runtime.search.settle()

  // Ask from the main navigation; the answer streams in with the file it used as a source.
  await page.goto(`${baseURL}/sites`)
  if (isMobile(page)) await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ask' }).click()
  await expect(page).toHaveURL(/\/ask$/)
  await expect(page).toHaveTitle('Ask · Clear Ideas CE')
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('What is the travel policy?')
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('According to travel-policy.md: Travel must be booked two weeks ahead.'),
  ).toBeVisible()
  const source = page.getByRole('list', { name: 'Sources' }).getByRole('link', { name: /travel-policy\.md/ })
  await expect(source).toHaveAttribute('href', `/site/${siteId}/file/${fileId}`)
  await expect(page).toHaveURL(/\/ask\/[0-9a-f]{24}$/)
  const askUrl = page.url()

  // Stored on the server: a reload shows the conversation again.
  await page.reload()
  await expect(page.getByText('According to travel-policy.md')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What is the travel policy?' })).toBeVisible()

  // The source opens the file.
  await source.click()
  await expect(page).toHaveURL(new RegExp(`/site/${siteId}/file/${fileId}$`))

  // A conversation in the site's AI tab is scoped to the site and listed under Ask as well.
  await page.goto(`${baseURL}/site/${siteId}/ai`)
  await page.getByRole('textbox', { name: 'Ask this site' }).fill('When must travel be booked?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('According to travel-policy.md').first()).toBeVisible()
  await page.goto(askUrl)
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'History' }).click()
    await expect(
      page.locator('.v-overlay-container .v-list-item', { hasText: 'When must travel be booked?' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  } else {
    const history = page.getByRole('navigation', { name: 'Conversations' })
    await expect(
      history.getByRole('link', { name: /When must travel be booked\?.*Travel Handbook/ }),
    ).toBeVisible()
    await expect(history.getByRole('link', { name: /What is the travel policy\?/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
})
