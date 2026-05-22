import { describe, expect, it } from 'vitest'
import { contentTypeIconName } from '../../src-web/src/utils/format'

describe('format helpers', () => {
  it('maps common document MIME types to specific file icons', () => {
    expect(contentTypeIconName('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('fa-file-powerpoint')
    expect(contentTypeIconName('application/vnd.ms-powerpoint')).toBe('fa-file-powerpoint')
    expect(contentTypeIconName('application/vnd.openxmlformats-officedocument.presentationml.slideshow')).toBe('fa-file-powerpoint')
    expect(contentTypeIconName('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('fa-file-excel')
    expect(contentTypeIconName('application/vnd.ms-excel')).toBe('fa-file-excel')
    expect(contentTypeIconName('text/csv')).toBe('fa-file-excel')
    expect(contentTypeIconName('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('fa-file-word')
    expect(contentTypeIconName('application/msword')).toBe('fa-file-word')
    expect(contentTypeIconName('application/pdf')).toBe('fa-file-pdf')
    expect(contentTypeIconName('image/png')).toBe('fa-file-image')
    expect(contentTypeIconName('application/zip')).toBe('fa-file-zipper')
  })
})
