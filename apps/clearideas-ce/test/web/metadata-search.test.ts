import { describe, expect, it } from 'vitest'
import {
  extractPlainTextFromMetadataSearch,
  hasIncompleteMetadataToken,
  parseMetadataSearchExpressions,
} from '../../src-web/src/utils/metadataSearch'

describe('metadata search syntax helpers', () => {
  it('keeps metadata expressions and plain search text distinct for highlighting', () => {
    const tokens = parseMetadataSearchExpressions('@contentType:application/pdf GMV')
    expect(tokens).toEqual([
      { type: 'metadata-search-token', content: '@contentType:application/pdf' },
      { type: 'text', content: ' GMV' },
    ])
    expect(extractPlainTextFromMetadataSearch('@contentType:application/pdf GMV')).toBe('GMV')
    expect(hasIncompleteMetadataToken('@contentType:')).toBe(true)
  })
})
