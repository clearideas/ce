import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { AnalyticsController } from '../../src/controllers/analytics/analytics.controller.js'

function objectId(seed: number) {
  return seed.toString(16).padStart(24, '0')
}

describe('search terms analytics report', () => {
  const adminUserId = objectId(1)
  const accountId = objectId(2)
  const administeredSite = objectId(10)
  const otherSite = objectId(11)

  function setup(aggregateRows: any[]) {
    const pipelines: any[] = []
    const siteQueries: any[] = []
    const models = {
      SiteModel: {
        find: (query: any) => {
          siteQueries.push(query)
          return { select: () => ({ lean: async () => [{ _id: administeredSite }] }) }
        },
      },
      ActivityModel: {
        aggregate: async (pipeline: any[]) => {
          pipelines.push(pipeline)
          return aggregateRows
        },
      },
    }
    const controller = new AnalyticsController({ auth: {}, models: models as any, providers: {} })
    const call = async (body: Record<string, unknown> = {}, params: Record<string, unknown> = {}) => {
      let payload: any
      await controller.postSearchTerms(
        { sub: adminUserId, accountId, body, query: {}, params } as any,
        { json: (value: any) => { payload = value } } as any,
      )
      return payload
    }
    return { call, pipelines, siteQueries }
  }

  it('scopes site routes to the route site even though the validated param is an ObjectId', async () => {
    const { call, siteQueries, pipelines } = setup([])
    // Body asks for another site too; the route site wins.
    await call({ sites: [otherSite] }, { siteId: new Types.ObjectId(administeredSite) })
    expect(siteQueries[0]._id.$in.map(String)).toEqual([administeredSite])
    expect(pipelines[0][0].$match.parent.$in.map(String)).toEqual([administeredSite])
  })

  it('only aggregates search records attributed to sites the caller administers', async () => {
    const { call, pipelines, siteQueries } = setup([])
    // The caller asks for a site they do not administer; the permitted-site lookup decides.
    await call({ sites: [administeredSite, otherSite] })
    expect(siteQueries[0]._id.$in.map(String)).toEqual([administeredSite, otherSite])
    const match = pipelines[0][0].$match
    expect(match.parentOnModel).toBe('Site')
    expect(match.parent.$in.map(String)).toEqual([administeredSite])
    expect(match.action).toEqual({ $in: ['content-searched'] })
    expect(match.createdAt.$gte).toBeInstanceOf(Date)
    // The caller cannot widen the action filter to other activity types.
    await call({ actions: ['file-viewed', 'content-searched'] })
    expect(pipelines[1][0].$match.action).toEqual({ $in: ['content-searched'] })
  })

  it('merges terms that differ only by case or whitespace and summarises users, sources and misses', async () => {
    const { call } = setup([
      { _id: 'annual report', count: 3, users: ['u1', 'u2'], lastSearchedAt: new Date('2026-03-02T00:00:00Z'), zeroResultCount: 0, sources: ['ce-search', 'ce-search', 'ce-mcp'] },
      { _id: 'annual   report', count: 2, users: ['u2', 'u3'], lastSearchedAt: new Date('2026-03-03T00:00:00Z'), zeroResultCount: 1, sources: ['ce-chat', 'ce-search'] },
      { _id: 'unicorns', count: 1, users: ['u1'], lastSearchedAt: new Date('2026-03-01T00:00:00Z'), zeroResultCount: 1, sources: ['ce-search'] },
    ])
    const payload = await call({ limit: 10 })
    expect(payload.rows).toEqual([
      {
        term: 'annual report',
        name: 'annual report',
        count: 5,
        userCount: 3,
        zeroResultCount: 1,
        lastSearchedAt: new Date('2026-03-03T00:00:00Z'),
        sources: { 'ce-search': 3, 'ce-mcp': 1, 'ce-chat': 1 },
      },
      {
        term: 'unicorns',
        name: 'unicorns',
        count: 1,
        userCount: 1,
        zeroResultCount: 1,
        lastSearchedAt: new Date('2026-03-01T00:00:00Z'),
        sources: { 'ce-search': 1 },
      },
    ])
  })

  it('returns nothing when the caller administers no sites', async () => {
    const pipelines: any[] = []
    const models = {
      SiteModel: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
      ActivityModel: { aggregate: async (pipeline: any[]) => { pipelines.push(pipeline); return [] } },
    }
    const controller = new AnalyticsController({ auth: {}, models: models as any, providers: {} })
    let payload: any
    await controller.postSearchTerms({ sub: adminUserId, accountId, body: {}, query: {}, params: {} } as any, { json: (value: any) => { payload = value } } as any)
    expect(payload).toEqual({ rows: [] })
    expect(pipelines).toEqual([])
  })
})
