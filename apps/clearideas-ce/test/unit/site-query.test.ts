import { describe, expect, it } from 'vitest'
import {
  buildPermittedSitesQuery,
  filterSitesByVisibility,
  getPermittedSiteIdsBase,
  getSitesForUserBase,
  parseAcceptedFilter,
  resolveCurrentUserRole,
} from '@clearideas/core/services/site-query'

describe('core site query helpers', () => {
  it('parses accepted filters using the enterprise-compatible values', () => {
    expect(parseAcceptedFilter('all')).toBe('all')
    expect(parseAcceptedFilter('false')).toBe(false)
    expect(parseAcceptedFilter('pending')).toBe('pending')
    expect(parseAcceptedFilter(undefined)).toBe(true)
  })

  it('resolves owner/member roles without enterprise flags', () => {
    const site = { owner: 'account-1', members: [{ userId: 'user-2', role: 'editor' }] }
    expect(resolveCurrentUserRole(site, 'account-1', 'user-1', 'owner')).toBe('owner')
    expect(resolveCurrentUserRole(site, 'account-2', 'user-2', 'owner')).toBe('editor')
    expect(resolveCurrentUserRole(site, 'account-2', 'missing', 'owner')).toBe('')
    expect(resolveCurrentUserRole(site, 'account-2', 'missing', 'owner', 'viewer')).toBe('viewer')
  })

  it('filters public sites and admin/member visibility consistently', () => {
    const sites = [
      { name: 'Private owner', visibility: 'private', currentUserRole: 'owner' },
      { name: 'Private viewer', visibility: 'private', currentUserRole: 'viewer' },
      { name: 'Public viewer', visibility: 'public', currentUserRole: 'viewer' },
    ]
    expect(filterSitesByVisibility(sites, 'public', ['owner', 'admin']).map(site => site.name)).toEqual([
      'Private owner',
      'Public viewer',
    ])
  })

  it('builds user site queries and lets apps extend them without core knowing enterprise fields', async () => {
    const seen: Record<string, unknown>[] = []
    const rows = [
      { _id: 'site-1', name: 'Visible' },
      { _id: 'suppressed', name: 'Suppressed' },
    ]
    const result = await getSitesForUserBase(
      {
        findSites: async query => {
          seen.push(query)
          return rows
        },
      },
      { userId: 'user-1', accountId: 'account-1', accepted: true, suppressedSiteIds: ['suppressed'] },
      { extendQuery: query => ({ ...query, status: 'active' }) },
    )

    expect(seen[0]).toMatchObject({
      $or: [{ owner: 'account-1' }, { 'members.user': 'user-1' }],
      status: 'active',
    })
    expect(result).toEqual([{ _id: 'site-1', name: 'Visible' }])
  })

  it('builds permitted site queries for MCP/search/analytics scoping', async () => {
    expect(buildPermittedSitesQuery({ accountId: 'account-1', userId: 'user-1', roles: ['owner', 'viewer'], siteIds: ['site-1'] })).toMatchObject({
      _id: { $in: ['site-1'] },
    })

    const ids = await getPermittedSiteIdsBase(
      { findSiteIds: async query => ((query.$or as unknown[]).length > 0 ? ['site-1'] : []) },
      { accountId: 'account-1', userId: 'user-1', roles: ['viewer'] },
    )
    expect(ids).toEqual(['site-1'])
  })
})
