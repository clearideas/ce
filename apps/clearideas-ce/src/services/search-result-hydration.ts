import {
  isContentTextAvailable,
  normalizeSearchText,
  parseMetadataSearchQuery,
  searchableMetadataValues,
  type ParsedMetadataSearch,
} from '@clearideas/core'
import type { AppModels } from '../lib/app-context.js'

export async function hydrateSearchResultsFromSource(input: {
  models: AppModels
  q: string
  results: any[]
  search?: { indexFile(file: any): Promise<void>; removeContent(siteId: string, contentIds: string[]): Promise<void> }
}) {
  if (!input.results.length) return []
  const parsed = parseMetadataSearchQuery(input.q)
  const contentIds = input.results.map(result => String(result.id ?? '')).filter(Boolean)
  const files = contentIds.length
    ? await input.models.ContentModel.find({ _id: { $in: contentIds }, kind: 'File' }).lean()
    : []
  const filesById = new Map<string, any>(files.map((file: any) => [String(file._id), file]))
  const siteIds = [...new Set(files.map((file: any) => String(file.site)).filter(Boolean))]
  const folderIds = [...new Set(files.filter((file: any) => file.parentType === 'Content').map((file: any) => String(file.parent)).filter(Boolean))]
  const [sites, folders] = await Promise.all([
    siteIds.length ? input.models.SiteModel.find({ _id: { $in: siteIds } }).lean() : [],
    folderIds.length ? input.models.ContentModel.find({ _id: { $in: folderIds }, kind: 'Folder' }).lean() : [],
  ])
  const sitesById = new Map<string, any>(sites.map((site: any) => [String(site._id), site]))
  const foldersById = new Map<string, any>(folders.map((folder: any) => [String(folder._id), folder]))
  const hydrated: any[] = []

  for (const result of input.results) {
    const file = filesById.get(String(result.id ?? ''))
    const site = file ? sitesById.get(String(file.site ?? '')) : null
    const folder = file?.parentType === 'Content' ? foldersById.get(String(file.parent ?? '')) : null
    if (!site || !file) {
      if (result.siteId && result.id) await input.search?.removeContent(String(result.siteId), [String(result.id)]).catch(() => undefined)
      continue
    }

    const sourceResult = toSearchResultFromSource(site, folder, file, result.snippet)
    const matchesSource = matchesSearchSource(sourceResult, parsed)
    if (!matchesSource) {
      await input.search?.indexFile(toIndexFile(site, folder, file)).catch(() => undefined)
      continue
    }

    hydrated.push(sourceResult)
  }

  return hydrated
}

function toSearchResultFromSource(site: any, folder: any, file: any, snippet?: string) {
  const textAvailable = isTextAvailable(file)
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
    snippet: textAvailable ? String(snippet ?? '') : '',
  }
}

function toIndexFile(site: any, folder: any, file: any) {
  return {
    id: String(file._id),
    siteId: String(site._id),
    siteName: String(site.name ?? ''),
    folderId: folder ? String(folder._id) : '',
    folderName: folder ? String(folder.name ?? '') : '',
    name: String(file.name ?? ''),
    key: String(file.key ?? ''),
    contentType: file.contentType,
    size: file.size,
    uploadedAt: file.uploadedAt,
    updatedAt: file.updatedAt ?? file.uploadedAt,
    extractedText: file.extractedText,
    extractedTextKey: file.extractedTextKey,
    extractionStatus: file.extractionStatus,
  }
}

function matchesSearchSource(result: any, parsed: ParsedMetadataSearch) {
  if (!parsed.plainText && parsed.filters.length === 0) return true
  const searchableText = [
    result.name,
    result.contentType,
    result.folderName,
    result.siteName,
    result.textAvailable ? result.snippet : '',
  ].map(value => String(value ?? '').toLowerCase()).join(' ')
  const normalizedSearchableText = normalizeSearchText(searchableText)
  const terms = normalizeSearchText(parsed.plainText)
    .split(/\s+/)
    .filter(term => term.length > 1)
  const plainMatches = !parsed.plainText ||
    searchableText.includes(parsed.plainText) ||
    terms.every(term => normalizedSearchableText.includes(term))
  if (!plainMatches) return false

  return parsed.filters.every(filter => {
    const values = searchableMetadataValues({ file: result, key: filter.key })
    return values.some(value => value.includes(filter.value))
  })
}

function isTextAvailable(file: any) {
  return isContentTextAvailable(file)
}
