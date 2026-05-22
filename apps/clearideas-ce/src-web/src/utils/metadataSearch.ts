export interface MetadataSearchExpressionToken {
  type: 'text' | 'metadata-search-token'
  content: string
}

export const metadataSearchExamples = ['@expiryDate:2026', '@fullName:"Jane Doe"'] as const

export const metadataSearchBuiltInFields = [
  '@contentType:image/png',
  '@createdAt:2026',
  '@updatedAt:2026',
  '@name:passport',
  '@tag:invoice',
  '@tags:invoice',
] as const

const metadataExpressionRegex = /@([^\s:]+)\s*:\s*(?:"(?:\\.|[^"\\])*"|[^\s]+)/g

export function parseMetadataSearchExpressions(text: string): MetadataSearchExpressionToken[] {
  const input = text || ''
  const tokens: MetadataSearchExpressionToken[] = []
  metadataExpressionRegex.lastIndex = 0

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = metadataExpressionRegex.exec(input)) !== null) {
    const start = match.index
    const expression = match[0]

    if (start > lastIndex) {
      tokens.push({ type: 'text', content: input.slice(lastIndex, start) })
    }

    tokens.push({ type: 'metadata-search-token', content: expression })
    lastIndex = start + expression.length
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', content: input.slice(lastIndex) })
  }

  if (tokens.length === 0) {
    return [{ type: 'text', content: input }]
  }

  return tokens
}

export function hasIncompleteMetadataToken(text: string): boolean {
  const input = text || ''

  for (let i = 0; i < input.length; i++) {
    if (input[i] !== '@') continue
    if (i > 0 && !/\s/.test(input[i - 1])) continue

    let j = i + 1

    const keyStart = j
    while (j < input.length && !/\s|:/.test(input[j])) j++
    if (j === keyStart) return true
    if (j >= input.length || input[j] !== ':') return true

    j++
    while (j < input.length && /\s/.test(input[j])) j++
    if (j >= input.length) return true

    if (input[j] === '"') {
      j++
      let closed = false
      while (j < input.length) {
        if (input[j] === '"') {
          // Count consecutive backslashes before the quote.
          // Odd count means the quote is escaped; even count means it closes the string.
          let backslashCount = 0
          let k = j - 1
          while (k >= 0 && input[k] === '\\') {
            backslashCount++
            k--
          }
          if (backslashCount % 2 === 1) {
            j++
            continue
          }
          closed = true
          j++
          break
        }
        j++
      }
      if (!closed) return true
    } else {
      const valueStart = j
      while (j < input.length && !/\s/.test(input[j])) j++
      if (j === valueStart) return true
    }
  }

  return false
}

export function extractPlainTextFromMetadataSearch(text: string): string {
  const tokens = parseMetadataSearchExpressions(text || '')
  return tokens
    .filter(token => token.type === 'text')
    .map(token => token.content)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasOpenTextSearch(text: string): boolean {
  return extractPlainTextFromMetadataSearch(text).length > 0
}
