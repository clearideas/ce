import { BadRequestError, ForbiddenError } from '@clearideas/core/errors'
import {
  createActivityLogger,
  createCoreMcpToolDefinitions,
  isPdfContent,
  isMcpEnabledSite,
  isTextBasedContent,
  getCoreMcpToolRequiredScope,
  normalizeMcpRequest,
  normalizeCoreMcpToolName,
  parseMcpStringArray,
  resolveSiteRole,
  serializeFile,
  serializeFolder,
  sliceTextContent,
  toMcpJsonRpcResponse,
} from '@clearideas/core'
import { createCoreDomainServices } from '@clearideas/core'
import { getPermittedSiteIdsBase } from '@clearideas/core/services/site-query'
import type { Request, Response } from 'express'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { queuePdfTextExtraction } from '../../services/pdf-text-extraction.js'
import { hydrateSearchResultsFromSource } from '../../services/search-result-hydration.js'

export class McpController {
  private readonly domain
  private readonly activity

  constructor(private readonly ctx: CeAppContext) {
    this.domain = createCoreDomainServices(ctx.models, ctx.providers)
    this.activity = createActivityLogger(activity => this.ctx.models.ActivityModel.create(activity))
  }

  status = async (_req: Request, res: Response) => {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not allowed - use POST',
          data: 'This endpoint only supports POST requests for JSON-RPC',
        },
        id: null,
      })
  }

  handle = async (req: Request, res: Response) => {
    const request = normalizeMcpRequest(req.body)
    if (request.method === 'initialize') {
      res.json(toMcpJsonRpcResponse(req.body, {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'clearideas-ce', version: '0.1.0' },
        capabilities: { tools: {} },
      }))
      return
    }
    if (request.method === 'notifications/initialized') {
      res.status(204).end()
      return
    }
    if (request.method === 'ping') {
      res.json(toMcpJsonRpcResponse(req.body, {}))
      return
    }
    if (request.method === 'prompts/list') {
      res.json(toMcpJsonRpcResponse(req.body, { prompts: [] }))
      return
    }
    if (request.method === 'resources/list') {
      res.json(toMcpJsonRpcResponse(req.body, { resources: [] }))
      return
    }
    if (request.method === 'roots/list') {
      res.json(toMcpJsonRpcResponse(req.body, { roots: [] }))
      return
    }
    if (request.method === 'tools/list') {
      res.json(toMcpJsonRpcResponse(req.body, { tools: toolsList }))
      return
    }
    const rawTool = request.tool
    const tool = normalizeCoreMcpToolName(rawTool)
    const args = request.args
    const requiredScope = getCoreMcpToolRequiredScope(tool)
    if (!requiredScope) throw new BadRequestError('Unsupported MCP tool')
    this.assertScope(req, requiredScope)

    if (tool === 'list_sites') {
      const actor = await this.getMcpActor(req)
      const siteIds = await this.getMcpEnabledSiteIds(req)
      const sites = siteIds.length > 0 ? await this.ctx.models.SiteModel.find({
        _id: { $in: siteIds },
      }).sort({ name: 1 }).lean() : []
      await this.activity.safe({
        user: actor.account.owner,
        action: 'mcp-list-sites',
        target: actor.account.owner,
        onModel: 'User',
        attributes: { accessKeyId: String(req.accessKey?._id ?? ''), resultCount: sites.length, source: 'ce-mcp' },
      })
      res.json(toMcpJsonRpcResponse(req.body, { sites: sites.map((x: any) => ({ id: String(x._id), name: x.name })) }))
      return
    }

    if (tool === 'list_content') {
      const siteId = String(args.siteId ?? '').trim()
      if (!siteId) throw new BadRequestError('siteId is required')
      const actor = await this.getMcpActor(req)
      const allowedSiteIds = await this.getMcpEnabledSiteIds(req, [siteId])
      if (!allowedSiteIds.some(id => String(id) === siteId)) throw new ForbiddenError('Site access denied')
      const site = await this.domain.getSite({ siteId, userId: String(actor.account.owner), ownerRole: config.site.role.owner })
      if (!site) throw new BadRequestError('Site not found')
      const folderId = args.folderId == null || args.folderId === '' ? '' : String(args.folderId)
      const limit = Math.max(1, Math.min(Number(args.limit ?? 100) || 100, 200))
      const contents = this.listSiteContent(site, folderId).slice(0, limit)
      await this.activity.safe({
        user: actor.account.owner,
        action: 'mcp-list-content',
        target: actor.account.owner,
        onModel: 'User',
        attributes: { accessKeyId: String(req.accessKey?._id ?? ''), siteId, folderId, resultCount: contents.length, source: 'ce-mcp' },
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        site: { id: String(site._id), name: site.name },
        contents,
      }))
      return
    }

    if (tool === 'get_site_metadata') {
      const siteId = String(args.siteId ?? '').trim()
      if (!siteId) throw new BadRequestError('siteId is required')
      const actor = await this.getMcpActor(req)
      const allowedSiteIds = await this.getMcpEnabledSiteIds(req, [siteId])
      if (!allowedSiteIds.includes(siteId)) throw new ForbiddenError('Site access denied')
      const site = await this.domain.getSite({ siteId, userId: String(actor.account.owner), ownerRole: config.site.role.owner })
      if (!site) throw new BadRequestError('Site not found')
      const allFiles = [
        ...(site.files ?? []),
        ...(site.folders ?? []).flatMap((folder: any) => folder.files ?? []),
      ]
      await this.logTool(req, actor.account.owner, 'mcp-get-site-metadata', {
        siteId,
        source: 'ce-mcp',
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        site: {
          id: String(site._id),
          name: site.name,
          visibility: site.visibility ?? config.site.visibility.private,
          currentUserRole: resolveSiteRole({
            site,
            accountId: String(actor.account._id),
            userId: String(actor.account.owner),
            roles: { ...config.site.roles, defaultRole: config.site.role.viewer },
          }),
          mcpEnabled: isMcpEnabledSite(site),
          numberOfFolders: (site.folders ?? []).length,
          numberOfFiles: allFiles.length,
          totalActiveSize: allFiles.reduce((total: number, file: any) => total + (Number(file.size) || 0), 0),
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
        },
      }))
      return
    }

    if (tool === 'get_content_metadata') {
      const contentId = String(args.contentId ?? args.id ?? '').trim()
      if (!contentId) throw new BadRequestError('contentId is required')
      const actor = await this.getMcpActor(req)
      const content = await this.findMcpContent(req, contentId)
      await this.logTool(req, actor.account.owner, 'mcp-get-content-metadata', {
        contentId,
        siteId: content.siteId,
        source: 'ce-mcp',
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        content: content.metadata,
        site: { id: content.siteId, name: content.siteName },
      }))
      return
    }

    if (tool === 'retrieve_file_content') {
      const contentId = String(args.contentId ?? args.id ?? '').trim()
      if (!contentId) throw new BadRequestError(rawTool === 'fetch' ? 'id is required' : 'contentId is required')
      const actor = await this.getMcpActor(req)
      const content = await this.findMcpContent(req, contentId)
      if (content.metadata.kind !== 'file') throw new BadRequestError('Only files can be retrieved')
      const isTextBased = isTextBasedContent(content.metadata.contentType, content.metadata.name)
      const hasExtractedText = isPdfContent(content.metadata.contentType, content.metadata.name) &&
        content.file.extractionStatus === config.content.extractionStatus.complete &&
        Boolean(content.file.extractedTextKey || content.file.extractedText)
      if (!isTextBased && !hasExtractedText) {
        throw new BadRequestError('Only text-based files can be retrieved in CE MCP')
      }
      const text = await this.readMcpFileText(content.file, isTextBased)
      const sliced = sliceTextContent(text, {
        maxTokens: Number(args.maxTokens ?? 8000) || 8000,
        lines: args.lines as any,
      })
      await this.logTool(req, actor.account.owner, 'mcp-retrieve-file-content', {
        contentId,
        siteId: content.siteId,
        fileName: content.metadata.name,
        source: 'ce-mcp',
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        content: sliced.text,
        contentInfo: content.metadata,
        truncated: sliced.truncated,
        lineStart: sliced.lineStart,
        lineEnd: sliced.lineEnd,
      }))
      return
    }

    if (tool === 'save_file') {
      const siteId = String(args.siteId ?? '').trim()
      const folderId = args.folderId == null || args.folderId === '' ? '' : String(args.folderId)
      const name = String(args.name ?? '').trim()
      const content = String(args.content ?? '')
      const contentType = String(args.contentType ?? 'text/plain; charset=utf-8')
      if (!siteId) throw new BadRequestError('siteId is required')
      if (!name) throw new BadRequestError('name is required')
      const actor = await this.getMcpActor(req)
      const allowedSiteIds = await this.getMcpEnabledSiteIds(req, [siteId], config.site.roles.uploaderRoles)
      if (!allowedSiteIds.includes(siteId)) throw new ForbiddenError('Site write access denied')
      const target = await this.domain.createUploadTarget({ fileName: name, contentType })
      await this.domain.uploadFile({
        fileKey: target.fileKey,
        siteId,
        folderId: folderId || undefined,
        name,
        contentType,
        body: Buffer.from(content, 'utf8'),
        userId: String(actor.account.owner),
      })
      queuePdfTextExtraction({
        models: this.ctx.models as any,
        storage: this.ctx.providers.storage,
        search: this.ctx.search,
        fileKey: target.fileKey,
        contentType,
      })
      const saved = await this.domain.getFileByKey(target.fileKey)
      if (!isPdfContent(saved.contentType, saved.name)) {
        await this.ctx.search?.indexFile({
          id: saved.id,
          siteId: String(saved.site),
          siteName: saved.siteName,
          folderId: saved.folderId,
          folderName: saved.folderName,
          name: saved.name,
          key: saved.key,
          contentType: saved.contentType,
          size: saved.size,
          uploadedAt: saved.uploadedAt,
          updatedAt: saved.updatedAt,
          extractionStatus: saved.extractionStatus,
        }).catch(() => undefined)
      }
      await this.logTool(req, actor.account.owner, 'mcp-save-file', {
        siteId,
        folderId,
        fileId: saved.id,
        fileName: name,
        source: 'ce-mcp',
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        file: {
          id: saved.id,
          name: saved.name,
          siteId: saved.site,
          siteName: saved.siteName,
          folderId: saved.folderId,
          folderName: saved.folderName,
          contentType: saved.contentType,
          size: saved.size,
        },
      }))
      return
    }

    if (tool === 'create_folder') {
      const siteId = String(args.siteId ?? '').trim()
      const folderId = args.folderId == null || args.folderId === '' ? '' : String(args.folderId)
      const name = String(args.name ?? '').trim()
      if (!siteId) throw new BadRequestError('siteId is required')
      if (!name) throw new BadRequestError('name is required')
      const actor = await this.getMcpActor(req)
      const allowedSiteIds = await this.getMcpEnabledSiteIds(req, [siteId], config.site.roles.uploaderRoles)
      if (!allowedSiteIds.includes(siteId)) throw new ForbiddenError('Site write access denied')
      const folder = await this.domain.createFolder(siteId, name, folderId || undefined)
      await this.logTool(req, actor.account.owner, 'mcp-create-folder', {
        siteId,
        folderId: String(folder._id),
        folderName: name,
        source: 'ce-mcp',
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        folder: {
          id: String(folder._id),
          name: folder.name,
          parentId: folder.parentId
            ? String(folder.parentId)
            : folder.parentType === 'Content'
              ? String(folder.parent)
              : undefined,
          siteId,
          kind: 'folder',
        },
      }))
      return
    }

    if (tool === 'search_content') {
      const query = String(args.q ?? args.query ?? '').trim()
      if (!query) throw new BadRequestError('q is required')
      const actor = await this.getMcpActor(req)
      const allowedSiteIds = await this.getMcpEnabledSiteIds(req, parseMcpStringArray(args.siteIds))
      const allowedSiteIdSet = new Set(allowedSiteIds)
      let files = this.ctx.search
        ? await this.ctx.search.searchAcrossSites({
            sites: await this.ctx.models.SiteModel.find({ _id: { $in: allowedSiteIds } }).select('_id name').lean()
              .then((sites: any[]) => sites.map(site => ({ id: String(site._id), name: String(site.name ?? '') }))),
            q: query,
            limit: 50,
          })
        : await this.domain.searchFilesByNameAcrossSites({
            userId: String(actor.account.owner),
            name: query,
            limit: 50,
          }).then(results => results.filter(file => allowedSiteIdSet.has(String(file.siteId))))
      if (this.ctx.search) {
        files = await hydrateSearchResultsFromSource({
          models: this.ctx.models,
          q: query,
          results: files,
          search: this.ctx.search,
        })
      }
      await this.activity.safe({
        user: actor.account.owner,
        action: 'mcp-search-content',
        target: actor.account.owner,
        onModel: 'User',
        attributes: { accessKeyId: String(req.accessKey?._id ?? ''), q: query, resultCount: files.length, source: 'ce-mcp' },
      })
      res.json(toMcpJsonRpcResponse(req.body, {
        results: files.map((x: any) => ({
          id: x.id,
          title: x.name,
          name: x.name,
          contentType: x.contentType,
          extractionStatus: x.extractionStatus,
          snippet: x.snippet,
          siteId: x.siteId,
          siteName: x.siteName,
        })),
        contents: files.map((x: any) => ({
          id: x.id,
          title: x.name,
          name: x.name,
          contentType: x.contentType,
          extractionStatus: x.extractionStatus,
          snippet: x.snippet,
          siteId: x.siteId,
          siteName: x.siteName,
          folderId: x.folderId,
          folderName: x.folderName,
        })),
      }))
      return
    }

    throw new BadRequestError('Unsupported MCP tool')
  }

  private async getMcpActor(req: Request) {
    const account = req.account ?? await this.ctx.models.AccountModel.findById(req.accountId).lean()
    if (!account) throw new BadRequestError('Account not found')
    const user = req.user ?? await this.ctx.models.UserModel.findById(account.owner).lean()
    if (!user) throw new BadRequestError('User not found')
    return { account, user }
  }

  private async getMcpEnabledSiteIds(
    req: Request,
    siteIds?: string[],
    roles: readonly string[] = config.site.roles.readRoles,
  ) {
    const actor = await this.getMcpActor(req)
    const accessKeySiteId = req.accessKey?.siteId ? String(req.accessKey.siteId) : ''
    const requestedSiteIds = accessKeySiteId
      ? (siteIds?.length ? siteIds.filter(siteId => siteId === accessKeySiteId) : [accessKeySiteId])
      : siteIds
    if (accessKeySiteId && requestedSiteIds?.length === 0) return []
    const internalSiteChat = req.accessKey?.metadata?.internalSiteChat === true
    return getPermittedSiteIdsBase(
      {
        findSiteIds: async query => {
          const scopedQuery = internalSiteChat
            ? query
            : {
                ...query,
                $and: [
                  ...((Array.isArray((query as any).$and) ? (query as any).$and : []) as any[]),
                  {
                    $or: [
                      { 'attributes.mcp.enabled': true },
                      { 'attributes.ai.mcpEnabled': true },
                    ],
                  },
                ],
              }
          const sites = await this.ctx.models.SiteModel.find(scopedQuery).select('_id').lean()
          return sites.map((site: any) => String(site._id))
        },
      },
      {
        accountId: String(actor.account._id),
        userId: String(actor.account.owner),
        roles,
        ownerRoles: config.site.roles.ownerRoles,
        accepted: true,
        siteIds: requestedSiteIds,
      },
    )
  }

  private listSiteContent(site: any, folderId: string) {
    const folders = (site.folders ?? [])
      .filter((folder: any) => String(folder.parentId ?? '') === folderId)
      .map((folder: any) => serializeFolder(folder, { site, projection: 'mcp' }))
    const rootFiles = (site.files ?? []).map((file: any) => serializeFile(file, { site, folder: null, projection: 'mcp' }))
    if (!folderId) return [...folders, ...rootFiles]
    const folder = (site.folders ?? []).find((candidate: any) => String(candidate._id) === folderId)
    if (!folder) return []
    return (folder.files ?? []).map((file: any) => serializeFile(file, { site, folder, projection: 'mcp' }))
  }

  private async findMcpContent(req: Request, contentId: string) {
    const allowedSiteIds = await this.getMcpEnabledSiteIds(req)
    if (allowedSiteIds.length === 0) throw new ForbiddenError('Content access denied')
    const content = await this.ctx.models.ContentModel.findOne({
      _id: contentId,
      site: { $in: allowedSiteIds },
      status: config.content.status.active,
    }).lean()
    if (!content) throw new BadRequestError('Content not found')
    const site = await this.ctx.models.SiteModel.findById(content.site).select('_id name').lean()
    if (!site) throw new BadRequestError('Site not found')
    const folder = content.kind === 'File' && String(content.parentType) === 'Content'
      ? await this.ctx.models.ContentModel.findOne({
          _id: content.parent,
          site: content.site,
          kind: 'Folder',
          status: config.content.status.active,
        }).lean()
      : null
    if (content.kind === 'Folder') {
      return {
        siteId: String(site._id),
        siteName: String(site.name ?? ''),
        metadata: serializeFolder(content, { site, projection: 'mcp' }),
        folder: content,
        file: null,
      }
    }
    return {
      siteId: String(site._id),
      siteName: String(site.name ?? ''),
      metadata: serializeFile(content, { site, folder, projection: 'mcp' }),
      folder,
      file: content,
    }
  }

  private async logTool(
    req: Request,
    user: unknown,
    action: string,
    attributes: Record<string, unknown>,
  ) {
    await this.activity.safe({
      user,
      action,
      target: user,
      onModel: 'User',
      attributes: {
        accessKeyId: String(req.accessKey?._id ?? ''),
        ...attributes,
      },
    })
  }

  private assertScope(req: Request, scope: string) {
    const scopes = req.accessKey?.scopes ?? []
    if (scopes.includes(scope)) return
    throw new ForbiddenError('Access key missing required scope')
  }

  private async readMcpFileText(file: any, isTextBased: boolean) {
    if (!isTextBased && file.extractedTextKey) {
      return (await this.domain.downloadFile(String(file.extractedTextKey))).toString('utf8')
    }
    if (!isTextBased && typeof file.extractedText === 'string') return file.extractedText
    return (await this.domain.downloadFile(file.key)).toString('utf8')
  }

}

const toolsList = [
  ...createCoreMcpToolDefinitions({ includeAliases: true }),
]
