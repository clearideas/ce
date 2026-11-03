import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
import { createMongoSearchIndexSource, toSearchIndexFile } from '../../src/services/search-index-source.js'
import { createFakeModel } from './helpers/fake-models.js'

describe('search index source (database adapter)', () => {
  const site = { _id: 'site-1', name: 'Finance', attributes: { tags: ['acme', 'finance'] } }
  const otherSite = { _id: 'site-2', name: 'Elsewhere', attributes: {} }
  const t = (iso: string) => new Date(iso)
  const docs = [
    { _id: 'folder-1', site: 'site-1', kind: 'Folder', status: 'active', name: 'Reports', parent: 'site-1', parentType: 'Site' },
    { _id: 'folder-2', site: 'site-1', kind: 'Folder', status: 'active', name: 'Nested', parent: 'folder-1', parentType: 'Content' },
    { _id: 'f-root', site: 'site-1', kind: 'File', status: 'active', name: 'root.txt', key: 'root.txt', contentType: 'text/plain', parent: 'site-1', parentType: 'Site', tags: ['a'], uploadedAt: t('2026-01-01T00:00:00Z'), createdAt: t('2026-01-01T00:00:00Z'), updatedAt: t('2026-01-02T00:00:00Z'), attributes: { metadata: { owner: 'Jane' } } },
    { _id: 'f-nested', site: 'site-1', kind: 'File', status: 'active', name: 'deep.pdf', key: 'deep.pdf', contentType: 'application/pdf', parent: 'folder-2', parentType: 'Content', extractedTextKey: 'deep.pdf.extracted.txt', extractionStatus: 'complete', uploadedAt: t('2026-01-03T00:00:00Z'), updatedAt: t('2026-01-04T00:00:00Z'), attributes: { metadata: 'not-an-object' } },
    { _id: 'f-pending', site: 'site-1', kind: 'File', status: 'upload-pending', name: 'pending.txt', key: 'pending.txt', parent: 'site-1', parentType: 'Site', updatedAt: t('2026-01-05T00:00:00Z') },
    { _id: 'f-other', site: 'site-2', kind: 'File', status: 'active', name: 'other.txt', key: 'other.txt', parent: 'site-2', parentType: 'Site', updatedAt: t('2026-01-06T00:00:00Z') },
  ]
  const models = { SiteModel: createFakeModel([site, otherSite]), ContentModel: createFakeModel(docs) }
  const source = createMongoSearchIndexSource(models)

  it('lists only active files of the requested site, oldest change first, with folder and site details', async () => {
    const files = await source.listSiteFiles({ siteId: 'site-1' })
    expect(files.map(file => file.id)).toEqual(['f-root', 'f-nested'])
    expect(files[0]).toMatchObject({
      siteId: 'site-1',
      siteName: 'Finance',
      siteTags: ['acme', 'finance'],
      folderId: '',
      folderName: '',
      tags: ['a'],
      metadata: { owner: 'Jane' },
      createdAt: t('2026-01-01T00:00:00Z'),
      updatedAt: t('2026-01-02T00:00:00Z'),
    })
    expect(files[1]).toMatchObject({
      folderId: 'folder-2',
      folderName: 'Nested',
      extractedTextKey: 'deep.pdf.extracted.txt',
      extractionStatus: 'complete',
      // Malformed metadata is ignored rather than indexed.
      metadata: {},
      // createdAt falls back to uploadedAt when the record has none.
      createdAt: t('2026-01-03T00:00:00Z'),
    })
  })

  it('supports folder scoping and the inclusive updatedAfter watermark', async () => {
    expect((await source.listSiteFiles({ siteId: 'site-1', folderId: 'folder-2' })).map(file => file.id)).toEqual(['f-nested'])
    expect((await source.listSiteFiles({ siteId: 'site-1', folderId: 'folder-1' })).map(file => file.id)).toEqual([])
    expect((await source.listSiteFiles({ siteId: 'site-1', updatedAfter: t('2026-01-02T00:00:00Z') })).map(file => file.id)).toEqual(['f-root', 'f-nested'])
    expect((await source.listSiteFiles({ siteId: 'site-1', updatedAfter: t('2026-01-02T00:00:00.001Z') })).map(file => file.id)).toEqual(['f-nested'])
    expect(await source.listSiteFiles({ siteId: 'missing-site' })).toEqual([])
  })

  it('resolves single files only within their site and only while active', async () => {
    await expect(source.getSiteFile({ siteId: 'site-1', contentId: 'f-nested' })).resolves.toMatchObject({ id: 'f-nested', folderName: 'Nested' })
    await expect(source.getSiteFile({ siteId: 'site-2', contentId: 'f-nested' })).resolves.toBeNull()
    await expect(source.getSiteFile({ siteId: 'site-1', contentId: 'f-pending' })).resolves.toBeNull()
    await expect(source.getSiteFile({ siteId: 'site-1', contentId: 'folder-1' })).resolves.toBeNull()
    await expect(source.getSiteFile({ siteId: 'site-1', contentId: 'nope' })).resolves.toBeNull()
  })

  it('maps records defensively', () => {
    const mapped = toSearchIndexFile({ _id: 'x', name: undefined, key: undefined, tags: 'bad', attributes: {} }, { _id: 's', name: undefined }, undefined)
    expect(mapped).toMatchObject({ id: 'x', siteId: 's', siteName: '', name: '', key: '', tags: [], siteTags: [], metadata: {}, folderId: '', folderName: '' })
  })
})

describe('local storage bounded reads', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  it('reads at most maxBytes and reports truncation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clearideas-prefix-test-'))
    cleanups.push(() => fs.rm(root, { recursive: true, force: true }))
    const storage = createLocalStorageProvider(root)
    await storage.writeObject({ key: 'big.txt', body: Buffer.from('0123456789'.repeat(1000)) })
    await storage.writeObject({ key: 'empty.txt', body: Buffer.alloc(0) })

    const exact = await storage.readObjectPrefix!({ key: 'big.txt', maxBytes: 10_000 })
    expect(exact.body.length).toBe(10_000)
    expect(exact.truncated).toBe(false)

    const larger = await storage.readObjectPrefix!({ key: 'big.txt', maxBytes: 1_000_000 })
    expect(larger.body.length).toBe(10_000)
    expect(larger.truncated).toBe(false)

    const capped = await storage.readObjectPrefix!({ key: 'big.txt', maxBytes: 25 })
    expect(capped.body.toString('utf8')).toBe('0123456789012345678901234')
    expect(capped.truncated).toBe(true)

    const none = await storage.readObjectPrefix!({ key: 'big.txt', maxBytes: 0 })
    expect(none.body.length).toBe(0)
    expect(none.truncated).toBe(true)

    const empty = await storage.readObjectPrefix!({ key: 'empty.txt', maxBytes: 100 })
    expect(empty.body.length).toBe(0)
    expect(empty.truncated).toBe(false)

    await expect(storage.readObjectPrefix!({ key: 'missing.txt', maxBytes: 10 })).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(storage.readObjectPrefix!({ key: '../escape.txt', maxBytes: 10 })).rejects.toThrow(/Invalid storage/)
  })
})
