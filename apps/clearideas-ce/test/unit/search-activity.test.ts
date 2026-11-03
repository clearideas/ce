import { describe, expect, it } from 'vitest'
import { logSearchActivity, MAX_ATTRIBUTED_SITES_PER_SEARCH, SEARCH_ACTIVITY_ACTION } from '../../src/services/search-activity.js'

function collector() {
  const records: any[] = []
  return { records, activity: { async safe(activity: any) { records.push(activity) } } }
}

describe('search activity attribution', () => {
  it('attributes scoped searches to the searched site, including zero-result searches', async () => {
    const { records, activity } = collector()
    await logSearchActivity({ activity, user: 'u1', q: 'Budget 2026', scope: 'site', source: 'ce-search', siteId: 's1', matchedBySite: new Map([['s1', 3]]) })
    await logSearchActivity({ activity, user: 'u1', q: 'nothing', scope: 'folder', source: 'ce-chat', siteId: 's1', folderId: 'f1', matchedBySite: new Map() })
    expect(records).toEqual([
      {
        user: 'u1',
        action: SEARCH_ACTIVITY_ACTION,
        target: 's1',
        onModel: 'Site',
        parent: 's1',
        parentOnModel: 'Site',
        attributes: { q: 'Budget 2026', scope: 'site', source: 'ce-search', resultCount: 3 },
      },
      {
        user: 'u1',
        action: SEARCH_ACTIVITY_ACTION,
        target: 's1',
        onModel: 'Site',
        parent: 's1',
        parentOnModel: 'Site',
        attributes: { q: 'nothing', scope: 'folder', source: 'ce-chat', folderId: 'f1', resultCount: 0 },
      },
    ])
  })

  it('attributes multi-site searches only to sites that matched, with per-site counts', async () => {
    const { records, activity } = collector()
    await logSearchActivity({
      activity,
      user: 'u1',
      q: 'merger',
      scope: 'all',
      source: 'ce-mcp',
      accessKeyId: 'key-1',
      matchedBySite: new Map([['s1', 2], ['s2', 0], ['s3', 5]]),
    })
    expect(records.map(record => [record.parent, record.attributes.resultCount])).toEqual([['s1', 2], ['s3', 5]])
    for (const record of records) {
      expect(record).toMatchObject({ action: SEARCH_ACTIVITY_ACTION, onModel: 'Site', parentOnModel: 'Site' })
      expect(record.attributes).toMatchObject({ q: 'merger', scope: 'all', source: 'ce-mcp', accessKeyId: 'key-1' })
      // The global total must never be recorded against a single site.
      expect(record.attributes.resultCount).not.toBe(7)
    }
  })

  it('records a parent-less audit entry when a multi-site search matched nothing', async () => {
    const { records, activity } = collector()
    await logSearchActivity({ activity, user: 'u1', q: 'unicorns', scope: 'all', source: 'ce-search', matchedBySite: new Map([['s1', 0]]) })
    expect(records).toEqual([
      {
        user: 'u1',
        action: SEARCH_ACTIVITY_ACTION,
        target: 'u1',
        onModel: 'User',
        attributes: { q: 'unicorns', scope: 'all', source: 'ce-search', resultCount: 0, matchedSiteCount: 0 },
      },
    ])
    expect(records[0]).not.toHaveProperty('parent')
  })

  it('never truncates the query and bounds the number of per-site records', async () => {
    const { records, activity } = collector()
    const longQuery = 'x'.repeat(5000)
    const matched = new Map(Array.from({ length: MAX_ATTRIBUTED_SITES_PER_SEARCH + 20 }, (_, index) => [`site-${index}`, 1]))
    await logSearchActivity({ activity, user: 'u1', q: longQuery, scope: 'all', source: 'ce-search', matchedBySite: matched })
    expect(records).toHaveLength(MAX_ATTRIBUTED_SITES_PER_SEARCH)
    expect(records[0].attributes.q).toBe(longQuery)
  })
})
