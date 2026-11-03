/**
 * Activity logging for searches.
 *
 * Every search is recorded with `action: 'content-searched'`. The record's `parent` decides
 * which site administrators can see it in analytics:
 *
 * - Site- and folder-scoped searches are attributed to that site.
 * - Multi-site searches (global REST search, MCP) are attributed **only to the sites that had
 *   at least one match**, one record per matched site, each carrying that site's own result
 *   count. A search that matched nowhere is recorded without a site parent: it stays in the
 *   audit trail but is visible to no site administrator.
 *
 * This prevents an administrator of one site from learning what a shared user searched for in
 * other sites, while still giving every administrator the terms that hit their own content.
 */

export const SEARCH_ACTIVITY_ACTION = 'content-searched'

export type SearchActivityScope = 'site' | 'folder' | 'all'
export type SearchActivitySource = 'ce-search' | 'ce-mcp' | 'ce-chat' | 'ce-agent'

export interface SearchActivityLogger {
  safe(activity: {
    user?: unknown
    action: string
    target: unknown
    onModel: string
    parent?: unknown
    parentOnModel?: string
    attributes?: Record<string, unknown>
  }): Promise<unknown>
}

export interface LogSearchActivityInput {
  activity: SearchActivityLogger
  /** The user who searched. */
  user: unknown
  /** The query exactly as submitted (never truncated). */
  q: string
  scope: SearchActivityScope
  source: SearchActivitySource
  /** Sites that matched, with the number of matching files in each. */
  matchedBySite: Map<string, number>
  /** For scoped searches: the site that was searched (attributed even when nothing matched). */
  siteId?: string
  folderId?: string
  accessKeyId?: string
}

/** Upper bound on per-site records written for a single multi-site search. */
export const MAX_ATTRIBUTED_SITES_PER_SEARCH = 100

export async function logSearchActivity(input: LogSearchActivityInput): Promise<void> {
  const base: Record<string, unknown> = {
    q: input.q,
    scope: input.scope,
    source: input.source,
  }
  if (input.folderId) base.folderId = input.folderId
  if (input.accessKeyId) base.accessKeyId = input.accessKeyId

  if (input.siteId) {
    // Scoped search: always attributed to the searched site, including zero-result searches,
    // so administrators can see what people look for and do not find.
    await input.activity.safe({
      user: input.user,
      action: SEARCH_ACTIVITY_ACTION,
      target: input.siteId,
      onModel: 'Site',
      parent: input.siteId,
      parentOnModel: 'Site',
      attributes: { ...base, resultCount: input.matchedBySite.get(String(input.siteId)) ?? 0 },
    })
    return
  }

  const matched = [...input.matchedBySite.entries()].filter(([, count]) => count > 0).slice(0, MAX_ATTRIBUTED_SITES_PER_SEARCH)
  if (matched.length === 0) {
    // Nothing matched anywhere: keep an audit record for the user, attached to no site.
    await input.activity.safe({
      user: input.user,
      action: SEARCH_ACTIVITY_ACTION,
      target: input.user,
      onModel: 'User',
      attributes: { ...base, resultCount: 0, matchedSiteCount: 0 },
    })
    return
  }

  // One record per matched site, each reporting only that site's matches.
  await Promise.all(
    matched.map(([siteId, resultCount]) =>
      input.activity.safe({
        user: input.user,
        action: SEARCH_ACTIVITY_ACTION,
        target: siteId,
        onModel: 'Site',
        parent: siteId,
        parentOnModel: 'Site',
        attributes: { ...base, resultCount },
      }),
    ),
  )
}
