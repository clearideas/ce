import { computed } from 'vue'
import { useProfileStore, useSiteStore } from '../stores'
import type { Site } from '../types/domain'

/** Alphabetical, case- and accent-insensitive; ties broken by id so the order is total. */
export function sortSitesByName(sites: readonly Site[]): Site[] {
  return [...sites].sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  )
}

/**
 * The sites visible for the active Sites tab (`all` / `favourites` / `owned`), shared by the list
 * and tile views so both always show the same set **in the same order** (tiles paginate with the
 * list's page size, so page N must hold the same sites in both views).
 */
export function useSiteFilters() {
  const siteStore = useSiteStore()
  const profileStore = useProfileStore()

  const filteredSites = computed<Site[]>(() => {
    const sites = siteStore.sitesWithAttributes
    if (siteStore.activeTab === 'favourites') {
      const favourites = profileStore.user?.attributes?.sites?.favourites ?? []
      return sortSitesByName(sites.filter(site => favourites.includes(site.id)))
    }
    if (siteStore.activeTab === 'owned') return sortSitesByName(sites.filter(site => site.owned === true))
    return sortSitesByName(sites)
  })

  return { filteredSites }
}
