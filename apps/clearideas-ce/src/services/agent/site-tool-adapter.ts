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
  llmContentReferenceArgsSchema,
  llmListContentArgsSchema,
  llmRetrieveFileContentArgsSchema,
  llmSearchContentArgsSchema,
  validateSchema,
} from '@clearideas/core'
import { BadRequestError } from '@clearideas/core/errors'
import type { CeAppContext } from '../../lib/app-context.js'
import { ContentToolOperations } from '../content-tools.js'

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

/** The Site tools an agent run may use: one site, fixed by the run. */
export class CeSiteToolAdapter implements ToolAdapter {
  private readonly operations
  private readonly allowed

  constructor(
    ctx: CeAppContext,
    private readonly access: { accountId: string; userId: string; siteId: string },
  ) {
    this.operations = new ContentToolOperations(ctx, access)
    this.allowed = new Set([String(access.siteId)])
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
    const siteId = String(this.access.siteId)
    switch (name) {
      case 'list_content': {
        const { folderId, limit = 100 } = await validateSchema(llmListContentArgsSchema, input)
        return this.operations.listContent(
          siteId,
          folderId ? String(folderId) : undefined,
          Number(limit),
          this.allowed,
        )
      }
      case 'get_site_metadata':
        return this.operations.siteMetadata(siteId, this.allowed)
      case 'get_content_metadata': {
        const { contentId } = await validateSchema(llmContentReferenceArgsSchema, input)
        return this.operations.contentMetadata(String(contentId), this.allowed)
      }
      case 'search_content': {
        const { query } = await validateSchema(llmSearchContentArgsSchema, input)
        const results = await this.operations.search({
          query,
          siteIds: [siteId],
          source: 'ce-agent',
          scope: 'site',
        })
        return { results }
      }
      case 'retrieve_file_content': {
        const { contentId, maxTokens = 8000 } = await validateSchema(llmRetrieveFileContentArgsSchema, input)
        return this.operations.retrieveFile(String(contentId), Number(maxTokens), this.allowed)
      }
      default:
        throw new BadRequestError(`Unknown Site tool: ${name}`)
    }
  }
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}
