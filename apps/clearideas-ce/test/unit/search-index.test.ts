import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
import { createSiteSearchIndexManager } from '../../src/services/search-index.js'

describe('CE full-text search index', () => {
  it('indexes filename, metadata, and extracted text per site', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clearideas-search-test-'))
    try {
      const storage = createLocalStorageProvider(path.join(root, 'storage'))
      await fs.mkdir(path.join(root, 'storage'), { recursive: true })
      await storage.writeObject({ key: 'extracts/shopify.txt', body: Buffer.from('GMV was $235.9 billion and Q1 GMV was $60.9 billion.') })
      const search = createSiteSearchIndexManager({ root: path.join(root, 'search'), storage })

      await search.indexFile({
        id: 'file-1',
        siteId: 'site-1',
        siteName: 'Test Site',
        name: 'Shopify Financial Trends.pdf',
        key: 'shopify.pdf',
        contentType: 'application/pdf',
        extractedTextKey: 'extracts/shopify.txt',
        extractionStatus: 'complete',
      })

      expect(await search.searchSite({ siteId: 'site-1', q: 'GMV' })).toHaveLength(1)
      expect(await search.searchSite({ siteId: 'site-1', q: '@contentType: application/pdf' })).toHaveLength(1)
      expect(await search.searchAcrossSites({ sites: [{ id: 'site-1', name: 'Test Site' }], q: '235.9' })).toHaveLength(1)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
