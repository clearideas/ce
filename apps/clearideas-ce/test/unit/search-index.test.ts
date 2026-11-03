import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
import {
  createSiteSearchIndexManager,
  createSnippet,
  SEARCH_INDEX_FORMAT_VERSION,
  type SearchIndexFile,
  type SearchIndexSource,
  type SiteSearchIndexManager,
} from '../../src/services/search-index.js'

const silentLogger = { info() {}, warn() {}, error() {} }

/** Small deterministic PRNG (mulberry32) so randomized tests are reproducible from their seed. */
function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('CE full-text search index', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  async function setup(options: {
    source?: SearchIndexSource
    flushDelayMs?: number
    maxTextBytes?: number
    maxLoadedSites?: number
    idleMs?: number
    autoRebuild?: boolean
    logger?: typeof silentLogger
  } = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clearideas-search-test-'))
    const storage = createLocalStorageProvider(path.join(root, 'storage'))
    await fs.mkdir(path.join(root, 'storage'), { recursive: true })
    const managers: SiteSearchIndexManager[] = []
    const create = (overrides: Partial<typeof options> = {}) => {
      const manager = createSiteSearchIndexManager({
        root: path.join(root, 'search'),
        storage,
        logger: silentLogger,
        flushDelayMs: 0,
        idleMs: 10_000,
        ...options,
        ...overrides,
      })
      managers.push(manager)
      return manager
    }
    const search = create()
    cleanups.push(async () => {
      for (const manager of managers) await manager.close().catch(() => undefined)
      await fs.rm(root, { recursive: true, force: true })
    })
    return { root, storage, search, create }
  }

  function file(overrides: Partial<SearchIndexFile> & { id: string }): SearchIndexFile {
    return {
      siteId: 'site-1',
      siteName: 'Test Site',
      name: `${overrides.id}.txt`,
      key: `${overrides.id}.txt`,
      contentType: 'text/plain',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('indexes filename, metadata, and extracted text per site', async () => {
    const { storage, search } = await setup()
    await storage.writeObject({ key: 'extracts/shopify.txt', body: Buffer.from('GMV was $235.9 billion and Q1 GMV was $60.9 billion.') })

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

    const byText = await search.searchSite({ siteId: 'site-1', q: 'GMV' })
    expect(byText).toHaveLength(1)
    expect(byText[0]).toMatchObject({ id: 'file-1', textAvailable: true, score: expect.any(Number) })
    expect(byText[0].snippet).toContain('GMV was $235.9 billion')
    expect(await search.searchSite({ siteId: 'site-1', q: '@contentType: application/pdf' })).toHaveLength(1)
    expect(await search.searchAcrossSites({ sites: [{ id: 'site-1', name: 'Test Site' }], q: '235.9' })).toHaveLength(1)
    expect(await search.searchSite({ siteId: 'site-2', q: 'GMV' })).toHaveLength(0)
  })

  it('requires every term to match (AND) and only fuzzes longer terms', async () => {
    const { storage, search } = await setup()
    await storage.writeObject({ key: 'a.txt', body: Buffer.from('The annual meeting discussed revenue.') })
    await storage.writeObject({ key: 'b.txt', body: Buffer.from('The quarterly report is attached.') })
    await storage.writeObject({ key: 'c.txt', body: Buffer.from('Open the tab and review the figures.') })
    await search.indexFile(file({ id: 'a', name: 'a.txt', key: 'a.txt' }))
    await search.indexFile(file({ id: 'b', name: 'b.txt', key: 'b.txt' }))
    await search.indexFile(file({ id: 'c', name: 'c.txt', key: 'c.txt' }))

    // "annual" only in a, "report" only in b: neither document has both.
    expect(await search.searchSite({ siteId: 'site-1', q: 'annual report' })).toHaveLength(0)
    expect((await search.searchSite({ siteId: 'site-1', q: 'annual meeting' })).map(hit => hit.id)).toEqual(['a'])
    // Short terms are not fuzzed: "tax" must not match "tab".
    expect(await search.searchSite({ siteId: 'site-1', q: 'tax' })).toHaveLength(0)
    // Longer terms tolerate a typo.
    expect((await search.searchSite({ siteId: 'site-1', q: 'quartely' })).map(hit => hit.id)).toEqual(['b'])
    // Prefix matching still works.
    expect((await search.searchSite({ siteId: 'site-1', q: 'disc' })).map(hit => hit.id)).toEqual(['a'])
    // Symbols and punctuation do not glue onto terms ($235.9 / annual_report).
    await storage.writeObject({ key: 'd.txt', body: Buffer.from('Total was $235.9 billion in annual_report.pdf') })
    await search.indexFile(file({ id: 'd', name: 'd.txt', key: 'd.txt' }))
    expect((await search.searchSite({ siteId: 'site-1', q: '235.9' })).map(hit => hit.id)).toEqual(['d'])
    expect((await search.searchSite({ siteId: 'site-1', q: 'annual report' })).map(hit => hit.id)).toEqual(['d'])
  })

  it('supports tag, date, folder, and custom metadata filters and folder scoping', async () => {
    const { search } = await setup()
    await search.indexFile(file({
      id: 'inv',
      name: 'invoice.pdf',
      key: 'invoice.pdf',
      contentType: 'application/pdf',
      folderId: 'folder-q1',
      folderName: 'Q1',
      tags: ['Invoice', 'finance'],
      siteTags: ['acme'],
      createdAt: new Date('2026-02-05T10:00:00Z'),
      uploadedAt: new Date('2026-02-05T10:00:00Z'),
      updatedAt: new Date('2026-02-06T10:00:00Z'),
      metadata: { expiryDate: '2026-12-31', fullName: 'Jane Doe' },
    }))
    await search.indexFile(file({
      id: 'memo',
      name: 'memo.txt',
      key: 'memo.txt',
      folderId: 'folder-q2',
      folderName: 'Q2',
      createdAt: new Date('2025-11-01T10:00:00Z'),
      updatedAt: new Date('2025-11-01T10:00:00Z'),
    }))

    const ids = async (q: string, folderId?: string) =>
      (await search.searchSite({ siteId: 'site-1', q, folderId })).map(hit => hit.id)

    expect(await ids('@tag:invoice')).toEqual(['inv'])
    expect(await ids('@tags:acme')).toEqual(['inv'])
    expect(await ids('@createdAt:2026-02')).toEqual(['inv'])
    expect(await ids('@uploadedAt:2026')).toEqual(['inv'])
    expect(await ids('@updatedAt:2025')).toEqual(['memo'])
    expect(await ids('@expirydate:2026-12')).toEqual(['inv'])
    expect(await ids('@fullName:"jane doe"')).toEqual(['inv'])
    expect(await ids('@folder:q2')).toEqual(['memo'])
    expect(await ids('invoice @contentType:pdf')).toEqual(['inv'])
    expect(await ids('invoice @contentType:text')).toEqual([])
    expect(await ids('@name:memo', 'folder-q2')).toEqual(['memo'])
    expect(await ids('@name:memo', 'folder-q1')).toEqual([])
    // Prototype member names are not filters and never throw.
    expect(await ids('@constructor:x')).toEqual([])
    expect(await ids('@__proto__:x')).toEqual([])
    // Metadata-only queries list newest first.
    expect(await ids('@contentType:"" ')).toEqual(['inv', 'memo'])
  })

  it('builds snippets from stored text covering terms that are far apart', async () => {
    const { storage, search } = await setup()
    const text = `The annual meeting was held. ${'lorem ipsum '.repeat(90)} The final report is attached.`
    await storage.writeObject({ key: 'minutes.txt', body: Buffer.from(text) })
    await search.indexFile(file({ id: 'minutes', name: 'minutes.txt', key: 'minutes.txt' }))

    const [hit] = await search.searchSite({ siteId: 'site-1', q: 'annual report' })
    expect(hit).toBeTruthy()
    expect(hit.snippet).toContain('annual meeting')
    expect(hit.snippet).toContain('final report')
    expect(hit.snippet.length).toBeLessThan(text.length)

    expect(createSnippet('', 'anything')).toBe('')
    expect(createSnippet('short text only', 'zzz')).toBe('short text only')
    expect(createSnippet('x'.repeat(1000), 'zzz')).toMatch(/^x{300}\.\.\.$/)
  })

  it('merges results across sites by relevance rather than site order', async () => {
    const { storage, search } = await setup()
    await storage.writeObject({ key: 'weak.txt', body: Buffer.from('revenue mentioned once among many other words here') })
    await storage.writeObject({ key: 'strong.txt', body: Buffer.from('revenue revenue revenue revenue revenue') })
    await search.indexFile(file({ id: 'weak', siteId: 'site-a', name: 'weak.txt', key: 'weak.txt' }))
    await search.indexFile(file({ id: 'strong', siteId: 'site-b', name: 'strong.txt', key: 'strong.txt' }))

    const hits = await search.searchAcrossSites({ sites: [{ id: 'site-a', name: 'A' }, { id: 'site-b', name: 'B' }], q: 'revenue' })
    expect(hits.map(hit => hit.id)).toEqual(['strong', 'weak'])
    expect(hits.map(hit => hit.siteName)).toEqual(['Test Site', 'Test Site'])
    const limited = await search.searchAcrossSites({ sites: [{ id: 'site-a' }, { id: 'site-b' }], q: 'revenue', limit: 1 })
    expect(limited.map(hit => hit.id)).toEqual(['strong'])
  })

  it('caps indexed text per document and records truncation', async () => {
    const { storage, search } = await setup({ maxTextBytes: 1024 })
    const body = `${'alpha '.repeat(300)}omega`
    await storage.writeObject({ key: 'long.txt', body: Buffer.from(body) })
    await search.indexFile(file({ id: 'long', name: 'long.txt', key: 'long.txt' }))

    expect((await search.searchSite({ siteId: 'site-1', q: 'alpha' })).map(hit => hit.id)).toEqual(['long'])
    // "omega" sits beyond the cap and is not indexed.
    expect(await search.searchSite({ siteId: 'site-1', q: 'omega' })).toHaveLength(0)
    const [hit] = await search.searchSite({ siteId: 'site-1', q: 'alpha' })
    expect(hit.snippet.length).toBeLessThan(1100)
  })

  it('indexes metadata only when the text object cannot be read', async () => {
    const { search } = await setup()
    await search.indexFile(file({ id: 'ghost', name: 'ghost-report.txt', key: 'missing.txt' }))
    const hits = await search.searchSite({ siteId: 'site-1', q: 'ghost' })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ id: 'ghost', textAvailable: false, snippet: '' })
  })

  it('persists atomically to a single versioned file and reloads it', async () => {
    const { root, storage, search, create } = await setup()
    await storage.writeObject({ key: 'notes.txt', body: Buffer.from('persisted content') })
    await search.indexFile(file({ id: 'n1', name: 'notes.txt', key: 'notes.txt' }))
    await search.indexFile(file({ id: 'n2', name: 'other.txt', key: 'other.txt' }))
    await search.settle()

    const dir = path.join(root, 'search', 'sites', 'site-1')
    const entries = await fs.readdir(dir)
    expect(entries).toEqual(['index.json'])
    const persisted = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8'))
    expect(persisted).toMatchObject({ format: SEARCH_INDEX_FORMAT_VERSION, siteId: 'site-1', watermark: '2026-01-01T00:00:00.000Z' })
    expect(persisted.documents).toHaveLength(2)
    // Full text is not persisted; it is re-read from storage when needed.
    expect(JSON.stringify(persisted.documents)).not.toContain('persisted content')

    await search.close()
    const reloaded = create()
    const hits = await reloaded.searchSite({ siteId: 'site-1', q: 'persisted' })
    expect(hits.map(hit => hit.id)).toEqual(['n1'])
    expect(hits[0].snippet).toContain('persisted content')
    expect(await reloaded.searchSite({ siteId: 'site-1', q: 'other' })).toHaveLength(1)
  })

  it('coalesces many writes into a single flush and survives concurrent indexing', async () => {
    const { root, search } = await setup({ flushDelayMs: 50 })
    await Promise.all(
      Array.from({ length: 40 }, (_, index) => search.indexFile(file({ id: `doc-${index}`, name: `document ${index}.txt`, key: `doc-${index}.txt` }))),
    )
    const dir = path.join(root, 'search', 'sites', 'site-1')
    // Nothing is written synchronously on the request path.
    await expect(fs.readdir(dir).catch(() => [])).resolves.toEqual([])
    await search.settle()
    const persisted = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8'))
    expect(persisted.documents).toHaveLength(40)
    expect(await fs.readdir(dir)).toEqual(['index.json'])
    expect(await search.searchSite({ siteId: 'site-1', q: 'document', limit: 200 })).toHaveLength(40)
  })

  it('quarantines unreadable index files and rebuilds from the source of truth', async () => {
    const sourceFiles = [file({ id: 'src-1', name: 'from-source.txt', key: 'from-source.txt' })]
    const source: SearchIndexSource = {
      listSiteFiles: async ({ siteId }) => (siteId === 'site-1' ? sourceFiles : []),
      getSiteFile: async ({ contentId }) => sourceFiles.find(entry => entry.id === contentId) ?? null,
    }
    const { root, storage, search, create } = await setup({ source })
    await storage.writeObject({ key: 'from-source.txt', body: Buffer.from('rebuilt from source') })
    const dir = path.join(root, 'search', 'sites', 'site-1')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'index.json'), '{"format":2,"siteId":"site-1","documents":[', 'utf8')

    const hits = await search.searchSite({ siteId: 'site-1', q: 'rebuilt' })
    expect(hits.map(hit => hit.id)).toEqual(['src-1'])
    await search.settle()
    const entries = await fs.readdir(dir)
    expect(entries).toContain('index.json')
    expect(entries.some(entry => entry.startsWith('index.json.corrupt-'))).toBe(true)

    // Legacy/unknown formats are treated the same way.
    await search.close()
    await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({ serializationVersion: 2, documentCount: 0 }), 'utf8')
    const next = create()
    expect((await next.searchSite({ siteId: 'site-1', q: 'rebuilt' })).map(hit => hit.id)).toEqual(['src-1'])
  })

  it('quarantines valid JSON with an invalid MiniSearch payload and rebuilds it', async () => {
    const sourceFile = file({ id: 'recovered', name: 'recovered.txt' })
    const source: SearchIndexSource = {
      listSiteFiles: async () => [sourceFile],
      getSiteFile: async () => sourceFile,
    }
    const { root, search } = await setup({ source })
    const dir = path.join(root, 'search', 'sites', 'site-1')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({
      format: SEARCH_INDEX_FORMAT_VERSION,
      siteId: 'site-1',
      documents: [],
      index: {},
    }))

    expect((await search.searchSite({ siteId: 'site-1', q: 'recovered' })).map(hit => hit.id)).toEqual(['recovered'])
    await search.settle()
    expect((await fs.readdir(dir)).some(entry => entry.startsWith('index.json.corrupt-'))).toBe(true)
  })

  it('rebuilds a missing index automatically and catches up on newer source changes when loading', async () => {
    const sourceFiles: SearchIndexFile[] = [file({ id: 'old', name: 'old-notes.txt', key: 'old.txt', updatedAt: '2026-01-01T00:00:00.000Z' })]
    const calls: any[] = []
    const source: SearchIndexSource = {
      listSiteFiles: async input => {
        calls.push(input)
        return sourceFiles.filter(entry => !input.updatedAfter || new Date(String(entry.updatedAt)) >= input.updatedAfter)
      },
      getSiteFile: async ({ contentId }) => sourceFiles.find(entry => entry.id === contentId) ?? null,
    }
    const { root, search, create } = await setup({ source })

    expect((await search.searchSite({ siteId: 'site-1', q: 'old' })).map(hit => hit.id)).toEqual(['old'])
    expect(calls).toEqual([{ siteId: 'site-1' }])
    await search.close()

    // A cold load with no source changes must not rewrite the index file.
    const indexPath = path.join(root, 'search', 'sites', 'site-1', 'index.json')
    const before = await fs.stat(indexPath)
    const unchanged = create()
    expect((await unchanged.searchSite({ siteId: 'site-1', q: 'old' })).map(hit => hit.id)).toEqual(['old'])
    await unchanged.close()
    expect((await fs.stat(indexPath)).mtimeMs).toBe(before.mtimeMs)

    // Simulate a change that happened while the index was not loaded (e.g. crash before flush).
    sourceFiles.push(file({ id: 'new', name: 'new-notes.txt', key: 'new.txt', updatedAt: '2026-01-05T00:00:00.000Z' }))
    const next = create()
    expect((await next.searchSite({ siteId: 'site-1', q: 'new' })).map(hit => hit.id)).toEqual(['new'])
    expect(calls.at(-1)).toEqual({ siteId: 'site-1', updatedAfter: new Date('2026-01-01T00:00:00.000Z') })
    expect(await next.rebuildSiteIndex('site-1')).toBe(2)
  })

  it('never exposes a half-built index to concurrent callers during a rebuild', async () => {
    const sourceFiles = Array.from({ length: 5 }, (_, index) => file({ id: `s-${index}`, name: `shared-${index}.txt`, key: `s-${index}.txt` }))
    let listCalls = 0
    const source: SearchIndexSource = {
      listSiteFiles: async () => {
        listCalls += 1
        await new Promise(resolve => setTimeout(resolve, 30))
        return sourceFiles
      },
      getSiteFile: async ({ contentId }) => sourceFiles.find(entry => entry.id === contentId) ?? null,
    }
    const { search } = await setup({ source })
    const [first, second] = await Promise.all([
      search.searchSite({ siteId: 'site-1', q: 'shared' }),
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        await search.indexFile(file({ id: 'extra', name: 'shared-extra.txt', key: 'extra.txt' }))
        return search.searchSite({ siteId: 'site-1', q: 'shared' })
      })(),
    ])
    expect(first).toHaveLength(5)
    expect(second).toHaveLength(6)
    expect(listCalls).toBe(1)
  })

  it('indexes content in the background from the source and removes vanished content', async () => {
    const sourceFiles = new Map<string, SearchIndexFile>([
      ['bg-1', file({ id: 'bg-1', name: 'background.txt', key: 'bg.txt' })],
    ])
    const source: SearchIndexSource = {
      listSiteFiles: async () => [...sourceFiles.values()],
      getSiteFile: async ({ contentId }) => sourceFiles.get(contentId) ?? null,
    }
    const { search } = await setup({ source, autoRebuild: false })
    search.enqueueIndexContent('site-1', 'bg-1')
    search.enqueueIndexContent('site-1', 'bg-1')
    await search.settle()
    expect(search.hasDocument('site-1', 'bg-1')).toBe(true)

    sourceFiles.delete('bg-1')
    search.enqueueIndexContent('site-1', 'bg-1')
    await search.settle()
    expect(search.hasDocument('site-1', 'bg-1')).toBe(false)
  })

  it('removes sites, propagates renames, and drops deleted content', async () => {
    const { root, search } = await setup()
    await search.indexFile(file({ id: 'r1', name: 'r1.txt', folderId: 'f1', folderName: 'Old Folder' }))
    await search.indexFile(file({ id: 'r2', name: 'r2.txt', folderId: 'f2', folderName: 'Other' }))

    await search.updateFolderName('site-1', 'f1', 'New Folder')
    await search.updateSiteName('site-1', 'Renamed Site')
    const hits = await search.searchSite({ siteId: 'site-1', q: '@folder:new' })
    expect(hits.map(hit => hit.id)).toEqual(['r1'])
    expect(hits[0]).toMatchObject({ folderName: 'New Folder', siteName: 'Renamed Site' })

    await search.removeContent('site-1', ['r2', 'unknown'])
    expect(await search.searchSite({ siteId: 'site-1', q: 'r2' })).toHaveLength(0)
    await search.settle()

    const dir = path.join(root, 'search', 'sites', 'site-1')
    await expect(fs.stat(dir)).resolves.toBeTruthy()
    await search.removeSite('site-1')
    await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(search.hasDocument('site-1', 'r1')).toBe(false)
  })

  it('evicts only clean, idle indexes and never loses unflushed changes', async () => {
    const { search } = await setup({ maxLoadedSites: 1, flushDelayMs: 5_000 })
    await search.indexFile(file({ id: 'a', siteId: 'site-a', name: 'alpha.txt' }))
    await search.indexFile(file({ id: 'b', siteId: 'site-b', name: 'beta.txt' }))
    // Both are dirty (flush pending) so neither may be evicted despite the capacity of 1.
    expect(search.loadedSiteCount).toBe(2)
    await search.flushAll()
    search.unloadIdleIndexes()
    expect(search.loadedSiteCount).toBe(1)
    // Evicted indexes reload transparently from disk.
    expect((await search.searchSite({ siteId: 'site-a', q: 'alpha' })).map(hit => hit.id)).toEqual(['a'])
    expect((await search.searchSite({ siteId: 'site-b', q: 'beta' })).map(hit => hit.id)).toEqual(['b'])
  })

  it('never writes to the index or storage on the read path', async () => {
    const { root, storage, search } = await setup()
    await storage.writeObject({ key: 'a.txt', body: Buffer.from('alpha beta gamma') })
    await storage.writeObject({ key: 'b.txt', body: Buffer.from('beta delta') })
    await search.indexFile(file({ id: 'a', name: 'a.txt', key: 'a.txt' }))
    await search.indexFile(file({ id: 'b', siteId: 'site-2', name: 'b.txt', key: 'b.txt' }))
    await search.settle()
    const indexPath = path.join(root, 'search', 'sites', 'site-1', 'index.json')
    const before = await fs.stat(indexPath)

    const writeSpy = vi.spyOn(fs, 'writeFile')
    const renameSpy = vi.spyOn(fs, 'rename')
    const storageWriteSpy = vi.spyOn(storage, 'writeObject')
    try {
      // Plain text, metadata-only, fuzzy-only, multi-site, and empty-result searches.
      await search.searchSite({ siteId: 'site-1', q: 'alpha' })
      await search.searchSite({ siteId: 'site-1', q: '@contentType:text' })
      await search.searchSite({ siteId: 'site-1', q: 'gamme beta' })
      await search.searchSite({ siteId: 'site-1', q: 'nothing-here' })
      await search.searchAcrossSites({ sites: [{ id: 'site-1' }, { id: 'site-2' }, { id: 'site-3' }], q: 'beta' })
      await search.settle()
      expect(writeSpy).not.toHaveBeenCalled()
      expect(renameSpy).not.toHaveBeenCalled()
      expect(storageWriteSpy).not.toHaveBeenCalled()
      expect((await fs.stat(indexPath)).mtimeMs).toBe(before.mtimeMs)
      // Searching an unknown site creates nothing on disk either (no source configured).
      await expect(fs.stat(path.join(root, 'search', 'sites', 'site-3'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      writeSpy.mockRestore()
      renameSpy.mockRestore()
      storageWriteSpy.mockRestore()
    }
  })

  it('ignores leftover temp files and keeps the last good index when a write fails mid-way', async () => {
    const { root, search, create } = await setup({ flushDelayMs: 60_000 })
    await search.indexFile(file({ id: 'keep', name: 'keep-me.txt' }))
    await search.flushAll()
    const dir = path.join(root, 'search', 'sites', 'site-1')
    const indexPath = path.join(dir, 'index.json')
    const good = await fs.readFile(indexPath, 'utf8')

    // A crash between writing the temp file and renaming it leaves a .tmp behind; it must be harmless.
    await fs.writeFile(path.join(dir, 'index.json.999.1.tmp'), '{"format":2,"siteId":"site-1","documents":[', 'utf8')
    await search.close()
    const reloaded = create()
    expect((await reloaded.searchSite({ siteId: 'site-1', q: 'keep' })).map(hit => hit.id)).toEqual(['keep'])

    // A failing rename must leave the previous file intact and clean up its own temp file.
    // (The retry is scheduled far in the future here so the intermediate state can be inspected.)
    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('disk full'), { code: 'ENOSPC' }))
    try {
      await reloaded.indexFile(file({ id: 'second', name: 'second.txt' }))
      await reloaded.flushAll()
    } finally {
      renameSpy.mockRestore()
    }
    expect(await fs.readFile(indexPath, 'utf8')).toBe(good)
    expect((await fs.readdir(dir)).filter(entry => entry.endsWith('.tmp'))).toEqual(['index.json.999.1.tmp'])
    // The change is still in memory and is persisted by the (forced) retry.
    expect((await reloaded.searchSite({ siteId: 'site-1', q: 'second' })).map(hit => hit.id)).toEqual(['second'])
    await reloaded.flushAll()
    const persisted = JSON.parse(await fs.readFile(indexPath, 'utf8'))
    expect(persisted.documents.map((doc: any) => doc.id).sort()).toEqual(['keep', 'second'])
    expect((await fs.readdir(dir)).filter(entry => entry.endsWith('.tmp'))).toEqual(['index.json.999.1.tmp'])
  })

  it('retries a failed flush with increasing delay and recovers once the disk is writable', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const { root, search } = await setup({ flushDelayMs: 20, logger })
    const dir = path.join(root, 'search', 'sites', 'site-1')
    const failures: number[] = []
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async () => {
      failures.push(Date.now())
      throw new Error('read-only file system')
    })
    try {
      await search.indexFile(file({ id: 'x', name: 'x.txt' }))
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(2), { timeout: 2_000, interval: 5 })
      expect(logger.error.mock.calls[0][1]).toMatchObject({ siteId: 'site-1', attempt: 1 })
      expect(logger.error.mock.calls[1][1]).toMatchObject({ siteId: 'site-1', attempt: 2 })
      // Second retry waits at least twice the base delay.
      expect(failures[1] - failures[0]).toBeGreaterThanOrEqual(35)
      await expect(fs.stat(path.join(dir, 'index.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      renameSpy.mockRestore()
    }
    // Disk recovers: the pending retry succeeds and the document is on disk.
    await vi.waitFor(async () => {
      const persisted = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8'))
      expect(persisted.documents.map((doc: any) => doc.id)).toEqual(['x'])
    }, { timeout: 2_000, interval: 5 })
    // Backoff resets after success: a new change is persisted promptly.
    await search.indexFile(file({ id: 'y', name: 'y.txt' }))
    await vi.waitFor(async () => {
      expect(JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8')).documents).toHaveLength(2)
    }, { timeout: 500, interval: 5 })
    expect(logger.error).toHaveBeenCalledTimes(2)
  })

  it.each([11, 23, 47])('stays consistent with a reference model under random concurrent operations (seed %i)', async seed => {
    const random = createRandom(seed)
    const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)]
    const sites = ['site-a', 'site-b', 'site-c']
    const folderIds = ['f1', 'f2']
    // Reference model: site -> id -> { version, folderId }
    const model = new Map<string, Map<string, { version: number; folderId: string }>>(sites.map(site => [site, new Map()]))
    const folderNames = new Map<string, string>()
    // Three-character tokens: below the fuzzy threshold and unambiguous under prefix matching.
    const symbol = (n: number) => '0123456789abcdefghijklmnopqrstuvwxyz'[n]
    const token = (id: string, version: number) => `q${symbol(Number(id.slice(1)))}${symbol(version)}`
    const ops = { index: 0, remove: 0, search: 0, rename: 0, flush: 0, evict: 0, removeSite: 0 }

    const { search, create } = await setup({ maxLoadedSites: 2, flushDelayMs: Math.floor(random() * 5), idleMs: 10_000 })

    const indexDoc = (site: string, id: string) => {
      const current = model.get(site)!.get(id)
      const version = (current?.version ?? 0) + 1
      const folderId = pick(folderIds)
      model.get(site)!.set(id, { version, folderId })
      ops.index += 1
      return search.indexFile({
        id,
        siteId: site,
        name: `${id}.pdf`,
        key: `${site}/${id}.pdf`,
        contentType: 'application/pdf',
        folderId,
        folderName: folderNames.get(`${site}:${folderId}`) ?? folderId,
        extractedText: `${token(id, version)} shared-word`,
        extractionStatus: 'complete',
        updatedAt: new Date(1_700_000_000_000 + version * 1000).toISOString(),
      })
    }

    for (let batch = 0; batch < 25; batch += 1) {
      const roll = random()
      if (roll < 0.06) {
        // Sequence-sensitive operations run alone so the expected state stays well defined.
        const site = pick(sites)
        ops.removeSite += 1
        await search.removeSite(site)
        model.get(site)!.clear()
        continue
      }
      const pending: Promise<unknown>[] = []
      const touched = new Set<string>()
      const batchSize = 1 + Math.floor(random() * 8)
      for (let n = 0; n < batchSize; n += 1) {
        const site = pick(sites)
        const id = `d${Math.floor(random() * 12)}`
        const key = `${site}:${id}`
        const action = random()
        if (action < 0.5) {
          if (touched.has(key)) continue
          touched.add(key)
          pending.push(indexDoc(site, id))
        } else if (action < 0.65) {
          if (touched.has(key)) continue
          touched.add(key)
          ops.remove += 1
          model.get(site)!.delete(id)
          pending.push(search.removeContent(site, [id]))
        } else if (action < 0.85) {
          ops.search += 1
          pending.push(search.searchSite({ siteId: site, q: 'shared-word', limit: 200 }))
        } else if (action < 0.9) {
          const folderId = pick(folderIds)
          const name = `Folder ${folderId} v${batch}`
          folderNames.set(`${site}:${folderId}`, name)
          ops.rename += 1
          pending.push(search.updateFolderName(site, folderId, name))
        } else if (action < 0.95) {
          ops.flush += 1
          pending.push(search.flushAll())
        } else {
          ops.evict += 1
          search.unloadIdleIndexes()
        }
      }
      await Promise.all(pending)
    }
    expect(ops.index).toBeGreaterThan(20)

    const verify = async (manager: SiteSearchIndexManager) => {
      for (const site of sites) {
        const expected = [...model.get(site)!.entries()]
        const all = await manager.searchSite({ siteId: site, q: 'shared-word', limit: 200 })
        expect(all.map(hit => hit.id).sort(), `${site} documents (seed ${seed})`).toEqual(expected.map(([id]) => id).sort())
        for (const [id, { version, folderId }] of expected) {
          const current = await manager.searchSite({ siteId: site, q: token(id, version) })
          expect(current.map(hit => hit.id), `${site}/${id} v${version} (seed ${seed})`).toEqual([id])
          expect(current[0].folderId).toBe(folderId)
          if (folderNames.has(`${site}:${folderId}`)) expect(current[0].folderName).toBe(folderNames.get(`${site}:${folderId}`))
          if (version > 1) expect(await manager.searchSite({ siteId: site, q: token(id, version - 1) })).toEqual([])
        }
      }
    }

    await search.settle()
    await verify(search)
    // Everything must survive a cold reload from disk.
    await search.close()
    await verify(create())
  })

  it('drains queued indexing and persists it before concurrent close calls finish', async () => {
    let releaseSource!: () => void
    const sourceReady = new Promise<void>(resolve => { releaseSource = resolve })
    const source: SearchIndexSource = {
      listSiteFiles: async () => [],
      getSiteFile: async ({ contentId }) => {
        await sourceReady
        return file({ id: contentId, name: `${contentId}.txt` })
      },
    }
    const { root, search } = await setup({ source, autoRebuild: false })
    search.enqueueIndexContent('site-1', 'queued')
    const closing = search.close()
    const alsoClosing = search.close()
    releaseSource()
    await Promise.all([closing, alsoClosing])

    const persisted = JSON.parse(await fs.readFile(path.join(root, 'search', 'sites', 'site-1', 'index.json'), 'utf8'))
    expect(persisted.documents.map((doc: any) => doc.id)).toEqual(['queued'])
  })

  it('rejects use after close and closes idempotently', async () => {
    const { search } = await setup()
    await search.indexFile(file({ id: 'x', name: 'x.txt' }))
    await search.close()
    await search.close()
    await expect(search.searchSite({ siteId: 'site-1', q: 'x' })).rejects.toThrow(/closed/)
  })
})
