import { describe, expect, it } from 'vitest'
import {
  buildFileNameSearchRegex,
  buildSearchQueryPredicates,
  createCoreContentService,
  hasSiteRole,
  isValidMetadataFilterKey,
  matchesMetadataFilters,
  matchesMetadataSearch,
  mcpSearchContentArgsSchema,
  parseMetadataSearchQuery,
  resolveCurrentUserRole,
  buildPermittedSitesQuery,
  searchableMetadataValues,
  validateSchema,
} from '@clearideas/core'

describe('search query parsing and metadata matching', () => {
  it('parses metadata expressions and keeps plain text separately', () => {
    expect(parseMetadataSearchQuery('GMV @contentType:application/pdf')).toEqual({
      plainText: 'gmv',
      filters: [{ key: 'contenttype', value: 'application/pdf' }],
    })
    expect(parseMetadataSearchQuery('@name:"Jane Doe" @tag:invoice')).toEqual({
      plainText: '',
      filters: [{ key: 'name', value: 'jane doe' }, { key: 'tag', value: 'invoice' }],
    })
  })

  it('treats Object.prototype member names and malformed keys as plain text instead of filters', () => {
    for (const key of ['constructor', '__proto__', 'prototype', 'to/string', 'a b']) {
      expect(isValidMetadataFilterKey(key)).toBe(false)
    }
    expect(isValidMetadataFilterKey('expiryDate')).toBe(true)
    expect(isValidMetadataFilterKey('content-type')).toBe(true)

    const parsed = parseMetadataSearchQuery('@constructor:native @__proto__:x report')
    expect(parsed.filters).toEqual([])
    expect(parsed.plainText).toBe('@constructor:native @__proto__:x report')

    // Direct lookups with those keys must never throw or match everything.
    const file = { name: 'report.pdf', contentType: 'application/pdf', metadata: {} }
    expect(searchableMetadataValues({ file, key: 'constructor' })).toEqual([])
    expect(searchableMetadataValues({ file, key: '__proto__' })).toEqual([])
    expect(searchableMetadataValues({ file, key: 'tostring' })).toEqual([])
    expect(matchesMetadataFilters({ file, filters: [{ key: 'constructor', value: 'native' }] })).toBe(false)
  })

  it('matches content tags, site tags, ISO dates, and custom metadata case-insensitively', () => {
    const file = {
      name: 'invoice.pdf',
      contentType: 'application/pdf',
      tags: ['Invoice'],
      createdAt: new Date('2026-02-05T10:00:00Z'),
      uploadedAt: new Date('2026-02-05T10:00:00Z'),
      updatedAt: new Date('2026-02-06T10:00:00Z'),
      attributes: { metadata: { expiryDate: '2026-12-31', fullName: 'Jane Doe' } },
    }
    const site = { name: 'Acme', attributes: { tags: ['finance'] } }
    const matches = (q: string) => matchesMetadataSearch({ file, site, folder: { name: 'Q1' }, search: parseMetadataSearchQuery(q) })

    expect(matches('@tag:invoice')).toBe(true)
    expect(matches('@tags:finance')).toBe(true)
    expect(matches('@createdAt:2026-02')).toBe(true)
    expect(matches('@createdAt:2025')).toBe(false)
    expect(matches('@uploadedAt:2026-02-05')).toBe(true)
    expect(matches('@expiryDate:2026-12')).toBe(true)
    expect(matches('@fullname:"jane doe"')).toBe(true)
    expect(matches('@folder:q1')).toBe(true)
    expect(matches('@site:acme')).toBe(true)
    expect(matches('inv @contentType:pdf')).toBe(true)
    expect(matches('inv @contentType:text')).toBe(false)
    expect(matches('annual (invoice)')).toBe(false)
    // Punctuation-only queries must not match everything.
    expect(matches('...')).toBe(false)
  })

  it('builds database predicates that mirror in-memory name matching', () => {
    const regex = buildFileNameSearchRegex('annual report')!
    expect(regex.test('Annual_Report.pdf')).toBe(true)
    expect(regex.test('annual (report) final.pdf')).toBe(true)
    expect(regex.test('report annual.pdf')).toBe(false)
    expect(buildFileNameSearchRegex('a.b')!.test('xa.by')).toBe(true)
    expect(buildFileNameSearchRegex('a.b')!.test('xaXby')).toBe(false)
    expect(buildFileNameSearchRegex('   ')).toBeNull()

    const predicates = buildSearchQueryPredicates(parseMetadataSearchQuery('invoice @contentType:application/pdf'))
    // Patterns are plain strings with $options so they are portable across MongoDB versions.
    expect(predicates.name).toEqual({ $regex: expect.any(String), $options: 'i' })
    expect(predicates.contentType).toEqual({ $regex: 'application/pdf', $options: 'i' })
    expect(new RegExp((predicates.name as any).$regex, 'iu').test('My Invoice.pdf')).toBe(true)
    expect(buildSearchQueryPredicates(parseMetadataSearchQuery('@tag:x'))).toEqual({})
    expect(buildSearchQueryPredicates(parseMetadataSearchQuery('a.b+c'))).toEqual({ name: { $regex: 'a\\.b\\+c|a[^\\p{L}\\p{N}]+b[^\\p{L}\\p{N}]+c', $options: 'i' } })
  })

  it('validates MCP search arguments, accepting q as an alias and bounding query length', async () => {
    await expect(validateSchema(mcpSearchContentArgsSchema, { q: 'hello' })).resolves.toMatchObject({ query: 'hello' })
    await expect(validateSchema(mcpSearchContentArgsSchema, { query: 'hello', limit: '20' })).resolves.toMatchObject({ query: 'hello', limit: 20 })
    await expect(validateSchema(mcpSearchContentArgsSchema, { query: 'x'.repeat(501) })).rejects.toThrow(/too long/)
    await expect(validateSchema(mcpSearchContentArgsSchema, { query: '' })).rejects.toThrow(/required/)
    await expect(validateSchema(mcpSearchContentArgsSchema, { query: 'ok', siteIds: ['not-an-id'] })).rejects.toThrow()
  })
})

