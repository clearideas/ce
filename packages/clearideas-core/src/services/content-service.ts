import { BadRequestError, NotFoundError } from '../errors/index.js'
import type { CoreProviders } from '../providers/index.js'
import {
  coreContentStatus,
  coreExtractionStatus,
  coreRole,
  coreSiteRoles,
  coreSiteVisibility,
  type CoreExtractionStatus,
} from './config.js'
import { toProjectedFile, withProjectedContent } from './content-projection.js'
import {
  filterSitesByVisibility,
  getSitesForUserBase,
  resolveCurrentUserRole,
} from './site-query.js'
import { matchesMetadataSearch, parseMetadataSearchQuery } from './search-query.js'

export type CoreContentModels = {
  UserModel: any
  AccountModel: any
  SiteModel: any
  ContentModel: any
}

export function createCoreContentService(
  models: CoreContentModels,
  providers: Pick<CoreProviders, 'storage'>,
) {
  return {
    async hydrateSitesWithContent(sites: any[]) {
      if (sites.length === 0) return []
      const siteIds = sites.map(site => site._id)
      const contents = await models.ContentModel.find({
        site: { $in: siteIds },
        status: coreContentStatus.active,
      }).lean()
      const bySite = new Map<string, any[]>()
      for (const content of contents) {
        const key = String(content.site)
        bySite.set(key, [...(bySite.get(key) ?? []), content])
      }
      return sites.map(site => withProjectedContent(site, bySite.get(String(site._id)) ?? []))
    },

    async hydrateSiteWithContent(site: any) {
      const [hydrated] = await this.hydrateSitesWithContent([site])
      return hydrated ?? site
    },

    async createFolder(input: { siteId: string; name: string; parentId?: string }) {
      const site = await models.SiteModel.findById(input.siteId).lean()
      if (!site) throw new NotFoundError('Site not found')
      let parent = site._id
      let parentType = 'Site'
      if (input.parentId) {
        const parentFolder = await models.ContentModel.findOne({
          _id: input.parentId,
          site: site._id,
          kind: 'Folder',
          status: coreContentStatus.active,
        }).lean()
        if (!parentFolder) throw new NotFoundError('Parent folder not found')
        parent = parentFolder._id
        parentType = 'Content'
      }
      return models.ContentModel.create({
        name: input.name,
        owner: site.owner,
        site: site._id,
        parent,
        parentType,
        kind: 'Folder',
        status: coreContentStatus.active,
        visibility: coreSiteVisibility.public,
        attributes: {},
      })
    },

    async deleteContent(input: { siteId: string; contentId: string }) {
      const site = await models.SiteModel.findById(input.siteId).lean()
      if (!site) throw new NotFoundError('Site not found')
      const content = await models.ContentModel.findOne({
        _id: input.contentId,
        site: site._id,
      }).lean()
      if (!content) throw new NotFoundError('Content not found')
      const descendantIds =
        content.kind === 'Folder'
          ? await collectDescendantContentIds(models.ContentModel, input.contentId)
          : []
      const ids = [input.contentId, ...descendantIds]
      const files = await models.ContentModel.find({ _id: { $in: ids }, kind: 'File' })
        .select('key')
        .lean()
      const keysToDelete = files.map((file: any) => String(file.key ?? '')).filter(Boolean)
      await models.ContentModel.deleteMany({ _id: { $in: ids }, site: site._id })
      if (keysToDelete.length > 0) await providers.storage.deleteObjects({ keys: keysToDelete })
      return { deletedIds: ids, deletedKeys: keysToDelete }
    },

    async updateContent(input: { siteId: string; contentId: string; name?: string }) {
      const nextName = input.name?.trim()
      if (!nextName) throw new BadRequestError('Name is required')
      const content = await models.ContentModel.findOneAndUpdate(
        { _id: input.contentId, site: input.siteId },
        { $set: { name: nextName, updatedAt: new Date() } },
        { returnDocument: 'after' },
      )
      if (!content) throw new NotFoundError('Content not found')
      return content
    },

    async createUploadTarget(input: { fileName: string; contentType?: string }) {
      return providers.storage.createUploadTarget(input)
    },

    async createPendingFileUploadTarget(input: {
      siteId: string
      folderId?: string
      fileName: string
      contentType: string
      userId: string
    }) {
      const site = await models.SiteModel.findById(input.siteId)
      if (!site) throw new NotFoundError('Site not found')
      let parent = site._id
      let parentType = 'Site'
      let parentFolder: any = null
      if (input.folderId) {
        const folder = await models.ContentModel.findOne({
          _id: input.folderId,
          site: site._id,
          kind: 'Folder',
          status: coreContentStatus.active,
        }).lean()
        if (!folder) throw new NotFoundError('Folder not found')
        parentFolder = folder
        parent = folder._id
        parentType = 'Content'
      }
      const target = await providers.storage.createUploadTarget({
        fileName: input.fileName,
        contentType: input.contentType,
      })
      const file = await models.ContentModel.create({
        name: input.fileName,
        owner: site.owner,
        site: site._id,
        parent,
        parentType,
        kind: 'File',
        status: coreContentStatus.uploadPending,
        visibility: coreSiteVisibility.public,
        key: target.fileKey,
        size: 0,
        contentType: input.contentType,
        extension: extensionFromName(input.fileName),
        uploadedBy: input.userId,
        extractionStatus:
          input.contentType === 'application/pdf'
            ? coreExtractionStatus.pending
            : coreExtractionStatus.unsupported,
        attributes: {},
      })
      return {
        ...target,
        file: toProjectedFile(file.toObject ? file.toObject() : file, site, parentFolder),
        fileId: String(file._id),
      }
    },

    async uploadFile(input: {
      fileId?: string
      fileKey: string
      siteId: string
      folderId?: string
      name: string
      contentType: string
      body: Buffer
      userId: string
    }) {
      if (!Buffer.isBuffer(input.body)) throw new BadRequestError('Invalid upload body')
      const body = input.body
      const bodySize = Buffer.byteLength(body)
      const site = await models.SiteModel.findById(input.siteId)
      if (!site) throw new NotFoundError('Site not found')
      let parent = site._id
      let parentType = 'Site'
      if (input.folderId) {
        const folder = await models.ContentModel.findOne({
          _id: input.folderId,
          site: site._id,
          kind: 'Folder',
          status: coreContentStatus.active,
        }).lean()
        if (!folder) throw new NotFoundError('Folder not found')
        parent = folder._id
        parentType = 'Content'
      }
      await providers.storage.writeObject({
        key: input.fileKey,
        body,
        contentType: input.contentType,
      })
      if (input.fileId) {
        const file = await models.ContentModel.findOneAndUpdate(
          {
            _id: input.fileId,
            site: site._id,
            kind: 'File',
            key: input.fileKey,
          },
          {
            $set: {
              name: input.name,
              status: coreContentStatus.active,
              size: bodySize,
              contentType: input.contentType,
              extension: extensionFromName(input.name),
              uploadedBy: input.userId,
              uploadedAt: new Date(),
              updatedAt: new Date(),
              extractionStatus:
                input.contentType === 'application/pdf'
                  ? coreExtractionStatus.pending
                  : coreExtractionStatus.unsupported,
            },
          },
          { returnDocument: 'after' },
        )
        if (!file) throw new NotFoundError('File not found')
        return file
      }
      return models.ContentModel.create({
        name: input.name,
        owner: site.owner,
        site: site._id,
        parent,
        parentType,
        kind: 'File',
        status: coreContentStatus.active,
        visibility: coreSiteVisibility.public,
        key: input.fileKey,
        size: bodySize,
        contentType: input.contentType,
        extension: extensionFromName(input.name),
        uploadedBy: input.userId,
        uploadedAt: new Date(),
        extractionStatus:
          input.contentType === 'application/pdf'
            ? coreExtractionStatus.pending
            : coreExtractionStatus.unsupported,
        attributes: {},
      })
    },

    async downloadFile(fileKey: string) {
      try {
        return await providers.storage.readObject({ key: fileKey })
      } catch {
        throw new NotFoundError('File not found')
      }
    },

    async getFile(input: { siteId: string; fileId: string }) {
      const file = await models.ContentModel.findOne({
        _id: input.fileId,
        site: input.siteId,
        kind: 'File',
      }).lean()
      if (!file) throw new NotFoundError('File not found')
      return hydrateContentFile(models, file)
    },

    async getFileByKey(fileKey: string) {
      const file = await models.ContentModel.findOne({ key: fileKey, kind: 'File' }).lean()
      if (!file) throw new NotFoundError('File not found')
      return hydrateContentFile(models, file)
    },

    async updateFileExtraction(input: {
      fileKey: string
      extractedText?: string
      extractedTextKey?: string
      extractionStatus: CoreExtractionStatus
    }) {
      const updated = await models.ContentModel.findOneAndUpdate(
        { key: input.fileKey, kind: 'File' },
        { $set: buildFileExtractionSet(input) },
        { returnDocument: 'after' },
      ).lean()
      if (!updated) throw new NotFoundError('File not found')
      return hydrateContentFile(models, updated)
    },

    async searchFilesByName(input: {
      siteId: string
      name: string
      folderId?: string
      limit?: number
    }) {
      const site = await models.SiteModel.findById(input.siteId).lean()
      if (!site) throw new NotFoundError('Site not found')
      const search = parseMetadataSearchQuery(input.name)
      if (!search.plainText && search.filters.length === 0)
        throw new BadRequestError('Name is required')
      const limit = Math.max(1, Math.min(input.limit ?? 50, 200))

      const parentFilter = input.folderId ? { parent: input.folderId } : {}
      const files = await models.ContentModel.find({
        site: input.siteId,
        kind: 'File',
        status: coreContentStatus.active,
        ...parentFilter,
      })
        .limit(limit * 4)
        .lean()
      const hydrated = await Promise.all(files.map((file: any) => hydrateContentFile(models, file)))
      return hydrated
        .filter((file: any) =>
          matchesMetadataSearch({
            file,
            fileName: String(file.name ?? ''),
            site,
            folder: file.folderId ? { name: file.folderName } : null,
            search,
          }),
        )
        .slice(0, limit)
    },

    async searchFilesByNameAcrossSites(input: { userId: string; name: string; limit?: number }) {
      const search = parseMetadataSearchQuery(input.name)
      if (!search.plainText && search.filters.length === 0)
        throw new BadRequestError('Name is required')

      const [account, user] = await Promise.all([
        models.AccountModel.findOne({ owner: input.userId }).lean(),
        models.UserModel.findById(input.userId).select('attributes.sites.suppressedSites').lean(),
      ])
      if (!account) throw new NotFoundError('Account not found')

      const suppressedSiteIds = (user as any)?.attributes?.sites?.suppressedSites ?? []
      const sites = await getSitesForUserBase(
        {
          findSites: query => models.SiteModel.find(query).lean(),
        },
        {
          userId: input.userId,
          accountId: String(account._id),
          accepted: true,
          suppressedSiteIds,
        },
      )
      const visibleSites = filterSitesByVisibility(
        sites.map((site: any) => ({
          ...site,
          currentUserRole: resolveCurrentUserRole(
            site,
            String(account._id),
            input.userId,
            coreRole.owner,
          ),
        })),
        coreSiteVisibility.public,
        [...coreSiteRoles.adminRoles],
      )

      const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
      const siteIds = visibleSites.map((site: any) => site._id)
      const sitesById = new Map(visibleSites.map((site: any) => [String(site._id), site]))
      const files = await models.ContentModel.find({
        site: { $in: siteIds },
        kind: 'File',
        status: coreContentStatus.active,
      })
        .limit(limit * 4)
        .lean()
      const hydrated = await Promise.all(files.map((file: any) => hydrateContentFile(models, file)))
      return hydrated
        .filter((file: any) => {
          const site = sitesById.get(String(file.site))
          return (
            site &&
            matchesMetadataSearch({
              file,
              fileName: String(file.name ?? ''),
              site,
              folder: file.folderId ? { name: file.folderName } : null,
              search,
            })
          )
        })
        .slice(0, limit)
    },
  }
}

