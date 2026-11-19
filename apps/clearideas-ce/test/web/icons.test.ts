import { findIconDefinition } from '@fortawesome/fontawesome-svg-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import siteIcons from '../../src-web/src/config/siteIcons'
import {
  ICONS,
  LEGACY_ICON_ALIASES,
  ROLE_ICONS,
  registerIcons,
  resolveIconLookup,
} from '../../src-web/src/icons'
import { aliases } from '../../src-web/src/plugins/vuetify/icons'
import { contentTypeIconName } from '../../src-web/src/utils/format'

/**
 * The app registers only the FontAwesome Free glyphs it uses (icons/registry.ts). A name that is
 * not registered renders as an empty SVG with no runtime error, so this test scans every icon
 * string the UI can produce and asserts it resolves.
 */
const webSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src-web/src')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function sourceIconStrings() {
  const found = new Set<string>()
  for (const file of walk(webSrc)) {
    if (!/\.(vue|ts)$/.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\b(fa[a-z]*\s+)?fa-([a-z0-9-]+)\b/g)) {
      const name = match[2]
      if (name === 'spin' || name === 'fade') continue // FontAwesome CSS animation classes
      found.add(`${(match[1] ?? 'fas ').trim()} fa-${name}`)
    }
  }
  return [...found].sort()
}

function expectResolvable(value: string) {
  const lookup = resolveIconLookup(value)
  const definition = findIconDefinition(lookup)
  expect(
    definition,
    `"${value}" → ${lookup.prefix}/${lookup.iconName} is not registered in icons/registry.ts`,
  ).toBeDefined()
}

describe('icon registry', () => {
  registerIcons()

  it('resolves every icon string used in the web source', () => {
    const strings = sourceIconStrings()
    expect(strings.length).toBeGreaterThan(50)
    for (const value of strings) expectResolvable(value)
  })

  it('resolves the concept map, role icons and Vuetify aliases', () => {
    for (const value of Object.values(ICONS)) expectResolvable(value)
    for (const value of Object.values(ROLE_ICONS)) expectResolvable(value)
    for (const value of Object.values(aliases)) if (typeof value === 'string') expectResolvable(value)
  })

  it('resolves every selectable site icon and every content-type icon', () => {
    for (const value of siteIcons) expectResolvable(`fas ${value}`)
    const contentTypes = [
      '',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'audio/mpeg',
      'video/mp4',
      'application/zip',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/json',
      'text/javascript',
      'application/octet-stream',
    ]
    for (const type of contentTypes) expectResolvable(`fas ${contentTypeIconName(type)}`)
  })

  it('maps legacy / Pro-only names that may still be persisted to registered Free glyphs', () => {
    for (const [legacy, replacement] of Object.entries(LEGACY_ICON_ALIASES)) {
      expect(resolveIconLookup(`fas fa-${legacy}`).iconName).toBe(replacement)
      expectResolvable(`fas fa-${legacy}`)
    }
    // Pro style prefixes from persisted data or vendored components fall back to the solid set.
    expect(resolveIconLookup('fasl fa-gear')).toEqual({ prefix: 'fas', iconName: 'gear' })
    expect(resolveIconLookup(['far', 'square'])).toEqual({ prefix: 'far', iconName: 'square' })
    expect(resolveIconLookup('fa-gear')).toEqual({ prefix: 'fas', iconName: 'gear' })
  })

  it('uses the regular set for the checkbox glyphs', () => {
    expect(resolveIconLookup(ICONS.checkboxOff)).toEqual({ prefix: 'far', iconName: 'square' })
    expect(findIconDefinition({ prefix: 'far', iconName: 'square-check' })).toBeDefined()
  })
})
