#!/usr/bin/env node
/**
 * CE UI convention checker (dependency-free).
 *
 * Enforces the UI conventions documented in `apps/clearideas-ce/docs/ui-conventions.md` that
 * ESLint / Stylelint cannot express cheaply, using a *ratchet*: every budgeted rule has a
 * baseline count in `scripts/ce-ui-conventions.baseline.json`. The check fails when a count
 * rises above its baseline, and asks you to lower the baseline when a count drops, so debt can
 * only go down. "Hard" rules must be at zero.
 *
 * Usage:
 *   node scripts/check-ce-ui-conventions.mjs                 # check
 *   node scripts/check-ce-ui-conventions.mjs --update-baseline  # record current counts
 *   node scripts/check-ce-ui-conventions.mjs --verbose       # list every occurrence
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const verbose = args.has('--verbose')
const updateBaseline = args.has('--update-baseline')
const baselinePath = path.join(root, 'scripts/ce-ui-conventions.baseline.json')

const WEB_SRC = 'apps/clearideas-ce/src-web/src'
const SOURCE_ROOTS = [WEB_SRC, 'packages/clearideas-pdf-viewer/src']
const EXCLUDED = [
  // Brand SVG path data.
  `${WEB_SRC}/components/brand/Logo.vue`,
  `${WEB_SRC}/components/brand/Icon.vue`,
]

/**
 * Each rule: { id, kind: 'hard' | 'budget', description, files: RegExp, pattern: RegExp (global), skip?(line) }
 * Rules are evaluated per source line and count *occurrences* (not lines), so reformatting a
 * one-line template across several lines never changes a count. `skip` drops lines such as
 * comments or known-safe call sites before matching.
 */
const isComment = line => /^\s*(?:\/\/|\*|\/\*|<!--)/.test(line)

const rules = [
  {
    id: 'no-vtooltip',
    kind: 'hard',
    description: 'VTooltip is forbidden; vue-tippy is the single tooltip system.',
    files: /\.vue$/,
    pattern: /<VTooltip\b|<v-tooltip\b/g,
  },
  {
    id: 'no-native-dialogs',
    kind: 'hard',
    description: 'window.confirm/alert/prompt must be replaced with BaseDialog / useAlert().',
    files: /\.(vue|ts)$/,
    pattern: /\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/g,
    skip: line => isComment(line) || /\balert\.(?:add|remove|addOfflineToast|dismissOfflineToasts)\b|useAlert\(|updateAlertTheme\(/.test(line),
  },
  {
    id: 'no-pro-icon-prefix',
    kind: 'hard',
    description: 'FontAwesome Pro style prefixes (fasl, fass, fasds, fad, fal, fat, fak) are meaningless on the Free set; use fas/far via the icon map.',
    files: /\.(vue|ts)$/,
    pattern: /\b(?:fasl|fass|fasds|fad|fal|fat|fak)\s+fa-/g,
    skip: isComment,
  },
  {
    id: 'no-pro-only-icons',
    kind: 'hard',
    description: 'Icon names that only exist in FontAwesome Pro render as empty SVGs with the Free set.',
    files: /\.(vue|ts)$/,
    pattern: /\bfa-(?:sparkles|files|bell-exclamation|circle-envelope|user-chart|file-chart-column|microchip-ai|comment-ai|building-shield|mobile-notch|sun-bright|moon-stars|spinner-third|books|turn-down-left|arrow-long)\b/g,
    skip: isComment,
  },
  {
    id: 'no-class-inside-icon-name',
    kind: 'hard',
    description: 'Utility classes must not be placed inside a VIcon name string (e.g. `<VIcon>fas fa-home mb-6</VIcon>`).',
    files: /\.vue$/,
    pattern: /<VIcon[^>]*>\s*(?:fa[a-z]*\s+)?fa-[a-z0-9-]+\s+(?:m|p)[abtlrxy]?-\d/g,
  },
  {
    id: 'important-budget',
    kind: 'budget',
    description: '`!important` declarations (global SCSS and SFC <style>). Phase 2 moves overrides into Vuetify SASS variables / defaults.',
    files: /\.(vue|scss)$/,
    pattern: /!important/g,
    skip: isComment,
  },
  {
    id: 'explicit-any-budget',
    kind: 'budget',
    description: 'Explicit `any` in the web tree; Phase 3.11 replaces these with `types/domain.ts` types.',
    files: /\.(vue|ts)$/,
    pattern: /(?::\s*any\b|<any>|\bas any\b|\bany\[\])/g,
    skip: isComment,
  },
  {
    id: 'inline-style-budget',
    kind: 'budget',
    description: 'Inline `style=""` attributes; prefer scoped classes and tokens.',
    files: /\.vue$/,
    pattern: /(?<![:\w-])style="[^"]*[a-z]/g,
  },
  {
    id: 'long-line-budget',
    kind: 'hard',
    description: 'Lines over 160 characters (minified-style SFC templates). Prettier is the long-term fix.',
    files: /\.(vue|ts|scss)$/,
    pattern: /^.{161,}$/g,
  },
]

/**
 * Whole-file rules, for checks that span lines (a Vue tag's attributes are usually one per line).
 * `scan(content)` returns the 1-based line of every occurrence.
 */
const fileRules = [
  {
    id: 'progress-needs-name',
    kind: 'hard',
    description:
      'VProgressCircular / VProgressLinear render role="progressbar" and need an accessible name (`aria-label`) or `aria-hidden="true"` when a visible label already says it (axe aria-progressbar-name, serious).',
    files: /\.vue$/,
    scan: content => {
      const lines = []
      for (const match of content.matchAll(/<VProgress(?:Circular|Linear)\b[^>]*?\/?>/gs)) {
        if (/\s:?aria-(?:label|labelledby|hidden)\b/.test(match[0])) continue
        lines.push(content.slice(0, match.index).split('\n').length)
      }
      return lines
    },
  },
]
rules.push(...fileRules)

const findings = new Map(rules.map(rule => [rule.id, []]))

for (const file of (await Promise.all(SOURCE_ROOTS.map(dir => listFiles(path.join(root, dir))))).flat()) {
  const relative = toPosix(path.relative(root, file))
  if (EXCLUDED.includes(relative)) continue
  const applicable = rules.filter(rule => rule.files.test(relative))
  if (applicable.length === 0) continue
  const content = await fs.readFile(file, 'utf8')
  for (const rule of applicable.filter(candidate => candidate.scan)) {
    for (const line of rule.scan(content)) findings.get(rule.id).push({ location: `${relative}:${line}`, count: 1 })
  }
  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const rule of applicable.filter(candidate => !candidate.scan)) {
      if (rule.skip?.(line)) continue
      const matches = line.match(rule.pattern)
      if (!matches) continue
      findings.get(rule.id).push({ location: `${relative}:${index + 1}`, count: matches.length })
    }
  })
}

