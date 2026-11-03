import type { AppModels } from '../lib/app-context.js'
import type { SiteSearchIndexManager } from './search-index.js'
import { hydrateSearchResultsFromSource, type HydratedSearchResult } from './search-result-hydration.js'

interface SearchDomain {
  searchFilesByName(input: { siteId: string; name: string; folderId?: string; limit?: number }): Promise<any[]>
  searchFilesByNameAcrossSites(input: { userId: string; name: string; limit?: number; siteIds?: string[] }): Promise<any[]>
}

export interface ContentSearchInput {
  models: AppModels
  domain: SearchDomain
  search?: SiteSearchIndexManager
  q: string
  /** Sites the caller is authorised to search. */
  siteIds: string[]
  /** Display names for multi-site searches (used when an index entry has none). */
  siteNames?: Map<string, string>
  /** Restrict a single-site search to the direct children of this folder. */
  folderId?: string
  /** Required for multi-site database searches. */
  userId?: string
  limit?: number
}

export interface ContentSearchOutcome {
  results: HydratedSearchResult[]
  /**
   * Sites that had at least one match, with the number of distinct matching files per site.
   * Determined before the merged result list is truncated, so a site is not omitted just
   * because higher-ranked hits elsewhere filled the page. Used to attribute the search to
   * the sites it hit (and only those) for analytics.
   */
  matchedBySite: Map<string, number>
}

/**
 * Shared search flow for the REST API, MCP, site chat, and agents.
 *
 * 1. Query the full-text index (relevance ranked) and the database (filename/metadata
 *    predicates) in parallel.
 * 2. Merge, index hits first, de-duplicated by id.
 * 3. Confirm every hit against the database and refresh display fields; stale index
 *    entries are removed in the background. Results are never re-scored here.
 * 4. Any file the database returned that the index does not know is scheduled for
 *    background indexing, so the index heals itself without ever rewriting on the
 *    read path.
 */
export async function searchContent(input: ContentSearchInput): Promise<ContentSearchOutcome> {
  const siteIds = [...new Set(input.siteIds.map(String))]
  const matchedIdsBySite = new Map<string, Set<string>>()
  if (siteIds.length === 0) return { results: [], matchedBySite: new Map() }
  const { search } = input
  const single = siteIds.length === 1
  const limit = input.limit

  const dbResultsPromise: Promise<any[]> = single
    ? input.domain.searchFilesByName({ siteId: siteIds[0], folderId: input.folderId, name: input.q, limit })
    : input.userId
      ? input.domain.searchFilesByNameAcrossSites({ userId: input.userId, name: input.q, siteIds, limit })
      : Promise.resolve([])
  const indexResultsPromise: Promise<any[]> = !search
    ? Promise.resolve([])
    : single
      ? search.searchSite({ siteId: siteIds[0], folderId: input.folderId, q: input.q, limit })
      : search
          .searchAcrossSitesDetailed({
            sites: siteIds.map(id => ({ id, name: input.siteNames?.get(id) ?? '' })),
            q: input.q,
            limit,
          })
          .then(detailed => {
            for (const [siteId, ids] of detailed.matchedBySite) noteMatches(matchedIdsBySite, siteId, ids)
            return detailed.hits
          })
  const [dbResults, indexResults] = await Promise.all([dbResultsPromise, indexResultsPromise])

  const merged = mergeSearchResults(indexResults, dbResults)
  for (const result of merged) {
    const siteId = String(result?.siteId ?? result?.site ?? '')
    const id = String(result?.id ?? result?._id ?? '')
    if (siteId && id) noteMatches(matchedIdsBySite, siteId, [id])
  }

  const files = await hydrateSearchResultsFromSource({
    models: input.models,
    results: merged,
    siteIds,
    search,
  })

  if (search) {
    for (const result of dbResults) {
      const siteId = String(result?.siteId ?? result?.site ?? '')
      const id = String(result?.id ?? result?._id ?? '')
      if (siteId && id && !search.hasDocument(siteId, id)) search.enqueueIndexContent(siteId, id)
    }
  }

  const matchedBySite = new Map<string, number>()
  for (const [siteId, ids] of matchedIdsBySite) if (ids.size > 0) matchedBySite.set(siteId, ids.size)
  return { results: limit ? files.slice(0, limit) : files, matchedBySite }
}

function noteMatches(target: Map<string, Set<string>>, siteId: string, ids: Iterable<string>) {
  const set = target.get(siteId) ?? new Set<string>()
  for (const id of ids) set.add(String(id))
  target.set(siteId, set)
}

export function mergeSearchResults(...groups: any[][]) {
  const byId = new Map<string, any>()
  for (const group of groups) {
    for (const result of group) {
      const id = String(result?.id ?? result?._id ?? '')
      if (!id || byId.has(id)) continue
      byId.set(id, result)
    }
  }
  return [...byId.values()]
}
