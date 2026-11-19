import type { IconLookup, IconPrefix } from '@fortawesome/fontawesome-svg-core'

/**
 * Names that may still arrive at runtime from persisted data (site icons saved before the
 * Free-only migration) or from the vendored PDF viewer, mapped to the registered Free glyph.
 * Source code must use the Free names directly (`npm run check:ce-ui` enforces it).
 */
export const LEGACY_ICON_ALIASES: Readonly<Record<string, string>> = {
  puzzle: 'puzzle-piece',
  search: 'magnifying-glass',
  home: 'house',
  cog: 'gear',
  sparkles: 'wand-magic-sparkles',
  files: 'file-lines',
  'bell-exclamation': 'bell',
  'circle-envelope': 'envelope',
  'sun-bright': 'sun',
  'moon-stars': 'moon',
  'spinner-third': 'spinner',
  books: 'book-open',
  'cloud-upload': 'cloud-arrow-up',
}

const KNOWN_PREFIXES: ReadonlySet<IconPrefix> = new Set<IconPrefix>(['fas', 'far', 'fab'])

/**
 * Parse a Vuetify icon value (`'fas fa-gear'`, `'fa-gear'`, `['far', 'square']`) into a
 * FontAwesome lookup. Unknown/Pro style prefixes fall back to the solid set, which is the only
 * place Pro-only strings can still originate (persisted data, vendored components).
 */
export function resolveIconLookup(icon: string | readonly string[] | undefined): IconLookup {
  if (Array.isArray(icon)) {
    const [prefix, name] = icon as readonly string[]
    return { prefix: normalizePrefix(prefix), iconName: normalizeName(name ?? '') as IconLookup['iconName'] }
  }

  const parts = String(icon ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const prefix = parts.find(part => /^fa[a-z]*$/.test(part) && part !== 'fa')
  const name =
    parts.find(part => part.startsWith('fa-'))?.slice(3) ?? parts.find(part => !part.startsWith('fa')) ?? ''
  return { prefix: normalizePrefix(prefix), iconName: normalizeName(name) as IconLookup['iconName'] }
}

function normalizePrefix(prefix: string | undefined): IconPrefix {
  return prefix && KNOWN_PREFIXES.has(prefix as IconPrefix) ? (prefix as IconPrefix) : 'fas'
}

function normalizeName(name: string) {
  return LEGACY_ICON_ALIASES[name] ?? name
}
