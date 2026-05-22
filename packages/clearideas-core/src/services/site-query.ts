import { coreAcceptedFilter, coreSiteRoles, type CoreAcceptedFilterValue } from './config.js'

export type AcceptedFilter = CoreAcceptedFilterValue | boolean

export function parseAcceptedFilter(accepted: unknown): AcceptedFilter {
  if (accepted === coreAcceptedFilter.all) return coreAcceptedFilter.all
  if (accepted === 'false') return false
  if (accepted === coreAcceptedFilter.pending) return coreAcceptedFilter.pending
  return true
}

export function filterSitesByVisibility<T extends { visibility?: string; currentUserRole?: string }>(
  sites: T[],
  publicVisibility: string,
  adminRoles: readonly string[],
): T[] {
  return sites.filter(
    site =>
      site.visibility === publicVisibility ||
      adminRoles.includes(String(site.currentUserRole ?? '')),
  )
}

export function resolveCurrentUserRole(
  site: { owner?: any; members?: Array<{ userId?: any; user?: any; role?: string }> },
  accountId: string,
  userId: string,
  ownerRole: string,
  defaultRole = '',
): string {
  const siteOwner = String((site as any)?.owner?._id ?? (site as any)?.owner ?? '')
  if (siteOwner && siteOwner === accountId) return ownerRole

  const memberRole = (site.members ?? []).find(member => {
    const memberUser = String((member as any)?.userId ?? (member as any)?.user ?? '')
    return memberUser === userId
  })?.role

  return memberRole ?? defaultRole
}

export interface SiteQueryInput {
  userId: string
  accountId?: string
  accepted?: AcceptedFilter
  suppressedSiteIds?: string[]
}

export interface PermittedSitesInput {
  accountId: string
  userId: string
  roles: readonly string[]
  ownerRoles?: readonly string[]
  accepted?: AcceptedFilter
  siteIds?: string[]
  suppressedSiteIds?: string[]
  activeStatus?: string
}

export interface PermittedSiteIdDependencies {
  findSiteIds: (query: Record<string, unknown>, context: PermittedSitesInput) => Promise<string[]>
}

export interface SiteQueryDependencies<TSite> {
  findSites: (query: Record<string, unknown>, context: SiteQueryInput) => Promise<TSite[]>
}

export interface SiteQueryOptions {
  extendQuery?: (
    query: Record<string, unknown>,
    context: SiteQueryInput,
  ) => Record<string, unknown> | void
}

export async function getSitesForUserBase<TSite>(
  deps: SiteQueryDependencies<TSite>,
  input: SiteQueryInput,
  options: SiteQueryOptions = {},
): Promise<TSite[]> {
  const accepted = input.accepted ?? true
  if (accepted === false) return []

  const suppressed = new Set((input.suppressedSiteIds ?? []).filter(Boolean))

  const query: Record<string, unknown> = input.accountId
    ? { $or: [{ owner: input.accountId }, { 'members.user': input.userId }] }
    : { 'members.user': input.userId }

  const extended = options.extendQuery?.(query, input)
  const finalQuery = extended ?? query
  const rows = await deps.findSites(finalQuery, input)

  if (suppressed.size === 0) return rows
  return rows.filter((row: any) => !suppressed.has(String(row?._id ?? '')))
}

export function buildPermittedSitesQuery(input: PermittedSitesInput): Record<string, unknown> {
  const ownerRoles = input.ownerRoles ?? coreSiteRoles.ownerRoles
  const ownerRoleSet = new Set(ownerRoles.map(role => String(role)))
  const memberRoles = input.roles.map(role => String(role)).filter(role => !ownerRoleSet.has(role))
  const or: Record<string, unknown>[] = []

  if (input.roles.some(role => ownerRoleSet.has(String(role)))) {
    or.push({ owner: input.accountId })
  }

  if (memberRoles.length > 0) {
    or.push({
      members: {
        $elemMatch: {
          user: input.userId,
          role: { $in: memberRoles },
        },
      },
    })
  }

  const query: Record<string, unknown> = {
    $or: or,
  }

  if (input.siteIds && input.siteIds.length > 0) query._id = { $in: input.siteIds }
  if (input.suppressedSiteIds && input.suppressedSiteIds.length > 0) {
    query._id = {
      ...((query._id as Record<string, unknown> | undefined) ?? {}),
      $nin: input.suppressedSiteIds,
    }
  }
  if (input.activeStatus) query.status = input.activeStatus

  return query
}

export async function getPermittedSiteIdsBase(
  deps: PermittedSiteIdDependencies,
  input: PermittedSitesInput,
): Promise<string[]> {
  if (input.roles.length === 0) return []
  const query = buildPermittedSitesQuery(input)
  const or = query.$or as unknown[]
  if (!Array.isArray(or) || or.length === 0) return []
  return deps.findSiteIds(query, input)
}
