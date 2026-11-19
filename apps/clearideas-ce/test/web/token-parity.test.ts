import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import theme from '../../src-web/src/plugins/vuetify/theme'

/**
 * Plan item 2.1 — one source of colour. The Vuetify theme (plugins/vuetify/theme.ts) defines every
 * colour; stylesheets use `rgb(var(--v-theme-*))` or the derived `--ci-*` aliases in
 * styles/variables.scss. A colour literal anywhere else is drift waiting to happen.
 */
const SRC = path.resolve(import.meta.dirname, '../../src-web/src')

/** Files allowed to contain colour literals, and why. */
const ALLOWED = new Map<string, string>([
  ['styles/variables.scss', 'the token file (shadows)'],
  ['styles/code.scss', 'syntax-highlighting palette (highlight.js token colours)'],
  ['styles/vuetify/variables.scss', 'Vuetify SASS configuration'],
])

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const files = walk(SRC).filter(
  file => /\.(scss|vue)$/.test(file) && !file.includes(`${path.sep}brand${path.sep}`),
)

/** The stylesheet part of a file: whole SCSS files, or the <style> blocks of an SFC. */
function styles(file: string) {
  const content = fs.readFileSync(file, 'utf8')
  if (file.endsWith('.scss')) return content
  return [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
}

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d/g

describe('design tokens (plan 2.1)', () => {
  it('has no colour literals outside the token and palette files', () => {
    const offenders = files.flatMap(file => {
      const relative = path.relative(SRC, file).split(path.sep).join('/')
      if (ALLOWED.has(relative)) return []
      return styles(file)
        .split('\n')
        .filter(line => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .flatMap(line =>
          (line.match(COLOUR_LITERAL) ?? []).map(match => `${relative}: ${match} in "${line.trim()}"`),
        )
    })
    expect(offenders).toEqual([])
  })

  it('references only theme colours that both themes define', () => {
    const themes = theme.themes as Record<'light' | 'dark', { colors: Record<string, string> }>
    const referenced = new Set(
      files.flatMap(file =>
        [...styles(file).matchAll(/--v-theme-([a-z0-9-]+)(?![a-z0-9-]*#\{)/g)].map(m => m[1]),
      ),
    )
    // Vuetify's own non-colour theme variables.
    const vuetifyVariables = new Set(['overlay-multiplier'])
    const missing = [...referenced].filter(
      key =>
        !key.endsWith('-') &&
        !vuetifyVariables.has(key) &&
        !(key in themes.light.colors && key in themes.dark.colors),
    )
    expect(missing).toEqual([])
  })
})
