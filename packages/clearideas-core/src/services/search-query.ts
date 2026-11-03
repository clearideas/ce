import { coreExtractionStatus } from './config.js'

export interface ParsedMetadataSearch {
  plainText: string
  filters: Array<{ key: string; value: string }>
}

const METADATA_KEY_PATTERN = /^[\p{L}\p{N}_.-]+$/u
const RESERVED_METADATA_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Returns true when a metadata filter key is safe to use as a lookup key.
 * Keys that are not plain identifiers, or that collide with Object.prototype
 * members, are treated as ordinary search text instead of filters.
 */
export function isValidMetadataFilterKey(key: string): boolean {
  const normalized = String(key ?? '').trim().toLowerCase()
  if (!normalized) return false
  if (RESERVED_METADATA_KEYS.has(normalized)) return false
  return METADATA_KEY_PATTERN.test(normalized)
}

export function parseMetadataSearchQuery(raw: string): ParsedMetadataSearch {
  const filters: Array<{ key: string; value: string }> = []
  const plainText = extractMetadataFilters(String(raw ?? ''), filters)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return { plainText, filters }
}

function extractMetadataFilters(raw: string, filters: ParsedMetadataSearch['filters']): string {
  let output = ''
  let index = 0

  while (index < raw.length) {
    if (raw[index] !== '@') {
      output += raw[index]
      index += 1
      continue
    }

    const expressionStart = index
    index += 1
    const keyStart = index
    while (index < raw.length && !/\s|:/.test(raw[index])) index += 1
    const key = raw.slice(keyStart, index)
    while (index < raw.length && /\s/.test(raw[index])) index += 1

    if (!key || raw[index] !== ':') {
      output += raw.slice(expressionStart, index)
      continue
    }

    index += 1
    while (index < raw.length && /\s/.test(raw[index])) index += 1

    let value = ''
    if (raw[index] === '"') {
      index += 1
      while (index < raw.length) {
        const char = raw[index]
        if (char === '\\' && index + 1 < raw.length) {
          value += raw[index + 1]
          index += 2
          continue
        }
        if (char === '"') {
          index += 1
          break
        }
        value += char
        index += 1
      }
    } else {
      const valueStart = index
      while (index < raw.length && !/\s/.test(raw[index])) index += 1
      value = raw.slice(valueStart, index)
    }

    if (!isValidMetadataFilterKey(key)) {
      // Not a usable filter key: keep the expression as plain search text.
      output += raw.slice(expressionStart, index)
      continue
    }

    filters.push({
      key: key.trim().toLowerCase(),
      value: value.trim().toLowerCase(),
    })
    output += ' '
  }

  return output
}

/**
 * Lower-cases text and collapses every run of non letter/number characters to a single
 * space, so `Annual_Report.pdf`, `annual-report` and `annual report` all normalise alike.
 * Mirrors the tokenizer used by the full-text index.
 */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function isTextBasedContent(contentType?: unknown, name?: unknown): boolean {
  const type = String(contentType ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  const fileName = String(name ?? '').toLowerCase()
  if (type.startsWith('text/')) return true
  if (
    [
      'application/json',
      'application/xml',
      'application/javascript',
      'application/typescript',
      'application/x-yaml',
      'application/yaml',
      'application/sql',
      'application/markdown',
    ].includes(type)
  )
    return true
  return /\.(txt|md|markdown|json|xml|csv|tsv|yaml|yml|js|ts|tsx|jsx|css|scss|html|htm|sql|log|ini|env)$/i.test(
    fileName,
  )
}

export function isPdfContent(contentType?: unknown, name?: unknown): boolean {
  return (
    String(contentType ?? '')
      .toLowerCase()
      .split(';')[0]
      .trim() === 'application/pdf' ||
    String(name ?? '')
      .toLowerCase()
      .endsWith('.pdf')
  )
}

export function isContentTextAvailable(file: {
  contentType?: unknown
  name?: unknown
  extractionStatus?: unknown
  extractedText?: unknown
  extractedTextKey?: unknown
}): boolean {
  if (isTextBasedContent(file.contentType, file.name)) return true
  return (
    isPdfContent(file.contentType, file.name) &&
    (file.extractionStatus === coreExtractionStatus.complete ||
      file.extractionStatus === coreExtractionStatus.limited) &&
    Boolean(file.extractedTextKey || file.extractedText)
  )
}

function metadataValueToString(value: unknown): string {
  // Dates are compared as ISO strings so `@createdAt:2026-02` behaves the same
  // whether the value came from the database (Date) or the search index (string).
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  return String(value)
}

export function searchableMetadataValues(input: {
  file: any
  fileName?: string
  site?: any
  folder?: any
  key: string
}): string[] {
  const { file, site, folder } = input
  const key = String(input.key ?? '').toLowerCase()
  if (!isValidMetadataFilterKey(key)) return []
  const fileName = input.fileName ?? file?.name ?? ''
  const rawMetadata = file?.attributes?.metadata ?? file?.metadata
  const metadata: Record<string, unknown> =
    rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata) ? rawMetadata : {}
  const contentTags = Array.isArray(file?.tags) ? file.tags : []
  const siteTags = [
    ...(Array.isArray(site?.tags) ? site.tags : []),
    ...(Array.isArray(site?.attributes?.tags) ? site.attributes.tags : []),
    ...(Array.isArray(file?.siteTags) ? file.siteTags : []),
  ]
  const allTags = [...contentTags, ...siteTags]
  const valuesByKey: Record<string, unknown[]> = Object.assign(Object.create(null), {
    name: [fileName],
    contenttype: [file?.contentType],
    folder: [folder?.name ?? file?.folderName],
    foldername: [folder?.name ?? file?.folderName],
    site: [site?.name ?? file?.siteName],
    sitename: [site?.name ?? file?.siteName],
    tag: allTags,
    tags: allTags,
    createdat: [file?.createdAt ?? file?.uploadedAt],
    updatedat: [file?.updatedAt ?? file?.uploadedAt],
    uploadedat: [file?.uploadedAt],
  })
  const values = Object.hasOwn(valuesByKey, key) ? valuesByKey[key] : lookupMetadataValues(metadata, key)
  return values
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .filter(value => value != null)
    .map(value => metadataValueToString(value).toLowerCase())
}

