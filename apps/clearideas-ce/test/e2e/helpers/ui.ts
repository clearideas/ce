/**
 * Shared Playwright helpers for CE UI journeys.
 *
 * Prefer these over ad-hoc `getByText(...).first()` assertions: they encode the accessible
 * names and roles the UI is expected to expose, so a regression in semantics fails the test.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { createDefaultUserAttributes } from '@clearideas/core'
import type { TestCeRuntime } from '../../harness/runtime.js'

export type ThemeName = 'light' | 'dark'

/** Request a sign-in code via the API, read it from the captured email, and submit it through the UI form. */
export async function signInViaForm(
  page: Page,
  ctx: TestCeRuntime,
  baseURL: string,
  email: string,
  name = 'UI Test User',
) {
  await ensureInvited(ctx, email, name)
  await page.goto(`${baseURL}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Sign-in code')).toBeVisible()
  const code = ctx.email.lastCode(email)
  if (!code) throw new Error(`No sign-in code captured for ${email}`)
  await page.getByLabel('Sign-in code').fill(code)
  await page.getByRole('button', { name: 'Verify code' }).click()
  await page.waitForURL(/\/sites/)
}

/**
 * CE admits the first user and invited addresses only. Specs that sign in as a second person stand in
 * for the invitation by creating the member directly (as inviting to a site does). No-op for the
 * first sign-in of a runtime, which creates the owner.
 */
export async function ensureInvited(ctx: TestCeRuntime, email: string, displayName: string) {
  const { UserModel, AccountModel } = ctx.runtime.models
  const address = email.toLowerCase()
  if ((await UserModel.estimatedDocumentCount()) === 0) return
  if (await UserModel.exists({ email: address })) return
  const user = await UserModel.create({
    email: address,
    displayName,
    status: 'active',
    roles: ['member'],
    attributes: createDefaultUserAttributes(),
  })
  await AccountModel.create({ name: `${displayName}'s Workspace`, owner: user._id, attributes: {} })
}

/** Sign in through the API only (fast path for specs that are not about authentication). */
export async function signInViaApi(
  page: Page,
  ctx: TestCeRuntime,
  baseURL: string,
  email: string,
  name = 'UI Test User',
) {
  await ensureInvited(ctx, email, name)
  const sent = await page.request.post(`${baseURL}/api/auth/code/send`, { data: { email } })
  expect(sent.ok(), `code/send for ${email}: ${sent.status()} ${await sent.text()}`).toBe(true)
  const code = ctx.email.lastCode(email)
  if (!code) throw new Error(`No sign-in code captured for ${email}`)
  const response = await page.request.post(`${baseURL}/api/auth/code/verify`, { data: { email, code, name } })
  expect(response.ok()).toBe(true)
}

/** Persist the theme the way the app does, so the next navigation renders in it. */
export async function setTheme(page: Page, theme: ThemeName) {
  await page.addInitScript(value => window.localStorage.setItem('app-theme', value), theme)
}

/** Resolve the theme a project should use from Playwright's `colorScheme` setting. */
export function themeFromProject(testInfo: TestInfo): ThemeName {
  return testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light'
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('.Toastify__toast').filter({ hasText: text })).toBeVisible()
}

/**
 * Run axe on the current page. Serious/critical violations fail the test; the full result is
 * attached to the report so moderate/minor findings stay visible without blocking.
 */
export async function expectPageAccessible(
  page: Page,
  testInfo: TestInfo,
  options: { disableRules?: string[] } = {},
) {
  // Scan the rendered UI after fonts and entry transitions settle. Contrast can be lower mid-fade.
  await page.evaluate(async () => {
    await document.fonts.ready
    const transitions = document
      .getAnimations()
      .filter(
        animation =>
          animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime),
      )
    await Promise.allSettled(transitions.map(animation => animation.finished))
  })
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ])
  if (options.disableRules?.length) builder.disableRules(options.disableRules)
  const results = await builder.analyze()
  await testInfo.attach('axe-results', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  })
  const blocking = results.violations.filter(
    violation => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(
    blocking,
    blocking
      .map(v => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map(n => n.target.join(' ')).join('\n  ')}`)
      .join('\n'),
  ).toEqual([])
}

/** Disable CSS transitions/animations so screenshots and timing-sensitive assertions are stable. */
export async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }`,
  })
}
