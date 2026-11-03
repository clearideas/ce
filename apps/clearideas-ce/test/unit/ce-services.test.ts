import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
import {
  extractPdfTextForFile,
  extractTextFromPdfBuffer,
  shouldAttemptPdfExtraction,
} from '../../src/services/pdf-text-extraction.js'
import { hydrateSearchResultsFromSource } from '../../src/services/search-result-hydration.js'

describe('CE service helpers', () => {
  it('stores local objects safely and creates sanitized upload targets', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clearideas-storage-test-'))
    try {
      const storage = createLocalStorageProvider(root)
      const target = await storage.createUploadTarget({ fileName: 'bad name?.json' } as any)
      expect(target).toMatchObject({ method: 'PUT' })
      expect(target.fileKey).toMatch(/bad_name_\.json$/)

      await storage.writeObject({ key: 'nested/file.txt', body: Buffer.from('hello') })
      await expect(storage.readObject({ key: 'nested/file.txt' })).resolves.toEqual(Buffer.from('hello'))
      await storage.deleteObjects({ keys: ['nested/file.txt'] })
      await expect(storage.readObject({ key: 'nested/file.txt' })).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('hydrates search results from source data, drops stale or out-of-scope entries, and never re-indexes on read', async () => {
    const removed: any[] = []
    const site = {
      _id: 'site-1',
      name: 'Test Site',
    }
    const folder = { _id: 'folder-1', site: 'site-1', name: 'Reports', kind: 'Folder' }
    const sourceFiles = [
      {
        _id: 'file-1',
        site: 'site-1',
        parentType: 'Site',
        name: 'notes.md',
        key: 'notes.md',
        contentType: 'text/markdown',
        size: 12,
        status: 'active',
        uploadedAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        kind: 'File',
      },
      {
        _id: 'file-2',
        site: 'site-1',
        parent: 'folder-1',
        parentType: 'Content',
        name: 'shopify.pdf',
        key: 'shopify.pdf',
        contentType: 'application/pdf',
        extractionStatus: 'complete',
        extractedTextKey: 'shopify.pdf.extracted.txt',
        status: 'active',
        uploadedAt: new Date('2026-01-03T00:00:00Z'),
        kind: 'File',
      },
      {
        _id: 'file-other-site',
        site: 'site-2',
        parentType: 'Site',
        name: 'secret.txt',
        key: 'secret.txt',
        contentType: 'text/plain',
        status: 'active',
        kind: 'File',
      },
    ]

    const contentQueries: any[] = []
    const models = {
      SiteModel: {
        find: () => ({
          select: () => ({ lean: async () => [site] }),
        }),
      },
      ContentModel: {
        find: (query: any) => {
          contentQueries.push(query)
          const run = async () => {
            if (query.kind === 'Folder') return [folder]
            const ids = new Set((query._id?.$in ?? []).map(String))
            const allowedSites = query.site?.$in ? new Set(query.site.$in.map(String)) : null
            return sourceFiles.filter(file =>
              ids.has(String(file._id)) &&
              (!allowedSites || allowedSites.has(String(file.site))) &&
              (!query.status || file.status === query.status),
            )
          }
          return { lean: run, select: () => ({ lean: run }) }
        },
      },
    } as any

    const hydrated = await hydrateSearchResultsFromSource({
      models,
      siteIds: ['site-1'],
      results: [
        { id: 'file-2', siteId: 'site-1', snippet: 'Shopify GMV' },
        { id: 'missing', siteId: 'site-1', snippet: 'stale' },
        // A full-text hit that does not literally contain the query must still be kept.
        { id: 'file-1', siteId: 'site-1', snippet: 'fuzzy match' },
        // An index entry pointing at content that now lives in another site must be dropped and cleaned up.
        { id: 'file-other-site', siteId: 'site-1', snippet: 'leak?' },
      ],
      search: {
        async removeContent(siteId, contentIds) {
          removed.push({ siteId, contentIds })
        },
      },
    })

    expect(hydrated.map(result => result.id)).toEqual(['file-2', 'file-1'])
    expect(hydrated[0]).toMatchObject({
      id: 'file-2',
      folderId: 'folder-1',
      folderName: 'Reports',
      siteName: 'Test Site',
      textAvailable: true,
      snippet: 'Shopify GMV',
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(removed).toEqual([{ siteId: 'site-1', contentIds: ['missing', 'file-other-site'] }])
    const fileQuery = contentQueries.find(query => query.kind === 'File')
    expect(fileQuery).toMatchObject({ status: 'active', site: { $in: ['site-1'] } })
  })

  it('extracts text from an uploaded PDF with the supported PDF.js runtime', async () => {
    const writes: Array<{ key: string; body: Buffer; contentType: string }> = []
    const updates: any[] = []
    const enqueued: any[] = []
    const file = {
      _id: 'file-1',
      site: 'site-1',
      parentType: 'Site',
      name: 'sample-report.pdf',
      key: 'sample-report.pdf',
      contentType: 'application/pdf',
      size: 841,
      uploadedAt: new Date('2026-01-01T00:00:00Z'),
    }
    const models = {
      ContentModel: {
        findOne: () => ({ select: () => ({ lean: async () => ({ size: file.size }) }) }),
        findOneAndUpdate: (_query: any, update: any) => {
          updates.push(update)
          return { lean: async () => ({ ...file, ...update.$set }) }
        },
      },
    } as any

    const extracted = await extractPdfTextForFile({
      models,
      storage: {
        readObject: async () => testPdfBuffer(),
        writeObject: async (input: any) => writes.push(input),
      } as any,
      search: { enqueueIndexContent: (siteId: string, contentId: string) => enqueued.push({ siteId, contentId }) },
      fileKey: file.key,
      contentType: file.contentType,
    })

    expect(extracted).toMatchObject({
      id: file._id,
      siteId: 'site-1',
      extractionStatus: 'complete',
      extractedTextKey: 'sample-report.pdf.extracted.txt',
    })
    // Extracted text is stored as a companion object, never on the database record.
    expect(updates[0].$set).not.toHaveProperty('extractedText')
    expect(updates[0].$unset).toHaveProperty('extractedText')
    expect(writes).toEqual([
      expect.objectContaining({
        key: 'sample-report.pdf.extracted.txt',
        contentType: 'text/plain; charset=utf-8',
      }),
    ])
    expect(writes[0].body.toString('utf8')).toContain('Sample report revenue increased in 2023.')
    expect(enqueued).toEqual([{ siteId: 'site-1', contentId: 'file-1' }])
  })

  it('marks oversized PDFs unsupported without reading them and still schedules indexing', async () => {
    const reads: string[] = []
    const updates: any[] = []
    const enqueued: any[] = []
    const models = {
      ContentModel: {
        findOne: () => ({ select: () => ({ lean: async () => ({ size: 10 * 1024 * 1024 * 1024 }) }) }),
        findOneAndUpdate: (_query: any, update: any) => {
          updates.push(update)
          return { lean: async () => ({ _id: 'file-big', site: 'site-1', key: 'big.pdf', ...update.$set }) }
        },
      },
    } as any
    const extracted = await extractPdfTextForFile({
      models,
      storage: {
        readObject: async (input: any) => {
          reads.push(input.key)
          return Buffer.alloc(0)
        },
        writeObject: async () => undefined,
      } as any,
      search: { enqueueIndexContent: (siteId: string, contentId: string) => enqueued.push({ siteId, contentId }) },
      fileKey: 'big.pdf',
      contentType: 'application/pdf',
    })
    expect(extracted).toMatchObject({ extractionStatus: 'unsupported' })
    expect(reads).toEqual([])
    expect(enqueued).toEqual([{ siteId: 'site-1', contentId: 'file-big' }])
  })

  it('records failed extractions and still schedules indexing so the file stays searchable by name', async () => {
    const updates: any[] = []
    const enqueued: any[] = []
    const models = {
      ContentModel: {
        findOne: () => ({ select: () => ({ lean: async () => ({ size: 12 }) }) }),
        findOneAndUpdate: (_query: any, update: any) => {
          updates.push(update)
          return { lean: async () => ({ _id: 'file-bad', site: 'site-1', key: 'bad.pdf', ...update.$set }) }
        },
      },
    } as any
    await expect(extractPdfTextForFile({
      models,
      storage: {
        readObject: async () => Buffer.from('definitely not a pdf'),
        writeObject: async () => undefined,
      } as any,
      search: { enqueueIndexContent: (siteId: string, contentId: string) => enqueued.push({ siteId, contentId }) },
      fileKey: 'bad.pdf',
      contentType: 'application/pdf',
    })).rejects.toBeTruthy()
    expect(updates.at(-1).$set.extractionStatus).toBe('failed')
    expect(enqueued).toEqual([{ siteId: 'site-1', contentId: 'file-bad' }])
  })

  it('limits page extraction and enforces a timeout', async () => {
    const limited = await extractTextFromPdfBuffer(testPdfBuffer(), { maxBytes: 1024 * 1024, maxPages: 1, timeoutMs: 30_000 })
    expect(limited.status).toBe('complete')
    expect(limited.pages).toBe(1)

    await expect(
      extractTextFromPdfBuffer(testPdfBuffer(), { maxBytes: 1024 * 1024, maxPages: 1, timeoutMs: 1 }),
    ).rejects.toThrow(/timed out/)
  })

  it('decides when on-demand PDF extraction should be retried', () => {
    const now = new Date('2026-03-01T12:00:00Z')
    expect(shouldAttemptPdfExtraction({}, now)).toBe(true)
    expect(shouldAttemptPdfExtraction({ extractionStatus: 'pending' }, now)).toBe(true)
    expect(shouldAttemptPdfExtraction({ extractionStatus: 'unsupported' }, now)).toBe(false)
    expect(shouldAttemptPdfExtraction({ extractionStatus: 'complete' }, now)).toBe(false)
    expect(shouldAttemptPdfExtraction({ extractionStatus: 'failed', extractedTextUpdatedAt: new Date('2026-03-01T11:59:00Z') }, now)).toBe(false)
    expect(shouldAttemptPdfExtraction({ extractionStatus: 'failed', extractedTextUpdatedAt: new Date('2026-03-01T09:00:00Z') }, now)).toBe(true)
  })
})

function testPdfBuffer() {
  return Buffer.from(
    'JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMzAKPj4Kc3RyZWFtCnicLYpBCkIxDET3OUXWgpgm7aQfxIVaceFG6AVEvqLoQhHPb6sS8ph5yYOWlYT7PM8024639/i6HA9TlyHHLJ4HDpHribRxR+H7Gjg2qHC90zwZAtYuWCGpuCK1vHH1+G9AQvHUrxhQYN0iuDXGn1Mxtb6mZcH1SnVCpdKePjWbIokKZW5kc3RyZWFtCmVuZG9iagoKNyAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDUKL0ZpcnN0IDI2Ci9MZW5ndGggMzYxCj4+CnN0cmVhbQp4nNVSTUvDQBC976+Yox5kJ5tvKYW2SRSkKK2gKB7SZCmRsivJVuq/dyZJLT2IZwmP3Zl5s/s28zxAUBAE4EOcQAChryCE2PNgMhHy8etDg3wot7oT8q6pO3glDsIK3oRc2L1x4InpVJy4i9KVO7sVQxN4TD4yHlpb7yvdwqTIiwIxRsQoIESIKqN1QUgJimKqqYT2hDgYQbnYR/RnVCsGRPHQw/WeG479Oa3EjZiTDdwgGeKfe/mufDhD/aUnnQq5tHVWOg0X2bVCFWGo0POV76Uvl/Q7Wl06+38f1+tvrPn1hWdz5vHykFvNHuinLFe6s/u2orEzr7BU4c2t3n1q11TlVYxpQjrjJCWPjcaQz/ebd131VA7zg7tZO9YwJDi31HVTzu2B3If0BYo8i8genBljHbuy96NxpIajaPTomWQWJOR6v3F9yElPyHnZ6V7qSSeJMJWtG7MF+dSYmemaY4JP/AYQp8XVCmVuZHN0cmVhbQplbmRvYmoKCjggMCBvYmoKPDwKL1NpemUgOQovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDQyCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDkgXQo+PgpzdHJlYW0KeJxjYGD4/5+JgZ2BAUQwgggmEMEMIlgYGQQYGBgZbgMJplUMDABieAPQCmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgo2ODIKJSVFT0Y=',
    'base64',
  )
}
