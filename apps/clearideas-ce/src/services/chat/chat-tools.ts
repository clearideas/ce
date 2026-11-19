import type {
  AgentTool,
  JsonObject,
  JsonValue,
  ToolAdapter,
  ToolCall,
  ToolExecutionContext,
  ToolResult,
} from '@clearideas/agent-runtime'
import {
  llmContentReferenceArgsSchema,
  llmRetrieveFileContentArgsSchema,
  validateSchema,
} from '@clearideas/core'
import { BadRequestError } from '@clearideas/core/errors'
import type { CeAppContext } from '../../lib/app-context.js'
import { ContentToolOperations, type ContentToolAccess, type ContentToolItem } from '../content-tools.js'

export interface ChatScopeSite {
  id: string
  name: string
}

/** A file the answer is based on, shown under it and linking to the file. */
export interface ChatSource {
  contentId: string
  siteId: string
  siteName: string
  name: string
  contentType: string | null
}

export const CHAT_TOOL_NAMES = [
  'list_sites',
  'search_content',
  'list_content',
  'get_content_metadata',
  'retrieve_file_content',
] as const

const siteIdProperty = {
  type: 'string',
  description: 'A siteId from list_sites or a search result. Optional when only one site is available.',
}

const toolDefinitions: AgentTool[] = [
  {
    name: 'list_sites',
    description: 'List the Clear Ideas sites this conversation can use, with their siteId and name.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_content',
    description:
      'Search files by name, extracted text, or metadata (e.g. @contentType:application/pdf) in every available site, or in one site with siteId. Results include contentId, site, folder and a text snippet.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, siteId: siteIdProperty },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_content',
    description: 'List the folders and files at the root of a site, or inside a folder (folderId).',
    inputSchema: {
      type: 'object',
      properties: { siteId: siteIdProperty, folderId: { type: 'string' }, limit: { type: 'number' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_content_metadata',
    description: 'Inspect a file or folder (by contentId) without reading its text.',
    inputSchema: {
      type: 'object',
      properties: { contentId: { type: 'string' } },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'retrieve_file_content',
    description:
      'Read the text of a file by contentId: text-based files, and PDFs once their text is extracted. Use it before quoting, summarising or giving figures.',
    inputSchema: {
      type: 'object',
      properties: { contentId: { type: 'string' }, maxTokens: { type: 'number' } },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
]

/**
 * Chat's tools (agent runtime `ToolAdapter`): the content operations over the conversation's scope —
 * the sites the user can read that have AI chat turned on (or the one site of a Site AI chat). Every
 * call is re-checked against that scope and the user's current access.
 *
 * It also records what the answer is based on: files that were read, and files that were found and
 * are named in the answer (`sourcesFor`).
 */
export class ChatToolAdapter implements ToolAdapter {
  private readonly operations
  private readonly allowed: ReadonlySet<string>
  private readonly read = new Map<string, ChatSource>()
  private readonly seen = new Map<string, ChatSource>()

  constructor(
    ctx: CeAppContext,
    access: ContentToolAccess,
    private readonly sites: ChatScopeSite[],
    private readonly onActivity: (label: string) => void = () => {},
  ) {
    this.operations = new ContentToolOperations(ctx, access)
    this.allowed = new Set(sites.map(site => site.id))
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
          code: 'CONTENT_TOOL_ERROR',
          message: error instanceof Error ? error.message : 'The tool failed.',
          retryable: false,
        },
      }
    }
  }

  /** Files read for the answer, then files found earlier whose name the answer mentions (max 8). */
  sourcesFor(answer: string): ChatSource[] {
    const text = answer.toLowerCase()
    const mentioned = [...this.seen.values()].filter(
      source => !this.read.has(source.contentId) && source.name && text.includes(source.name.toLowerCase()),
    )
    return [...this.read.values(), ...mentioned].slice(0, 8)
  }

  private siteFor(input: JsonObject) {
    const requested = typeof input.siteId === 'string' ? input.siteId.trim() : ''
    if (requested) {
      if (!this.allowed.has(requested))
        throw new BadRequestError('That site is not available in this conversation.')
      return requested
    }
    if (this.sites.length === 1) return this.sites[0]!.id
    throw new BadRequestError('siteId is required: call list_sites to choose a site.')
  }

  private async execute(name: string, input: JsonObject): Promise<unknown> {
    switch (name) {
      case 'list_sites':
        this.onActivity('Checking your sites')
        return { sites: this.sites.map(site => ({ siteId: site.id, name: site.name })) }
      case 'search_content': {
        const query = typeof input.query === 'string' ? input.query.trim().slice(0, 500) : ''
        if (!query) throw new BadRequestError('query is required')
        const requested = typeof input.siteId === 'string' && input.siteId.trim() ? this.siteFor(input) : ''
        this.onActivity(`Searching for “${query}”`)
        const siteIds = requested ? [requested] : this.sites.map(site => site.id)
        const results = await this.operations.search({
          query,
          siteIds,
          source: 'ce-chat',
          scope: siteIds.length === 1 ? 'site' : 'all',
        })
        for (const item of results) this.remember(this.seen, item)
        return { results }
      }
      case 'list_content': {
        const siteId = this.siteFor(input)
        const folderId = typeof input.folderId === 'string' && input.folderId ? input.folderId : undefined
        this.onActivity('Browsing folders')
        const listed = await this.operations.listContent(
          siteId,
          folderId,
          Number(input.limit) || 100,
          this.allowed,
        )
        for (const item of listed.contents) this.remember(this.seen, item)
        return listed
      }
      case 'get_content_metadata': {
        const { contentId } = await validateSchema(llmContentReferenceArgsSchema, input)
        const metadata = await this.operations.contentMetadata(String(contentId), this.allowed)
        this.remember(this.seen, metadata.content)
        return metadata
      }
      case 'retrieve_file_content': {
        const { contentId, maxTokens = 6000 } = await validateSchema(llmRetrieveFileContentArgsSchema, input)
        const known = this.seen.get(String(contentId))
        this.onActivity(known ? `Reading ${known.name}` : 'Reading a file')
        const file = await this.operations.retrieveFile(String(contentId), Number(maxTokens), this.allowed)
        this.remember(this.read, file.contentInfo)
        return file
      }
      default:
        throw new BadRequestError(`Unknown tool: ${name}`)
    }
  }

  private remember(into: Map<string, ChatSource>, item: ContentToolItem) {
    if (item.kind !== 'file' || into.has(item.contentId)) return
    into.set(item.contentId, {
      contentId: item.contentId,
      siteId: item.siteId,
      siteName: item.siteName,
      name: item.name,
      contentType: item.contentType,
    })
  }
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}
