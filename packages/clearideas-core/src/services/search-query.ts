import { coreExtractionStatus } from './config.js'

export interface ParsedMetadataSearch {
  plainText: string
  filters: Array<{ key: string; value: string }>
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

    filters.push({
      key: key.trim().toLowerCase(),
      value: value.trim().toLowerCase(),
    })
    output += ' '
  }

  return output
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
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
    file.extractionStatus === coreExtractionStatus.complete &&
    Boolean(file.extractedTextKey || file.extractedText)
  )
}

export function searchableMetadataValues(input: {
  file: any
  fileName?: string
  site?: any
  folder?: any
  key: string
}): string[] {
  const { file, site, folder, key } = input
  const fileName = input.fileName ?? file?.name ?? ''
  const metadata = file?.attributes?.metadata ?? file?.metadata ?? {}
  const siteTags = [...(site?.tags ?? []), ...(site?.attributes?.tags ?? [])]
  const valuesByKey: Record<string, unknown[]> = {
    name: [fileName],
    contenttype: [file?.contentType],
    folder: [folder?.name ?? file?.folderName],
    foldername: [folder?.name ?? file?.folderName],
    site: [site?.name ?? file?.siteName],
    sitename: [site?.name ?? file?.siteName],
    tag: siteTags,
    tags: siteTags,
    createdat: [file?.createdAt ?? file?.uploadedAt],
    updatedat: [file?.updatedAt ?? file?.uploadedAt],
    uploadedat: [file?.uploadedAt],
  }
  const values = valuesByKey[key] ?? [metadata[key]]
  return values
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .filter(value => value != null)
    .map(value => String(value).toLowerCase())
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
      !normalizedFileName.includes(normalizedQuery)
    )
      return false
  }
  return input.search.filters.every(filter => {
    const values = searchableMetadataValues({ ...input, fileName, key: filter.key })
    return values.some(value => value.includes(filter.value))
  })
}
