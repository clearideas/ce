import {
  type AgentTool,
  type JsonObject,
  type JsonValue,
  type ToolAdapter,
  type ToolCall,
  type ToolExecutionContext,
  type ToolResult,
} from '@clearideas/agent-runtime'
import {
  createCoreDomainServices,
  isPdfContent,
  isTextBasedContent,
  llmContentReferenceArgsSchema,
  llmListContentArgsSchema,
  llmRetrieveFileContentArgsSchema,
  llmSearchContentArgsSchema,
  validateSchema,
} from '@clearideas/core'
import { BadRequestError } from '@clearideas/core/errors'
import type { CeAppContext } from '../../lib/app-context.js'
import { assertSiteReadAccess } from '../../middleware/access-control.js'
import { config } from '../../config/index.js'
import { extractPdfTextForFile } from '../pdf-text-extraction.js'
import { hydrateSearchResultsFromSource } from '../search-result-hydration.js'

const toolDefinitions: AgentTool[] = [
  {
    name: 'list_content',
    description: 'List folders and files in the selected Clear Ideas site.',
    inputSchema: {
      type: 'object',
      properties: { folderId: { type: 'string' }, limit: { type: 'number' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_site_metadata',
    description: 'Inspect metadata for the selected Clear Ideas site.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_content_metadata',
    description: 'Inspect metadata for a file or folder without reading file bytes.',
    inputSchema: {
      type: 'object',
      properties: { contentId: { type: 'string' } },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_content',
    description: 'Search files by name, extracted text, or metadata.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'retrieve_file_content',
    description: 'Retrieve text from a text-based file or an extracted PDF.',
    inputSchema: {
      type: 'object',
      properties: { contentId: { type: 'string' }, maxTokens: { type: 'number' } },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
]

export class CeSiteToolAdapter implements ToolAdapter {
  private readonly domain

  constructor(
    private readonly ctx: CeAppContext,
    private readonly access: { accountId: string; userId: string; siteId: string },
  ) {
    this.domain = createCoreDomainServices(ctx.models as any, ctx.providers)
  }

  async listTools(): Promise<AgentTool[]> {
    return structuredClone(toolDefinitions)
  }

  async executeTool(call: ToolCall, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const output = await this.execute(call.name, call.input)
      return { callId: call.id, name: call.name, output: json(output) }
    } catch (error) {
      return {
        callId: call.id,
        name: call.name,
        error: {
          code: 'SITE_TOOL_ERROR',
          message: error instanceof Error ? error.message : 'Site tool failed.',
          retryable: false,
        },
      }
    }
  }

  private async execute(name: string, input: JsonObject): Promise<unknown> {
    const site = await assertSiteReadAccess({ models: this.ctx.models, ...this.access })
    switch (name) {
      case 'list_content': {
        const { folderId, limit = 100 } = await validateSchema(llmListContentArgsSchema, input)
        const parent = folderId ? String(folderId) : this.access.siteId
        const rows = await this.ctx.models.ContentModel.find({
          site: this.access.siteId,
          parent,
          status: config.content.status.active,
        })
          .sort({ rank: 1, name: 1 })
          .limit(Math.max(1, Math.min(Number(limit) || 100, 200)))
          .lean()
        return { site: siteInfo(site), contents: rows.map(formatContent) }
      }
      case 'get_site_metadata': {
        const [numberOfFolders, fileStats] = await Promise.all([
          this.ctx.models.ContentModel.countDocuments({
            site: this.access.siteId,
            kind: 'Folder',
            status: config.content.status.active,
          }),
          this.ctx.models.ContentModel.aggregate([
            {
              $match: {
                site: site._id,
                kind: 'File',
                status: config.content.status.active,
              },
            },
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
      case 'get_content_metadata': {
        const { contentId } = await validateSchema(llmContentReferenceArgsSchema, input)
        const content = await this.ctx.models.ContentModel.findOne({
          _id: String(contentId),
          site: this.access.siteId,
          status: config.content.status.active,
        }).lean()
        if (!content) throw new BadRequestError('Content not found')
        return { site: siteInfo(site), content: formatContent(content) }
      }
      case 'search_content': {
        const { query } = await validateSchema(llmSearchContentArgsSchema, input)
        let files = this.ctx.search
          ? await this.ctx.search.searchSite({ siteId: this.access.siteId, q: query, limit: 50 })
          : await this.domain.searchFilesByName({ siteId: this.access.siteId, name: query, limit: 50 })
        if (this.ctx.search) {
          files = await hydrateSearchResultsFromSource({
            models: this.ctx.models,
            q: query,
            results: files,
            search: this.ctx.search,
          })
        }
        return { results: files }
      }
      case 'retrieve_file_content': {
        const { contentId, maxTokens = 8000 } = await validateSchema(
          llmRetrieveFileContentArgsSchema,
          input,
        )
        let file = await this.getFile(String(contentId))
        const isText = isTextBasedContent(file.contentType, file.name)
        let hasExtractedText = hasPdfText(file)
        if (!isText && isPdfContent(file.contentType, file.name) && !hasExtractedText) {
          const extracted = await extractPdfTextForFile({
            models: this.ctx.models,
            storage: this.ctx.providers.storage,
            search: this.ctx.search,
            fileKey: String(file.key ?? ''),
            contentType: file.contentType,
          })
          if (extracted) file = await this.getFile(String(contentId))
          hasExtractedText = hasPdfText(file)
        }
        if (!isText && !hasExtractedText) throw new BadRequestError('No readable text is available.')
        const text = !isText && file.extractedTextKey
          ? (await this.domain.downloadFile(String(file.extractedTextKey))).toString('utf8')
          : !isText && typeof file.extractedText === 'string'
            ? file.extractedText
            : (await this.domain.downloadFile(String(file.key))).toString('utf8')
        const maxChars = Math.max(1, Math.min(Number(maxTokens) || 8000, 32_000)) * 4
        return {
          content: text.slice(0, maxChars),
          contentInfo: formatContent(file),
          truncated: text.length > maxChars,
        }
      }
      default:
        throw new BadRequestError(`Unknown Site tool: ${name}`)
    }
  }

  private async getFile(fileId: string) {
    const file = await this.ctx.models.ContentModel.findOne({
      _id: fileId,
      site: this.access.siteId,
      kind: 'File',
      status: config.content.status.active,
    })
      .select('+extractedText')
      .lean()
    if (!file) throw new BadRequestError('Content not found')
    return file
  }
}

function siteInfo(site: any) {
  return { id: String(site._id), name: String(site.name ?? '') }
}

function formatContent(content: any) {
  return {
    id: String(content._id),
    contentId: String(content._id),
    name: String(content.name ?? ''),
    kind: String(content.kind ?? '').toLowerCase(),
    parentId: String(content.parent ?? ''),
    size: content.size ?? null,
    contentType: content.contentType ?? null,
    extractionStatus: content.extractionStatus ?? null,
    updatedAt: content.updatedAt ?? content.uploadedAt ?? null,
  }
}

function hasPdfText(file: any) {
  return (
    isPdfContent(file.contentType, file.name) &&
    file.extractionStatus === config.content.extractionStatus.complete &&
    Boolean(file.extractedTextKey || file.extractedText)
  )
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}
