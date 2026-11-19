/**
 * The content operations behind the AI tools (agents' Site tools and chat).
 *
 * One implementation for every AI surface, so reading a file means the same thing — and is checked
 * the same way — whether an agent or a chat asks. Every operation checks, at call time, that the
 * user can still read the site involved (`assertSiteReadAccess`); callers additionally restrict the
 * sites an operation may touch (`allowedSiteIds`), e.g. chat only reaches sites with AI chat on.
 */
import {
  createActivityLogger,
  createCoreDomainServices,
  isContentTextAvailable,
  isPdfContent,
  isTextBasedContent,
} from '@clearideas/core'
import { BadRequestError, ForbiddenError } from '@clearideas/core/errors'
import type { CeAppContext } from '../lib/app-context.js'
import { assertSiteReadAccess } from '../middleware/access-control.js'
import { config } from '../config/index.js'
import { searchContent } from './content-search.js'
import { extractPdfTextForFile, shouldAttemptPdfExtraction } from './pdf-text-extraction.js'
import { logSearchActivity, type SearchActivitySource } from './search-activity.js'

export interface ContentToolAccess {
  accountId: string
  userId: string
}

/** A file or folder as the AI tools describe it (no storage keys). */
export interface ContentToolItem {
  id: string
  contentId: string
  name: string
  kind: 'file' | 'folder'
  siteId: string
  siteName: string
  parentId: string
  folderId: string
  folderName: string
  size: number | null
  contentType: string | null
  extractionStatus: string | null
  textAvailable: boolean
  updatedAt: unknown
  snippet?: string
}

export class ContentToolOperations {
  private readonly domain
  private readonly activity

  constructor(
    private readonly ctx: CeAppContext,
    private readonly access: ContentToolAccess,
  ) {
    this.domain = createCoreDomainServices(ctx.models as any, ctx.providers)
    this.activity = createActivityLogger(activity => this.ctx.models.ActivityModel.create(activity))
  }

  /** The site, if the user may read it and it is one of `allowedSiteIds`. */
  async readableSite(siteId: string, allowedSiteIds?: ReadonlySet<string>) {
    if (allowedSiteIds && !allowedSiteIds.has(String(siteId))) throw new ForbiddenError('Site access denied')
    return assertSiteReadAccess({ models: this.ctx.models, ...this.access, siteId: String(siteId) })
  }

  async listContent(siteId: string, folderId?: string, limit = 100, allowedSiteIds?: ReadonlySet<string>) {
    const site = await this.readableSite(siteId, allowedSiteIds)
    const parent = folderId ? String(folderId) : String(siteId)
    const [rows, folder] = await Promise.all([
      this.ctx.models.ContentModel.find({ site: siteId, parent, status: config.content.status.active })
        .sort({ rank: 1, name: 1 })
        .limit(Math.max(1, Math.min(Number(limit) || 100, 200)))
        .lean(),
      folderId ? this.ctx.models.ContentModel.findById(folderId).select('_id name').lean() : null,
    ])
    return {
      site: siteInfo(site),
      contents: rows.map((row: any) => formatContent(row, site, folder)),
    }
  }

  async siteMetadata(siteId: string, allowedSiteIds?: ReadonlySet<string>) {
    const site = await this.readableSite(siteId, allowedSiteIds)
    const [numberOfFolders, fileStats] = await Promise.all([
      this.ctx.models.ContentModel.countDocuments({
        site: site._id,
        kind: 'Folder',
        status: config.content.status.active,
      }),
      this.ctx.models.ContentModel.aggregate([
        { $match: { site: site._id, kind: 'File', status: config.content.status.active } },
        { $group: { _id: null, count: { $sum: 1 }, size: { $sum: { $ifNull: ['$size', 0] } } } },
      ]),
    ])
    return {
      site: {
        ...siteInfo(site),
        visibility: site.visibility ?? config.site.visibility.private,
        numberOfFolders,
        numberOfFiles: fileStats[0]?.count ?? 0,
        totalActiveSize: fileStats[0]?.size ?? 0,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
      },
    }
  }

  async contentMetadata(contentId: string, allowedSiteIds?: ReadonlySet<string>) {
    const content = await this.ctx.models.ContentModel.findOne({
      _id: String(contentId),
      status: config.content.status.active,
    }).lean()
    if (!content) throw new BadRequestError('Content not found')
    const site = await this.readableSite(String(content.site), allowedSiteIds).catch(() => {
      throw new BadRequestError('Content not found')
    })
    const folder =
      String(content.parentType) === 'Content'
        ? await this.ctx.models.ContentModel.findById(content.parent).select('_id name').lean()
        : null
    return { site: siteInfo(site), content: formatContent(content, site, folder) }
  }

