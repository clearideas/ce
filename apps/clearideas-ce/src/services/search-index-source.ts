import { config } from '../config/index.js'
import type { SearchIndexFile, SearchIndexSource } from './search-index.js'

type IndexModelSet = {
  SiteModel: any
  ContentModel: any
}

/**
 * Maps content records (the source of truth) to search index documents.
 * Text is not loaded here; the index manager reads it (bounded) from storage.
 */
export function createMongoSearchIndexSource(models: IndexModelSet): SearchIndexSource {
  return {
    async listSiteFiles(input) {
      const site = await models.SiteModel.findById(input.siteId).select('_id name attributes.tags').lean()
      if (!site) return []
      const query: Record<string, unknown> = {
        site: site._id,
        kind: 'File',
        status: config.content.status.active,
      }
      if (input.folderId) query.parent = input.folderId
      if (input.updatedAfter) query.updatedAt = { $gte: input.updatedAfter }
      const files = await models.ContentModel.find(query).sort({ updatedAt: 1, _id: 1 }).lean()
      const folders = await loadFolders(models, files)
      return files.map((file: any) => toSearchIndexFile(file, site, folders.get(String(file.parent))))
    },

    async getSiteFile(input) {
      const file = await models.ContentModel.findOne({
        _id: input.contentId,
        site: input.siteId,
        kind: 'File',
        status: config.content.status.active,
      }).lean()
      if (!file) return null
      const site = await models.SiteModel.findById(file.site).select('_id name attributes.tags').lean()
      if (!site) return null
      const folders = await loadFolders(models, [file])
      return toSearchIndexFile(file, site, folders.get(String(file.parent)))
    },
  }
}

async function loadFolders(models: IndexModelSet, files: any[]) {
  const folderIds = [
    ...new Set(
      files
        .filter(file => String(file.parentType) === 'Content')
        .map(file => String(file.parent))
        .filter(Boolean),
    ),
  ]
  const folders = folderIds.length
    ? await models.ContentModel.find({ _id: { $in: folderIds }, kind: 'Folder' }).select('_id name').lean()
    : []
  return new Map<string, any>(folders.map((folder: any) => [String(folder._id), folder]))
}

export function toSearchIndexFile(file: any, site: any, folder: any | undefined): SearchIndexFile {
  const metadata = file?.attributes?.metadata
  return {
    id: String(file._id ?? file.id),
    siteId: String(site._id ?? file.site),
    siteName: String(site.name ?? ''),
    siteTags: Array.isArray(site?.attributes?.tags) ? site.attributes.tags.map(String) : [],
    folderId: folder ? String(folder._id) : '',
    folderName: folder ? String(folder.name ?? '') : '',
    name: String(file.name ?? ''),
    key: String(file.key ?? ''),
    contentType: file.contentType,
    size: file.size,
    uploadedAt: file.uploadedAt,
    createdAt: file.createdAt ?? file.uploadedAt,
    updatedAt: file.updatedAt ?? file.uploadedAt,
    tags: Array.isArray(file.tags) ? file.tags.map(String) : [],
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    extractedTextKey: file.extractedTextKey,
    extractionStatus: file.extractionStatus,
  }
}
