import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalStorageProvider } from '../../src/app.js'
import { CoreController } from '../../src/controllers/core/core.controller.js'
import { createSiteSearchIndexManager, type SiteSearchIndexManager } from '../../src/services/search-index.js'
import { createMongoSearchIndexSource } from '../../src/services/search-index-source.js'
import { createFakeModel } from './helpers/fake-models.js'

const silentLogger = { info() {}, warn() {}, error() {} }

function objectId(seed: number) {
  return seed.toString(16).padStart(24, '0')
}

describe('search request flow (controller + index + database)', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!()
  })

  async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clearideas-search-flow-'))
    const storage = createLocalStorageProvider(path.join(root, 'storage'))
    await fs.mkdir(path.join(root, 'storage'), { recursive: true })

    const ownerUserId = objectId(1)
    const accountId = objectId(2)
    const siteId = objectId(10)
    const otherSiteId = objectId(11)
    const folderId = objectId(20)
    const now = new Date('2026-03-01T10:00:00Z')

    const models = {
      UserModel: createFakeModel([{ _id: ownerUserId, email: 'owner@example.com', roles: ['member'], attributes: {} }]),
      AccountModel: createFakeModel([{ _id: accountId, owner: ownerUserId, name: 'Owner', attributes: {} }]),
      SiteModel: createFakeModel([
        { _id: siteId, name: 'Finance', owner: accountId, members: [], visibility: 'private', attributes: { tags: ['acme'] } },
        { _id: otherSiteId, name: 'Elsewhere', owner: objectId(99), members: [], visibility: 'private', attributes: {} },
      ]),
      ContentModel: createFakeModel([
        { _id: folderId, site: siteId, kind: 'Folder', status: 'active', name: 'Reports', parent: siteId, parentType: 'Site', attributes: {} },
        {
          _id: objectId(30), site: siteId, kind: 'File', status: 'active', name: 'Annual_Report.pdf', key: 'annual.pdf',
          contentType: 'application/pdf', extractionStatus: 'complete', extractedTextKey: 'annual.pdf.extracted.txt',
          parent: folderId, parentType: 'Content', tags: ['finance'], uploadedAt: now, createdAt: now, updatedAt: now, attributes: {},
        },
        {
          _id: objectId(31), site: siteId, kind: 'File', status: 'active', name: 'notes.md', key: 'notes.md', contentType: 'text/markdown',
          parent: siteId, parentType: 'Site', uploadedAt: now, createdAt: now, updatedAt: now, attributes: { metadata: { owner: 'Jane' } },
        },
        {
          _id: objectId(32), site: otherSiteId, kind: 'File', status: 'active', name: 'secret-annual.txt', key: 'secret.txt', contentType: 'text/plain',
          parent: otherSiteId, parentType: 'Site', uploadedAt: now, createdAt: now, updatedAt: now, attributes: {},
        },
      ]),
      ActivityModel: createFakeModel([]),
      UserGroupModel: createFakeModel([]),
      AccessKeyModel: createFakeModel([]),
      SessionModel: createFakeModel([]),
      AgentModel: createFakeModel([]),
      AgentRunModel: createFakeModel([]),
      AgentScheduleModel: createFakeModel([]),
      AgentTaskModel: createFakeModel([]),
    }
    await storage.writeObject({ key: 'annual.pdf.extracted.txt', body: Buffer.from('Revenue grew 12% year over year. Operating margin improved.') })
    await storage.writeObject({ key: 'notes.md', body: Buffer.from('# Notes\n\nDiscussed revenue targets with Jane.') })
    await storage.writeObject({ key: 'secret.txt', body: Buffer.from('revenue secrets of another site') })

    const search: SiteSearchIndexManager = createSiteSearchIndexManager({
      root: path.join(root, 'search'),
      storage,
      source: createMongoSearchIndexSource(models),
      logger: silentLogger,
      flushDelayMs: 0,
    })
    const controller = new CoreController({ auth: {}, models: models as any, providers: { storage } as any, search })
    cleanups.push(async () => {
      await search.close()
      await fs.rm(root, { recursive: true, force: true })
    })

    const call = async (handler: (req: any, res: any) => Promise<void>, req: Record<string, unknown>) => {
      let payload: any
      let status = 200
      const res = {
        status(code: number) {
          status = code
          return res
        },
        json(body: any) {
          payload = body
          return res
        },
      }
      await handler({ sub: ownerUserId, accountId, params: {}, body: {}, ...req }, res)
      return { status, body: payload }
    }

    return { models, search, controller, call, siteId, otherSiteId, folderId, ownerUserId }
  }

  const searchRecords = (models: any) =>
    models.ActivityModel.docs
      .filter((doc: any) => doc.action === 'content-searched')
      .map((doc: any) => ({ parent: doc.parent ? String(doc.parent) : undefined, onModel: doc.onModel, ...doc.attributes }))

  it('searches a site with full text, filename, and metadata, never leaking other sites', async () => {
    const { controller, call, siteId, folderId, search } = await setup()

    const fullText = await call(controller.searchSite, { params: { siteId }, body: { q: 'revenue grew' } })
    expect(fullText.body.results.map((result: any) => result.name)).toEqual(['Annual_Report.pdf'])
    expect(fullText.body.results[0]).toMatchObject({
      folderId: expect.any(String),
      folderName: 'Reports',
      siteName: 'Finance',
      textAvailable: true,
    })
    expect(fullText.body.results[0].snippet).toContain('Revenue grew 12%')

    // Both files mention revenue; the hit from the other site is excluded.
    const shared = await call(controller.searchSite, { params: { siteId }, body: { q: 'revenue' } })
    expect(shared.body.results.map((result: any) => result.name).sort()).toEqual(['Annual_Report.pdf', 'notes.md'])

    // Filename matching tolerates punctuation differences and is served by both index and database.
    const byName = await call(controller.searchSite, { params: { siteId }, body: { q: 'annual report' } })
    expect(byName.body.results.map((result: any) => result.name)).toEqual(['Annual_Report.pdf'])

    // Metadata filters: content tags, site tags, custom metadata, dates.
    for (const [q, expected] of [
      ['@tag:finance', ['Annual_Report.pdf']],
      ['@tags:acme', ['Annual_Report.pdf', 'notes.md']],
      ['@owner:jane', ['notes.md']],
      ['@createdAt:2026-03', ['Annual_Report.pdf', 'notes.md']],
      ['@contentType:markdown', ['notes.md']],
      ['@constructor:x', []],
    ] as Array<[string, string[]]>) {
      const response = await call(controller.searchSite, { params: { siteId }, body: { q } })
      expect(response.body.results.map((result: any) => result.name).sort(), q).toEqual(expected)
    }

    // Folder-scoped search only returns direct children of that folder.
    expect(fullText.body.results[0].folderId).toBe(folderId)
    const inFolder = await call(controller.searchSiteFolder, { params: { siteId, id: folderId }, body: { q: 'revenue' } })
    expect(inFolder.body.results.map((result: any) => result.name)).toEqual(['Annual_Report.pdf'])

    await search.settle()
    expect(search.hasDocument(siteId, objectId(30))).toBe(true)
    expect(search.hasDocument(siteId, objectId(31))).toBe(true)

    // Once the index is complete, searching (any shape of query) must not schedule indexing work.
    const enqueueSpy = vi.spyOn(search, 'enqueueIndexContent')
    const indexSpy = vi.spyOn(search, 'indexFile')
    const removeSpy = vi.spyOn(search, 'removeContent')
    for (const q of ['revenue', 'annual report', 'revnue grew', '@tag:finance', '@contentType:pdf', 'no-such-term']) {
      await call(controller.searchSite, { params: { siteId }, body: { q } })
    }
    await search.settle()
    expect(enqueueSpy).not.toHaveBeenCalled()
    expect(indexSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('drops stale index entries and schedules indexing for database files missing from the index', async () => {
    const { controller, call, siteId, search, models } = await setup()

    // Prime the index, then add a file directly in the database (e.g. a restore or manual edit).
    await call(controller.searchSite, { params: { siteId }, body: { q: 'revenue' } })
    const lateId = objectId(40)
    await models.ContentModel.create({
      _id: lateId, site: siteId, kind: 'File', status: 'active', name: 'late-addition.txt', key: 'late.txt', contentType: 'text/plain',
      parent: siteId, parentType: 'Site', uploadedAt: new Date(), updatedAt: new Date(), attributes: {},
    })
    expect(search.hasDocument(siteId, lateId)).toBe(false)
    const found = await call(controller.searchSite, { params: { siteId }, body: { q: 'late addition' } })
    expect(found.body.results.map((result: any) => result.id)).toEqual([lateId])
    await search.settle()
    expect(search.hasDocument(siteId, lateId)).toBe(true)

    // Delete the record behind the index's back: the hit disappears and the entry is cleaned up.
    await models.ContentModel.deleteMany({ _id: lateId })
    const gone = await call(controller.searchSite, { params: { siteId }, body: { q: 'late addition' } })
    expect(gone.body.results).toEqual([])
    await search.settle()
    expect(search.hasDocument(siteId, lateId)).toBe(false)
  })

  it('attributes search activity to the searched site, and global searches only to sites that matched', async () => {
    const { controller, call, siteId, otherSiteId, folderId, models, ownerUserId } = await setup()

    // Scoped searches are always attributed to their site, even with no results.
    await call(controller.searchSite, { params: { siteId }, body: { q: 'revenue' } })
    await call(controller.searchSiteFolder, { params: { siteId, id: folderId }, body: { q: 'nothing-matches-here' } })
    expect(searchRecords(models)).toEqual([
      { parent: siteId, onModel: 'Site', q: 'revenue', scope: 'site', source: 'ce-search', resultCount: 2 },
      { parent: siteId, onModel: 'Site', q: 'nothing-matches-here', scope: 'folder', source: 'ce-search', folderId, resultCount: 0 },
    ])
    models.ActivityModel.docs.length = 0

    // The user belongs to both sites. "revenue" matches in both: each site's admin sees it with that site's count only.
    const permittedSiteIds = [siteId, otherSiteId]
    await call(controller.searchAll, { body: { q: 'revenue' }, permittedSiteIds })
    expect(searchRecords(models).sort((a: any, b: any) => a.parent.localeCompare(b.parent))).toEqual([
      { parent: siteId, onModel: 'Site', q: 'revenue', scope: 'all', source: 'ce-search', resultCount: 2 },
      { parent: otherSiteId, onModel: 'Site', q: 'revenue', scope: 'all', source: 'ce-search', resultCount: 1 },
    ])
    models.ActivityModel.docs.length = 0

    // "secrets" only matches the other site: the Finance administrator must never see this term.
    await call(controller.searchAll, { body: { q: 'secrets' }, permittedSiteIds })
    expect(searchRecords(models)).toEqual([
      { parent: otherSiteId, onModel: 'Site', q: 'secrets', scope: 'all', source: 'ce-search', resultCount: 1 },
    ])
    models.ActivityModel.docs.length = 0

    // No matches anywhere: audit record for the user only, attached to no site.
    await call(controller.searchAll, { body: { q: 'unicorns' }, permittedSiteIds })
    const [record] = models.ActivityModel.docs
    expect(record).toMatchObject({ action: 'content-searched', user: ownerUserId, target: ownerUserId, onModel: 'User' })
    expect(record.parent).toBeUndefined()
    expect(record.attributes).toEqual({ q: 'unicorns', scope: 'all', source: 'ce-search', resultCount: 0, matchedSiteCount: 0 })
  })

  it('searches across all permitted sites ranked by relevance', async () => {
    const { controller, call, siteId, otherSiteId } = await setup()
    const all = await call(controller.searchAll, { body: { q: 'revenue' }, permittedSiteIds: [siteId] })
    const names = all.body.results.map((result: any) => result.name)
    expect(names).toContain('Annual_Report.pdf')
    expect(names).toContain('notes.md')
    expect(names).not.toContain('secret-annual.txt')
    expect(all.body.results.every((result: any) => result.siteId === siteId && result.siteId !== otherSiteId)).toBe(true)

    // Without any permitted sites the global search returns nothing (and touches no index).
    const none = await call(controller.searchAll, { body: { q: 'revenue' }, permittedSiteIds: [] })
    expect(none.body.results).toEqual([])
  })
})