  async search(input: {
    query: string
    siteIds: string[]
    source: SearchActivitySource
    /** Searched one site (attributed to it even without matches) or several. */
    scope: 'site' | 'all'
  }) {
    const siteIds = input.siteIds.map(String)
    for (const siteId of siteIds) await this.readableSite(siteId)
    const { results, matchedBySite } = await searchContent({
      models: this.ctx.models,
      domain: this.domain,
      search: this.ctx.search,
      q: input.query,
      siteIds,
      userId: this.access.userId,
      limit: 50,
    })
    await logSearchActivity({
      activity: this.activity,
      user: this.access.userId,
      q: input.query,
      scope: input.scope,
      source: input.source,
      ...(input.scope === 'site' ? { siteId: siteIds[0] } : {}),
      matchedBySite,
    })
    return results.map((result): ContentToolItem => ({
      id: result.id,
      contentId: result.id,
      name: result.name,
      kind: 'file',
      siteId: result.siteId,
      siteName: result.siteName,
      parentId: result.folderId || result.siteId,
      folderId: result.folderId,
      folderName: result.folderName,
      size: result.size ?? null,
      contentType: result.contentType ?? null,
      extractionStatus: result.extractionStatus,
      textAvailable: result.textAvailable,
      updatedAt: result.updatedAt ?? null,
      snippet: result.snippet,
    }))
  }

  async retrieveFile(contentId: string, maxTokens = 8000, allowedSiteIds?: ReadonlySet<string>) {
    let file = await this.sourceFile(String(contentId), allowedSiteIds)
    const isText = isTextBasedContent(file.contentType, file.name)
    let hasExtractedText = hasPdfText(file)
    if (
      !isText &&
      isPdfContent(file.contentType, file.name) &&
      !hasExtractedText &&
      shouldAttemptPdfExtraction(file)
    ) {
      const extracted = await extractPdfTextForFile({
        models: this.ctx.models as any,
        storage: this.ctx.providers.storage,
        search: this.ctx.search,
        fileKey: String(file.key ?? ''),
        contentType: file.contentType,
      })
      if (extracted) file = await this.sourceFile(String(contentId), allowedSiteIds)
      hasExtractedText = hasPdfText(file)
    }
    if (!isText && isPdfContent(file.contentType, file.name) && !hasExtractedText) {
      throw new BadRequestError('No extractable text was found in this PDF.')
    }
    if (!isText && !hasExtractedText) throw new BadRequestError('Only text-based files can be retrieved')
    const text = await this.fileText(file, isText)
    const maxChars = Math.max(1, Math.min(Number(maxTokens) || 8000, 32_000)) * 4
    return {
      content: text.slice(0, maxChars),
      contentInfo: formatContent(file, file.siteDoc, file.folderDoc),
      truncated: text.length > maxChars,
    }
  }

  private async fileText(file: any, isTextBased: boolean) {
    if (!isTextBased && file.extractedTextKey) {
      return (await this.domain.downloadFile(String(file.extractedTextKey))).toString('utf8')
    }
    if (!isTextBased && typeof file.extractedText === 'string') return file.extractedText
    return (await this.domain.downloadFile(String(file.key))).toString('utf8')
  }

  private async sourceFile(fileId: string, allowedSiteIds?: ReadonlySet<string>) {
    const file = await this.ctx.models.ContentModel.findOne({
      _id: fileId,
      kind: 'File',
      status: config.content.status.active,
    })
      .select('+extractedText')
      .lean()
    if (!file) throw new BadRequestError('Content not found')
    const siteDoc = await this.readableSite(String(file.site), allowedSiteIds).catch(() => {
      throw new BadRequestError('Content not found')
    })
    const folderDoc =
      String(file.parentType) === 'Content'
        ? await this.ctx.models.ContentModel.findById(file.parent).select('_id name').lean()
        : null
    return { ...file, siteDoc, folderDoc }
  }
}

function siteInfo(site: any) {
  return { id: String(site._id), name: String(site.name ?? '') }
}

export function formatContent(content: any, site: any, folder: any): ContentToolItem {
  const kind = String(content.kind ?? '').toLowerCase() === 'folder' ? 'folder' : 'file'
  return {
    id: String(content._id),
    contentId: String(content._id),
    name: String(content.name ?? ''),
    kind,
    siteId: String(site?._id ?? content.site ?? ''),
    siteName: String(site?.name ?? ''),
    parentId: String(content.parent ?? ''),
    folderId: folder ? String(folder._id) : '',
    folderName: folder ? String(folder.name ?? '') : '',
    size: content.size ?? null,
    contentType: content.contentType ?? null,
    extractionStatus: content.extractionStatus ?? null,
    textAvailable: kind === 'file' ? isContentTextAvailable(content) : false,
    updatedAt: content.updatedAt ?? content.uploadedAt ?? null,
  }
}

function hasPdfText(file: any) {
  return (
    isPdfContent(file.contentType, file.name) &&
    (file.extractionStatus === config.content.extractionStatus.complete ||
      file.extractionStatus === config.content.extractionStatus.limited) &&
    Boolean(file.extractedTextKey || file.extractedText)
  )
}
