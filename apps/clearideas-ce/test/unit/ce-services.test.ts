import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
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
})