describe('site membership validity', () => {
  const roles = { ownerRoles: ['owner'], adminRoles: ['owner', 'admin'], defaultRole: '' }
  const future = new Date(Date.now() + 60 * 60 * 1000)
  const past = new Date(Date.now() - 60 * 60 * 1000)
  const site = {
    owner: 'account-1',
    members: [
      { user: 'active', role: 'viewer', acceptedAt: new Date(), declinedAt: null },
      { user: 'expired', role: 'editor', expiresAt: past },
      { user: 'not-yet-expired', role: 'editor', expiresAt: future },
      { user: 'declined', role: 'viewer', declinedAt: new Date() },
    ],
  }

  it('ignores expired and declined memberships when resolving roles', () => {
    const check = (userId: string) => hasSiteRole({ site, accountId: 'other', userId, permittedRoles: ['viewer', 'editor'], roles })
    expect(check('active')).toMatchObject({ allowed: true, role: 'viewer' })
    expect(check('not-yet-expired')).toMatchObject({ allowed: true, role: 'editor' })
    expect(check('expired')).toMatchObject({ allowed: false, role: '' })
    expect(check('declined')).toMatchObject({ allowed: false, role: '' })
    expect(resolveCurrentUserRole(site, 'other', 'expired', 'owner')).toBe('')
    expect(resolveCurrentUserRole(site, 'other', 'active', 'owner')).toBe('viewer')
  })

  it('excludes expired and declined memberships in permitted-site queries', () => {
    const now = new Date('2026-03-01T00:00:00Z')
    const query = buildPermittedSitesQuery({ accountId: 'account-1', userId: 'user-1', roles: ['viewer'], now })
    expect(query).toEqual({
      $or: [
        {
          members: {
            $elemMatch: {
              user: 'user-1',
              role: { $in: ['viewer'] },
              declinedAt: null,
              $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
            },
          },
        },
      ],
    })
  })
})

describe('database file search', () => {
  function createModels(files: any[]) {
    const queries: any[] = []
    const site = { _id: 'site-1', name: 'Acme', visibility: 'public', owner: 'account-1', members: [] }
    const ContentModel = {
      find: (query: any) => {
        queries.push(query)
        const matching = files.filter(file => {
          if (query.kind && file.kind !== query.kind) return false
          if (query.site && String(file.site) !== String(query.site)) return false
          if (query.parent && String(file.parent) !== String(query.parent)) return false
          if (query._id?.$in) return query._id.$in.map(String).includes(String(file._id))
          if (query.name?.$regex && !new RegExp(query.name.$regex, 'iu').test(file.name)) return false
          if (query.contentType?.$regex && !new RegExp(query.contentType.$regex, 'iu').test(file.contentType ?? '')) return false
          return true
        })
        const chain: any = {
          sort: () => chain,
          limit: () => chain,
          select: () => chain,
          lean: () => {
            const withCursor: any = Promise.resolve(matching)
            withCursor.cursor = () => ({
              async *[Symbol.asyncIterator]() {
                for (const file of matching) yield file
              },
              close: async () => undefined,
            })
            return withCursor
          },
        }
        return chain
      },
      findById: (id: string) => ({
        select: () => ({ lean: async () => files.find(file => String(file._id) === String(id)) ?? null }),
      }),
    }
    const SiteModel = {
      findById: () => ({ lean: async () => site, select: () => ({ lean: async () => site }) }),
      find: () => ({ lean: async () => [site], select: () => ({ lean: async () => [site] }) }),
    }
    return { models: { ContentModel, SiteModel, UserModel: {}, AccountModel: {} }, queries }
  }

  it('pushes name and content-type predicates into the database query and resolves folders in batch', async () => {
    const files = [
      { _id: 'f1', site: 'site-1', kind: 'File', status: 'active', name: 'Annual_Report.pdf', contentType: 'application/pdf', parentType: 'Content', parent: 'folder-1', updatedAt: new Date('2026-01-02') },
      { _id: 'f2', site: 'site-1', kind: 'File', status: 'active', name: 'budget.xlsx', contentType: 'application/vnd.ms-excel', parentType: 'Site', parent: 'site-1', updatedAt: new Date('2026-01-01') },
      { _id: 'folder-1', site: 'site-1', kind: 'Folder', status: 'active', name: 'Reports', parentType: 'Site', parent: 'site-1' },
    ]
    const { models, queries } = createModels(files)
    const service = createCoreContentService(models as any, { storage: {} as any })

    const results = await service.searchFilesByName({ siteId: 'site-1', name: 'annual report @contentType:pdf' })
    expect(results.map((file: any) => file.id)).toEqual(['f1'])
    expect(results[0]).toMatchObject({ folderId: 'folder-1', folderName: 'Reports', siteName: 'Acme' })
    const fileQuery = queries.find(query => query.kind === 'File')
    expect(fileQuery.name).toEqual({ $regex: expect.any(String), $options: 'i' })
    expect(fileQuery.contentType).toEqual({ $regex: 'pdf', $options: 'i' })
    expect(fileQuery.status).toBe('active')

    await expect(service.searchFilesByName({ siteId: 'site-1', name: '   ' })).rejects.toThrow(/required/i)
  })
})