/**
 * Custom metadata keys are matched case-insensitively (filter keys are lower-cased by the
 * parser while stored keys keep their original casing, e.g. `expiryDate`).
 */
function lookupMetadataValues(metadata: Record<string, unknown>, key: string): unknown[] {
  const values: unknown[] = []
  for (const metadataKey of Object.keys(metadata)) {
    if (metadataKey.toLowerCase() === key) values.push(metadata[metadataKey])
  }
  return values
}

export function matchesMetadataFilters(input: {
  file: any
  fileName?: string
  site?: any
  folder?: any
  filters: ParsedMetadataSearch['filters']
}): boolean {
  return input.filters.every(filter => {
    const values = searchableMetadataValues({ ...input, key: filter.key })
    return values.some(value => value.includes(filter.value))
  })
}

export function matchesMetadataSearch(input: {
  file: any
  fileName?: string
  site?: any
  folder?: any
  search: ParsedMetadataSearch
}): boolean {
  const fileName = input.fileName ?? String(input.file?.name ?? '')
  if (input.search.plainText) {
    const lowerFileName = fileName.toLowerCase()
    const normalizedFileName = normalizeSearchText(fileName)
    const normalizedQuery = normalizeSearchText(input.search.plainText)
    if (
      !lowerFileName.includes(input.search.plainText) &&
      !(normalizedQuery && normalizedFileName.includes(normalizedQuery))
    )
      return false
  }
  return matchesMetadataFilters({ ...input, fileName, filters: input.search.filters })
}

/**
 * Escapes a string for literal use inside a RegExp.
 */
export function escapeRegExp(value: string): string {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a regular expression pattern (without flags) that matches file names containing
 * the plain-text query, tolerating punctuation/whitespace differences between words.
 * Mirrors the in-memory `matchesMetadataSearch` behaviour so it can be pushed into a
 * database query as a pre-filter (`{ $regex: pattern, $options: 'i' }`); the Unicode
 * property classes are understood by both JavaScript (with the `u` flag) and PCRE.
 */
export function buildFileNameSearchPattern(plainText: string): string | null {
  const tokens = normalizeSearchText(plainText).split(' ').filter(Boolean)
  const literal = String(plainText ?? '').trim()
  if (tokens.length === 0) return literal ? escapeRegExp(literal) : null
  const tolerant = tokens.map(escapeRegExp).join('[^\\p{L}\\p{N}]+')
  return `${escapeRegExp(literal)}|${tolerant}`
}

/** JavaScript `RegExp` form of `buildFileNameSearchPattern` (case-insensitive, Unicode). */
export function buildFileNameSearchRegex(plainText: string): RegExp | null {
  const pattern = buildFileNameSearchPattern(plainText)
  return pattern ? new RegExp(pattern, 'iu') : null
}