const counts = Object.fromEntries(
  rules.map(rule => [rule.id, findings.get(rule.id).reduce((total, finding) => total + finding.count, 0)]),
)

if (updateBaseline) {
  const budgeted = Object.fromEntries(rules.filter(rule => rule.kind !== 'hard').map(rule => [rule.id, counts[rule.id]]))
  await fs.writeFile(baselinePath, `${JSON.stringify(budgeted, null, 2)}\n`)
  console.log(`Baseline written to ${toPosix(path.relative(root, baselinePath))}`)
  for (const [id, count] of Object.entries(budgeted)) console.log(`- ${id}: ${count}`)
  process.exit(0)
}

const baseline = await readBaseline()
const failures = []
const improvements = []

for (const rule of rules) {
  const count = counts[rule.id]
  const locations = findings.get(rule.id)
  if (rule.kind === 'hard') {
    if (count > 0) failures.push(formatFailure(rule, count, 0, locations))
    continue
  }
  const allowed = baseline[rule.id]
  if (allowed === undefined) {
    failures.push(`${rule.id}: no baseline recorded (run with --update-baseline)`)
    continue
  }
  if (count > allowed) failures.push(formatFailure(rule, count, allowed, locations))
  else if (count < allowed) improvements.push(`${rule.id}: ${count} (baseline ${allowed})`)
  if (verbose && count > 0) {
    console.log(`\n[${rule.id}] ${count} occurrence(s):`)
    for (const finding of locations) console.log(`  ${formatFinding(finding)}`)
  }
}

if (improvements.length > 0) {
  console.log('CE UI conventions: counts dropped below baseline — lower it with --update-baseline so the ratchet holds:')
  for (const line of improvements) console.log(`- ${line}`)
}

if (failures.length > 0) {
  console.error('CE UI conventions failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('CE UI conventions OK')
for (const rule of rules) console.log(`- ${rule.id}: ${counts[rule.id]}${rule.kind === 'hard' ? ' (hard)' : ` (baseline ${baseline[rule.id]})`}`)

function formatFailure(rule, count, allowed, locations) {
  const shown = locations.slice(0, verbose ? locations.length : 15)
  const more = locations.length > shown.length ? `\n    … and ${locations.length - shown.length} more (use --verbose)` : ''
  return `${rule.id}: ${count} found, ${allowed} allowed. ${rule.description}\n    ${shown.map(formatFinding).join('\n    ')}${more}`
}

function formatFinding(finding) {
  return finding.count > 1 ? `${finding.location} (×${finding.count})` : finding.location
}

async function readBaseline() {
  try {
    return JSON.parse(await fs.readFile(baselinePath, 'utf8'))
  } catch {
    return {}
  }
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(full)))
    else files.push(full)
  }
  return files.sort()
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}
