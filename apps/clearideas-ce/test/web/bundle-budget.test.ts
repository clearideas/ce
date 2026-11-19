import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Bundle budget (plan item 2.12). Runs only when a production build exists (`npm run build:web`),
 * so it is a no-op in a plain unit run but guards the route-splitting in CI where the build
 * precedes the tests.
 */
const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/assets')
const hasBuild = fs.existsSync(assetsDir)

const BUDGETS_KB: Array<[pattern: RegExp, maxKb: number, why: string]> = [
  [/^index-.*\.js$/, 600, 'entry chunk (login + sites): Vue, Vuetify core, router, Pinia, icons'],
  [/^MarkdownRenderer-.*\.js$/, 260, 'markdown-it + curated highlight.js languages'],
]

describe.skipIf(!hasBuild)('web bundle budget', () => {
  const files = hasBuild ? fs.readdirSync(assetsDir) : []

  it.each(BUDGETS_KB)('%s stays under %d kB (%s)', (pattern, maxKb) => {
    const match = files.find(file => pattern.test(file))
    expect(match, `no asset matches ${pattern}`).toBeDefined()
    const sizeKb = fs.statSync(path.join(assetsDir, match!)).size / 1024
    expect(sizeKb, `${match} is ${sizeKb.toFixed(0)} kB`).toBeLessThan(maxKb)
  })

  it('keeps heavy views out of the entry chunk', () => {
    for (const view of [
      'FileView',
      'AgentsView',
      'AnalyticsView',
      'SettingsView',
      'SiteView',
      'DocsView',
      'UsersView',
    ]) {
      expect(
        files.some(file => file.startsWith(`${view}-`)),
        `${view} should be its own chunk`,
      ).toBe(true)
    }
  })
})
