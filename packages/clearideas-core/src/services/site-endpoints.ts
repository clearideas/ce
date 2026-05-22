import { NotFoundError } from '../errors/index.js'
import type { AcceptedFilter } from './site-query.js'
import { filterSitesByVisibility } from './site-query.js'

export interface GetSitesInput<TSite> {
  acceptedFilter: AcceptedFilter
  publicVisibility: string
  adminRoles: readonly string[]
  loadSites: (input: { acceptedFilter: AcceptedFilter }) => Promise<TSite[]>
  visibilityFilter?: (sites: TSite[]) => TSite[]
}

export async function getSitesResponse<TSite>(input: GetSitesInput<TSite>): Promise<TSite[]> {
  const loadedSites = await input.loadSites({ acceptedFilter: input.acceptedFilter })

  const visibilityFiltered =
    input.visibilityFilter ??
    ((sites: TSite[]) =>
      filterSitesByVisibility(
        sites as Array<{ visibility?: string; currentUserRole?: string }>,
        input.publicVisibility,
        input.adminRoles,
      ) as TSite[])

  return visibilityFiltered(loadedSites)
}

export async function getSiteResponse<TSite, TPublic>(input: {
  site: TSite | null | undefined
  toPublic: (site: TSite) => Promise<TPublic>
}): Promise<TPublic> {
  if (input.site == null) {
    throw new NotFoundError('Site not found')
  }
  return input.toPublic(input.site)
}
