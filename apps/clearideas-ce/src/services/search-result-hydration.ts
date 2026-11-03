import { isContentTextAvailable } from '@clearideas/core'
import { config } from '../config/index.js'
import type { AppModels } from '../lib/app-context.js'

export interface HydratedSearchResult {
  id: string
  kind: 'file'
  name: string
  key: string
  size?: number
  contentType?: string
  folderId: string
  folderName: string
  siteId: string
  siteName: string
  updatedAt?: unknown
  extractionStatus: string | null
  extractedTextUpdatedAt: unknown
  textAvailable: boolean
  snippet: string
}

/**
 * Confirms search hits against the database and refreshes display fields.
 *
 * This step does NOT re-score results: relevance is decided by the search index
 * (and the database name search); hydration only guards against stale index
 * entries (deleted, inactive, or moved content) and makes sure names reflect the
 * current state. Stale entries are scheduled for removal in the background.
 */
export async function hydrateSearchResultsFromSource(input: {
  models: AppModels
  results: any[]
  /** Sites the caller is permitted to search; results outside this set are dropped. */
  siteIds?: string[]
  search?: { removeContent(siteId: string, contentIds: string[]): Promise<void> }
}): Promise<HydratedSearchResult[]> {
  if (!input.results.length) return []
  const allowedSiteIds = input.siteIds ? new Set(input.siteIds.map(String)) : null
  const contentIds = [...new Set(input.results.map(result => String(result?.id ?? '')).filter(Boolean))]
  if (contentIds.length === 0) return []

  const fileQuery: Record<string, unknown> = {
    _id: { $in: contentIds },
    kind: 'File',
    status: config.content.status.active,
  }
  if (allowedSiteIds) fileQuery.site = { $in: [...allowedSiteIds] }
  const files = await input.models.ContentModel.find(fileQuery).lean()
  const filesById = new Map<string, any>(files.map((file: any) => [String(file._id), file]))

  const siteIds = [...new Set(files.map((file: any) => String(file.site)).filter(Boolean))]
  const folderIds = [
    ...new Set(
      files
        .filter((file: any) => String(file.parentType) === 'Content')
        .map((file: any) => String(file.parent))
        .filter(Boolean),
    ),
  ]
  const [sites, folders] = await Promise.all([
    siteIds.length ? input.models.SiteModel.find({ _id: { $in: siteIds } }).select('_id name').lean() : [],
    folderIds.length
      ? input.models.ContentModel.find({ _id: { $in: folderIds }, kind: 'Folder' }).select('_id name').lean()
      : [],
  ])
  const sitesById = new Map<string, any>(sites.map((site: any) => [String(site._id), site]))
  const foldersById = new Map<string, any>(folders.map((folder: any) => [String(folder._id), folder]))

  const hydrated: HydratedSearchResult[] = []
  const staleBySite = new Map<string, string[]>()
  const seen = new Set<string>()

  for (const result of input.results) {
    const id = String(result?.id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)

    const file = filesById.get(id)
    const site = file ? sitesById.get(String(file.site ?? '')) : null
    const resultSiteId = result?.siteId ? String(result.siteId) : ''
    const siteMismatch = Boolean(file && resultSiteId && String(file.site) !== resultSiteId)

    if (!file || !site || siteMismatch) {
      // Only index-backed results carry a siteId we can clean up; database results never get here stale.
      if (resultSiteId && (!file || siteMismatch)) {
        const list = staleBySite.get(resultSiteId) ?? []
        list.push(id)
        staleBySite.set(resultSiteId, list)
      }
      continue
    }

    const folder = String(file.parentType) === 'Content' ? foldersById.get(String(file.parent ?? '')) : null
    hydrated.push(toHydratedResult(site, folder, file, result))
  }

  if (input.search && staleBySite.size > 0) {
    const search = input.search
    for (const [siteId, ids] of staleBySite) {
      void search.removeContent(siteId, ids).catch(() => undefined)
    }
  }

  return hydrated
}

function toHydratedResult(site: any, folder: any, file: any, result: any): HydratedSearchResult {
  const textAvailable = isContentTextAvailable(file)
  return {
    id: String(file._id),
    kind: 'file',
    name: String(file.name ?? ''),
    key: String(file.key ?? ''),
    size: file.size,
    contentType: file.contentType,
    folderId: folder ? String(folder._id) : '',
    folderName: folder ? String(folder.name ?? '') : '',
    siteId: String(site._id),
    siteName: String(site.name ?? ''),
    updatedAt: file.updatedAt ?? file.uploadedAt,
    extractionStatus: file.extractionStatus ?? null,
    extractedTextUpdatedAt: file.extractedTextUpdatedAt ?? null,
    textAvailable,
    snippet: textAvailable ? String(result?.snippet ?? '') : '',
  }
}