export async function collectDescendantContentIds(
  ContentModel: any,
  contentId: string,
): Promise<string[]> {
  const children = await ContentModel.find({ parent: contentId, parentType: 'Content' })
    .select('_id kind')
    .lean()
  const nested = await Promise.all(
    children.map((child: any) => collectDescendantContentIds(ContentModel, String(child._id))),
  )
  return children.map((child: any) => String(child._id)).concat(nested.flat())
}

async function hydrateContentFile(
  models: Pick<CoreContentModels, 'SiteModel' | 'ContentModel'>,
  file: any,
) {
  const [site, folder] = await Promise.all([
    models.SiteModel.findById(file.site).select('_id name').lean(),
    file.parentType === 'Content'
      ? models.ContentModel.findById(file.parent).select('_id name').lean()
      : null,
  ])
  if (!site) throw new NotFoundError('Site not found')
  return toProjectedFile(file, site, folder)
}

function extensionFromName(name: string) {
  const part = String(name ?? '')
    .split('.')
    .pop()
  return part && part !== name ? part.toLowerCase() : ''
}

function buildFileExtractionSet(input: {
  extractedText?: string
  extractedTextKey?: string
  extractionStatus: CoreExtractionStatus
}) {
  const set: Record<string, unknown> = {
    extractionStatus: input.extractionStatus,
    extractedTextUpdatedAt: new Date(),
  }
  if (input.extractedText !== undefined) set.extractedText = input.extractedText
  if (input.extractedTextKey !== undefined) set.extractedTextKey = input.extractedTextKey
  return set
}
