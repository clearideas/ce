import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { FakeChatModel } from '../harness/fake-chat-model.js'
import type { TestCeRuntime } from '../harness/runtime.js'
import { startCeServer, type CeTestServer } from './helpers/server.js'
import { apiCall, createFolder, createSite, documentPdf, uploadFile } from './helpers/seed.js'
import { freezeMotion, setTheme, signInViaApi } from './helpers/ui.js'

/**
 * README screenshots (plan 4.5): `npm run docs:ce:screenshots` writes `docs/screenshots/ce-*.png`
 * (1600 × 1000, light theme) from a seeded workspace on the real server. Each file name matches the
 * screen it shows; README.md references them by those names. Not part of `test:ce:e2e`.
 */
let ctx: TestCeRuntime
let ce: CeTestServer
let baseURL: string
let siteId: string
let pdfId: string

const email = 'admin@example.com'
const outDir = path.resolve(import.meta.dirname, '../../../../docs/screenshots')

test.describe('README screenshots', { tag: '@readme' }, () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test.beforeAll(async ({ browser }) => {
    // A scripted model answers Ask questions from the seeded documents (no provider key needed).
    ce = await startCeServer({ chatModelAdapter: new FakeChatModel() })
    ctx = ce.ctx
    baseURL = ce.baseURL

    const page = await browser.newPage()
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    siteId = await createSite(page, baseURL, 'Product Handbook')
    const wiki = await createSite(page, baseURL, 'Engineering Wiki')
    await createSite(page, baseURL, 'Client Documents')
    await apiCall(page, baseURL, `/api/sites/${siteId}`, {
      method: 'PATCH',
      body: { tags: ['docs', 'internal'], attributes: { ai: { chatEnabled: true, mcpEnabled: false } } },
    })
    const policies = await createFolder(page, baseURL, siteId, 'Policies')
    await createFolder(page, baseURL, siteId, 'Onboarding')
    await createFolder(page, baseURL, wiki, 'Architecture')
    pdfId = await uploadFile(page, baseURL, {
      siteId,
      name: 'Employee Handbook.pdf',
      contentType: 'application/pdf',
      body: handbookPdf(),
    })
    await uploadFile(page, baseURL, {
      siteId,
      name: 'Welcome.md',
      contentType: 'text/markdown',
      body: Buffer.from('# Welcome\n\nStart with the **Employee Handbook**, then the policies folder.\n'),
    })
    await uploadFile(page, baseURL, {
      siteId,
      folderId: policies,
      name: 'Travel policy.txt',
      contentType: 'text/plain',
      body: Buffer.from('Book travel at least two weeks ahead.\n'),
    })
    await apiCall(page, baseURL, '/api/profile', {
      method: 'PATCH',
      body: { attributes: { sites: { favourites: [siteId] } } },
    })
    await page.close()
  })

  test.afterAll(async () => {
    await ce.close()
  })

  test.beforeEach(async ({ page }) => {
    await setTheme(page, 'light')
  })

  test('login', async ({ page }) => {
    await page.goto(`${baseURL}/login`)
    await expect(page.getByRole('heading', { name: 'Sign in with email code' })).toBeVisible()
    await capture(page, 'ce-login.png')
  })

  test('sites', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    await page.goto(`${baseURL}/sites`)
    await expect(page.getByRole('main').getByText('Client Documents')).toBeVisible()
    await capture(page, 'ce-sites.png')
  })

  test('file viewer', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    await page.goto(`${baseURL}/site/${siteId}/file/${pdfId}`)
    await expect(page.getByLabel('Page number')).toHaveValue('1', { timeout: 20_000 })
    await expect(page.locator('canvas.ci-pdf-viewer__canvas').first()).toBeVisible()
    await capture(page, 'ce-file-viewer.png')
  })

  test('ask', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    await ctx.runtime.search.settle()
    await page.goto(`${baseURL}/ask`)
    await page.getByRole('textbox', { name: 'Ask a question' }).fill('What does the travel policy say?')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('list', { name: 'Sources' })).toBeVisible()
    await expect(page).toHaveURL(/\/ask\/[0-9a-f]{24}$/)
    await page.getByRole('textbox', { name: 'Ask a question' }).blur()
    await capture(page, 'ce-ask.png')
  })

  test('site AI', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    await page.goto(`${baseURL}/site/${siteId}/ai`)
    await expect(page.getByText('SITE AI').first()).toBeVisible()
    await capture(page, 'ce-site-ai.png')
  })

  test('site settings', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    await page.goto(`${baseURL}/site/${siteId}/settings`)
    await expect(page.getByLabel('Site name')).toHaveValue('Product Handbook')
    await capture(page, 'ce-site-settings.png')
  })

  test('analytics', async ({ page }) => {
    await signInViaApi(page, ctx, baseURL, email, 'Alex Morgan')
    // Some activity to report on: open the files a few times.
    for (let round = 0; round < 2; round += 1) {
      await page.goto(`${baseURL}/site/${siteId}/file/${pdfId}`)
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
        'Employee Handbook.pdf',
      )
    }
    await page.goto(`${baseURL}/analytics/dashboard`)
    await expect(page.getByText('Analytics dashboard')).toBeVisible()
    await capture(page, 'ce-analytics.png')
  })
})

function handbookPdf() {
  return documentPdf([
    {
      heading: 'Employee Handbook',
      paragraphs: [
        'Welcome to the team. This handbook explains how we work, where to find things and who to ask ' +
          'when something is unclear. Read it during your first week and keep it close afterwards.',
        'Everything in this site is maintained by the people team. If a page is out of date, leave a ' +
          'comment on the document or write to the site owner; we review changes every month.',
        'Sections: working hours and time off, travel and expenses, equipment and security, benefits, ' +
          'and the people to contact for each of them.',
      ],
    },
    {
      heading: 'Working hours and time off',
      paragraphs: [
        'Core hours are 10:00 to 15:00 in your local time zone. Outside core hours, plan your day the way ' +
          'that works best for you and your team.',
        'Request leave at least two weeks ahead. Public holidays follow the calendar of the country you ' +
          'work from.',
      ],
    },
    {
      heading: 'Travel and expenses',
      paragraphs: [
        'Book travel through the shared travel desk and keep receipts for every expense. Claims are paid ' +
          'with the next payroll run.',
      ],
    },
    {
      heading: 'Equipment and security',
      paragraphs: [
        'Keep your laptop encrypted and up to date, lock your screen when you step away, and report a lost ' +
          'device on the same day.',
      ],
    },
  ])
}

async function capture(page: Page, name: string) {
  await freezeMotion(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(outDir, name), fullPage: false })
}
