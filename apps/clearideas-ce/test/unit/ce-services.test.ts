import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
import { extractPdfTextForFile } from '../../src/services/pdf-text-extraction.js'
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

  it('hydrates search results from source data and removes stale index entries', async () => {
    const removed: any[] = []
    const indexed: any[] = []
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
        uploadedAt: new Date('2026-01-03T00:00:00Z'),
        kind: 'File',
      },
    ]

    const models = {
      SiteModel: {
        find: () => ({
          lean: async () => [site],
        }),
      },
      ContentModel: {
        find: (query: any) => ({
          lean: async () => {
            if (query.kind === 'Folder') return [folder]
            const ids = new Set((query._id?.$in ?? []).map(String))
            return sourceFiles.filter(file => ids.has(String(file._id)))
          },
        }),
      },
    } as any

    const hydrated = await hydrateSearchResultsFromSource({
      models,
      q: '@contentType: application/pdf shopify',
      results: [
        { id: 'file-2', siteId: 'site-1', snippet: 'Shopify GMV' },
        { id: 'missing', siteId: 'site-1', snippet: 'stale' },
        { id: 'file-1', siteId: 'site-1', snippet: 'does not match filter' },
      ],
      search: {
        async removeContent(siteId, contentIds) {
          removed.push({ siteId, contentIds })
        },
        async indexFile(file) {
          indexed.push(file)
        },
      },
    })

    expect(hydrated).toHaveLength(1)
    expect(hydrated[0]).toMatchObject({
      id: 'file-2',
      folderId: 'folder-1',
      textAvailable: true,
      snippet: 'Shopify GMV',
    })
    expect(removed).toEqual([{ siteId: 'site-1', contentIds: ['missing'] }])
    expect(indexed[0]).toMatchObject({ id: 'file-1', siteId: 'site-1', name: 'notes.md' })
  })

  it('extracts text from an uploaded PDF with the supported PDF.js runtime', async () => {
    const writes: Array<{ key: string; body: Buffer; contentType: string }> = []
    const updates: any[] = []
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
        findOneAndUpdate: (_query: any, update: any) => {
          updates.push(update)
          return { lean: async () => ({ ...file, ...update.$set }) }
        },
      },
      SiteModel: {
        findById: () => ({
          select: () => ({ lean: async () => ({ _id: 'site-1', name: 'Test Site' }) }),
        }),
      },
    } as any

    const extracted = await extractPdfTextForFile({
      models,
      storage: {
        readObject: async () => testPdfBuffer(),
        writeObject: async (input: any) => writes.push(input),
      } as any,
      fileKey: file.key,
      contentType: file.contentType,
    })

    expect(extracted).toMatchObject({
      id: file._id,
      extractionStatus: 'complete',
      extractedText: expect.stringContaining('Sample report revenue increased in 2023.'),
    })
    expect(updates[0].$set.extractedText).toContain('Sample report revenue increased in 2023.')
    expect(writes).toEqual([
      expect.objectContaining({
        key: 'sample-report.pdf.extracted.txt',
        contentType: 'text/plain; charset=utf-8',
      }),
    ])
  })
})

function testPdfBuffer() {
  return Buffer.from(
    'JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMzAKPj4Kc3RyZWFtCnicLYpBCkIxDET3OUXWgpgm7aQfxIVaceFG6AVEvqLoQhHPb6sS8ph5yYOWlYT7PM8024639/i6HA9TlyHHLJ4HDpHribRxR+H7Gjg2qHC90zwZAtYuWCGpuCK1vHH1+G9AQvHUrxhQYN0iuDXGn1Mxtb6mZcH1SnVCpdKePjWbIokKZW5kc3RyZWFtCmVuZG9iagoKNyAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDUKL0ZpcnN0IDI2Ci9MZW5ndGggMzYxCj4+CnN0cmVhbQp4nNVSTUvDQBC976+Yox5kJ5tvKYW2SRSkKK2gKB7SZCmRsivJVuq/dyZJLT2IZwmP3Zl5s/s28zxAUBAE4EOcQAChryCE2PNgMhHy8etDg3wot7oT8q6pO3glDsIK3oRc2L1x4InpVJy4i9KVO7sVQxN4TD4yHlpb7yvdwqTIiwIxRsQoIESIKqN1QUgJimKqqYT2hDgYQbnYR/RnVCsGRPHQw/WeG479Oa3EjZiTDdwgGeKfe/mufDhD/aUnnQq5tHVWOg0X2bVCFWGo0POV76Uvl/Q7Wl06+38f1+tvrPn1hWdz5vHykFvNHuinLFe6s/u2orEzr7BU4c2t3n1q11TlVYxpQjrjJCWPjcaQz/ebd131VA7zg7tZO9YwJDi31HVTzu2B3If0BYo8i8genBljHbuy96NxpIajaPTomWQWJOR6v3F9yElPyHnZ6V7qSSeJMJWtG7MF+dSYmemaY4JP/AYQp8XVCmVuZHN0cmVhbQplbmRvYmoKCjggMCBvYmoKPDwKL1NpemUgOQovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDQyCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDkgXQo+PgpzdHJlYW0KeJxjYGD4/5+JgZ2BAUQwgggmEMEMIlgYGQQYGBgZbgMJplUMDABieAPQCmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgo2ODIKJSVFT0Y=',
    'base64',
  )
}
