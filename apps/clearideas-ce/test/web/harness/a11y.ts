/**
 * Accessibility assertions for component tests (axe-core via vitest-axe).
 *
 * jsdom performs no layout, so colour-contrast and some region/landmark rules are not
 * meaningful here; they are disabled for component-level checks and covered instead by the
 * Playwright axe scans in `test/e2e`.
 */
import type { VueWrapper } from '@vue/test-utils'
import { expect } from 'vitest'
import { axe, type AxeResults } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'

expect.extend(matchers)

const componentRules = {
  'color-contrast': { enabled: false },
  region: { enabled: false },
  'landmark-one-main': { enabled: false },
  'page-has-heading-one': { enabled: false },
}

export async function runAxe(
  target: VueWrapper<unknown> | Element,
  rules: Record<string, { enabled: boolean }> = {},
) {
  const element = 'element' in target ? (target.element as Element) : target
  return axe(element, { rules: { ...componentRules, ...rules } })
}

export async function expectNoA11yViolations(
  target: VueWrapper<unknown> | Element,
  rules: Record<string, { enabled: boolean }> = {},
): Promise<AxeResults> {
  const results = await runAxe(target, rules)
  expect(results).toHaveNoViolations()
  return results
}

/**
 * Page-level scan with the same policy as the Playwright `expectPageAccessible` helper: serious and
 * critical findings fail, moderate/minor ones (e.g. `heading-order`) are reported by the e2e
 * attachment instead. Use for whole views mounted through `mountApp`; components use
 * `expectNoA11yViolations` (every impact fails).
 */
export async function expectNoBlockingA11yViolations(
  target: VueWrapper<unknown> | Element,
  rules: Record<string, { enabled: boolean }> = {},
) {
  const results = await runAxe(target, rules)
  const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(
    blocking,
    blocking
      .map(v => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map(n => n.html).join('\n  ')}`)
      .join('\n'),
  ).toEqual([])
  return results
}
