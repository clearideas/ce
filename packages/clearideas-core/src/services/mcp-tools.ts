import { z } from 'zod'

const objectIdString = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { error: 'Invalid ObjectId' })
const nullableObjectIdString = z.preprocess(
  value => (value == null || value === '' ? null : String(value).trim()),
  z.union([objectIdString, z.null()]),
)
const optionalObjectIdString = z.preprocess(
  value => (value == null || value === '' ? undefined : String(value).trim()),
  objectIdString.optional(),
)

export const CORE_MCP_TOOL_NAMES = [
  'list_sites',
  'list_content',
  'get_site_metadata',
  'get_content_metadata',
  'search_content',
  'retrieve_file_content',
  'save_file',
  'create_folder',
] as const

export type CoreMcpToolName = (typeof CORE_MCP_TOOL_NAMES)[number]

export const McpListSitesArgsSchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const McpListContentArgsSchema = z.strictObject({
  siteId: objectIdString,
  folderId: nullableObjectIdString.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z
    .strictObject({
      field: z.enum(['name', 'updatedAt', 'size']),
      direction: z.enum(['asc', 'desc']),
    })
    .optional(),
  updatedSince: z.union([z.iso.datetime(), z.literal('')]).optional(),
  startsWith: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mimeTypes: z.array(z.string()).optional(),
})

export const McpSaveFileArgsSchema = z.strictObject({
  siteId: objectIdString,
  folderId: nullableObjectIdString.optional(),
  name: z.string().trim().min(1).max(500),
  content: z.string().min(1).max(2_000_000),
  contentEncoding: z.enum(['utf8', 'base64']).optional(),
  contentType: z.string().optional(),
  fileId: nullableObjectIdString.optional(),
})

export const McpSearchContentArgsSchema = z.strictObject({
  query: z.string().trim().min(1),
  siteIds: z.array(objectIdString).optional(),
  kind: z.enum(['file', 'folder', 'any', '']).optional(),
  searchType: z.enum(['hybrid', 'full-text', 'completion', '']).optional(),
  mimeTypes: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const McpCreateFolderArgsSchema = z.strictObject({
  siteId: objectIdString,
  folderId: nullableObjectIdString.optional(),
  name: z.string().trim().min(1).max(500),
})

export const McpRetrieveFileContentArgsSchema = z.strictObject({
  contentId: objectIdString,
  maxTokens: z.coerce.number().int().min(500).max(32000).optional(),
  version: z.coerce.number().int().min(0).optional(),
  versionAsOf: z.union([z.iso.datetime(), z.literal('')]).optional(),
  lines: z
    .strictObject({
      start: z.coerce.number().int().min(1).optional(),
      end: z.coerce.number().int().min(1).optional(),
    })
    .optional(),
})

export const McpGetSiteMetadataArgsSchema = z.strictObject({
  siteId: objectIdString,
})

export const McpGetContentMetadataArgsSchema = z.strictObject({
  contentId: objectIdString,
})

export const McpRetrieveFileSummaryArgsSchema = z.strictObject({
  contentId: objectIdString,
})

export const McpRetrieveDiffForFileArgsSchema = z.strictObject({
  contentId: objectIdString,
  versionAsOf: z.union([z.date(), z.iso.datetime(), z.literal('')]).optional(),
  compareVersionAsOf: z.union([z.date(), z.iso.datetime(), z.literal('')]).optional(),
  maxTokens: z.coerce.number().int().min(500).max(32000).optional(),
})

export const RetrieveDiffForFileArgsRequestSchema = McpRetrieveDiffForFileArgsSchema.extend({
  version: z.coerce.number().int().min(0).optional(),
  priorVersion: z.coerce.number().int().min(0).optional(),
  priorVersionAsOf: z.union([z.date(), z.iso.datetime(), z.literal('')]).optional(),
  lines: z
    .strictObject({
      start: z.coerce.number().int().min(1).optional(),
      end: z.coerce.number().int().min(1).optional(),
    })
    .optional(),
})

export const McpOptionalSiteIdsSchema = z.array(optionalObjectIdString).optional()

const optionalLlmObjectIdSchema = z.preprocess(value => {
  const normalized = String(value ?? '').trim()
  return !normalized || normalized === 'undefined' || normalized === 'null' ? undefined : normalized
}, objectIdString.optional())

const llmContentReferenceBaseSchema = z.strictObject({
  contentId: optionalLlmObjectIdSchema,
  id: optionalLlmObjectIdSchema,
  fileId: optionalLlmObjectIdSchema,
})

export const LlmListContentArgsSchema = z
  .strictObject({
    folderId: optionalLlmObjectIdSchema,
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .transform(value => ({
    ...(value.folderId ? { folderId: value.folderId } : {}),
    ...(value.limit ? { limit: value.limit } : {}),
  }))

export const LlmSearchContentArgsSchema = z
  .strictObject({
    query: z.string().trim().min(1, { error: 'query is required' }).max(500),
  })
  .transform(value => ({ query: value.query }))

export const LlmContentReferenceArgsSchema = llmContentReferenceBaseSchema
  .refine(value => Boolean(value.contentId || value.id || value.fileId), {
    error:
      'contentId is required. Use the contentId returned by search_content, list_content, or get_content_metadata.',
  })
  .transform(value => ({
    contentId: value.contentId ?? value.id ?? value.fileId!,
  }))

export const LlmRetrieveFileContentArgsSchema = llmContentReferenceBaseSchema
  .extend({
    maxTokens: z.coerce.number().int().min(1).max(32000).optional(),
  })
  .refine(value => Boolean(value.contentId || value.id || value.fileId), {
    error:
      'contentId is required. Use the contentId returned by search_content, list_content, or get_content_metadata.',
  })
  .transform(value => ({
    contentId: value.contentId ?? value.id ?? value.fileId!,
    ...(value.maxTokens ? { maxTokens: value.maxTokens } : {}),
  }))

export const mcpListSitesArgsSchema = McpListSitesArgsSchema
export const mcpListContentArgsSchema = McpListContentArgsSchema
export const mcpSaveFileArgsSchema = McpSaveFileArgsSchema
export const mcpSearchContentArgsSchema = McpSearchContentArgsSchema
export const mcpCreateFolderArgsSchema = McpCreateFolderArgsSchema
export const mcpRetrieveFileContentArgsSchema = McpRetrieveFileContentArgsSchema
export const mcpGetSiteMetadataArgsSchema = McpGetSiteMetadataArgsSchema
export const mcpGetContentMetadataArgsSchema = McpGetContentMetadataArgsSchema
export const mcpRetrieveFileSummaryArgsSchema = McpRetrieveFileSummaryArgsSchema
export const mcpRetrieveDiffForFileArgsSchema = McpRetrieveDiffForFileArgsSchema
export const mcpOptionalSiteIdsSchema = McpOptionalSiteIdsSchema
export const llmListContentArgsSchema = LlmListContentArgsSchema
export const llmSearchContentArgsSchema = LlmSearchContentArgsSchema
export const llmContentReferenceArgsSchema = LlmContentReferenceArgsSchema
export const llmRetrieveFileContentArgsSchema = LlmRetrieveFileContentArgsSchema

export type McpListSitesArgsRequest = z.infer<typeof McpListSitesArgsSchema>
export type McpListContentArgsRequest = z.infer<typeof McpListContentArgsSchema>
export type McpSaveFileArgsRequest = z.infer<typeof McpSaveFileArgsSchema>
export type McpSearchContentArgsRequest = z.infer<typeof McpSearchContentArgsSchema>
export type McpCreateFolderArgsRequest = z.infer<typeof McpCreateFolderArgsSchema>
export type McpRetrieveFileContentArgsRequest = z.infer<typeof McpRetrieveFileContentArgsSchema>
export type McpGetSiteMetadataArgsRequest = z.infer<typeof McpGetSiteMetadataArgsSchema>
export type McpGetContentMetadataArgsRequest = z.infer<typeof McpGetContentMetadataArgsSchema>
export type McpRetrieveFileSummaryArgsRequest = z.infer<typeof McpRetrieveFileSummaryArgsSchema>
export type McpRetrieveDiffForFileArgsRequest = z.infer<typeof McpRetrieveDiffForFileArgsSchema>
export type RetrieveDiffForFileArgsRequest = z.infer<typeof RetrieveDiffForFileArgsRequestSchema>
export type LlmListContentArgsRequest = z.infer<typeof LlmListContentArgsSchema>
export type LlmSearchContentArgsRequest = z.infer<typeof LlmSearchContentArgsSchema>
export type LlmContentReferenceArgsRequest = z.infer<typeof LlmContentReferenceArgsSchema>
export type LlmRetrieveFileContentArgsRequest = z.infer<typeof LlmRetrieveFileContentArgsSchema>

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
    additionalProperties: false
  }
  outputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    additionalProperties: true
  }
}

export const genericMcpOutputSchema: McpToolDefinition['outputSchema'] = {
  type: 'object',
  properties: {},
  additionalProperties: true,
}

export function createMcpToolDefinition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
    outputSchema: genericMcpOutputSchema,
  }
}

export function createCoreMcpToolDefinitions(
  input: { includeAliases?: boolean } = {},
): McpToolDefinition[] {
  const tools = [
    createMcpToolDefinition(
      'list_sites',
      'List Clear Ideas sites available to this access key.',
      {},
    ),
    createMcpToolDefinition(
      'list_content',
      'List folders and files in an MCP-enabled Clear Ideas site.',
      {
        siteId: { type: 'string' },
        folderId: { type: 'string' },
        limit: { type: 'number' },
      },
      ['siteId'],
    ),
    createMcpToolDefinition(
      'get_site_metadata',
      'Inspect an MCP-enabled site, including role, visibility, counts, and storage size.',
      {
        siteId: { type: 'string' },
      },
      ['siteId'],
    ),
    createMcpToolDefinition(
      'get_content_metadata',
      'Inspect an MCP-visible file or folder without reading file bytes.',
      {
        contentId: { type: 'string' },
      },
      ['contentId'],
    ),
    createMcpToolDefinition(
      'search_content',
      'Search files by name, full text, or metadata syntax such as @contentType:application/pdf.',
      {
        q: { type: 'string' },
        siteIds: { type: 'array', items: { type: 'string' } },
      },
      ['q'],
    ),
    createMcpToolDefinition(
      'retrieve_file_content',
      'Retrieve UTF-8 text from a text-based file or extracted PDF text.',
      {
        contentId: { type: 'string' },
        maxTokens: { type: 'number' },
        lines: {
          type: 'object',
          properties: { start: { type: 'number' }, end: { type: 'number' } },
          additionalProperties: false,
        },
      },
      ['contentId'],
    ),
    createMcpToolDefinition(
      'save_file',
      'Create a UTF-8 text file in an MCP-enabled site or folder.',
      {
        siteId: { type: 'string' },
        folderId: { type: 'string' },
        name: { type: 'string' },
        content: { type: 'string' },
        contentType: { type: 'string' },
      },
      ['siteId', 'name', 'content'],
    ),
    createMcpToolDefinition(
      'create_folder',
      'Create a folder in an MCP-enabled site or nested under another folder.',
      {
        siteId: { type: 'string' },
        folderId: { type: 'string' },
        name: { type: 'string' },
      },
      ['siteId', 'name'],
    ),
  ]

  if (!input.includeAliases) return tools

  return [
    ...tools,
    createMcpToolDefinition(
      'search',
      'Compatibility alias for search_content.',
      {
        query: { type: 'string' },
      },
      ['query'],
    ),
    createMcpToolDefinition(
      'fetch',
      'Compatibility alias for retrieve_file_content.',
      {
        id: { type: 'string' },
        maxTokens: { type: 'number' },
      },
      ['id'],
    ),
  ]
}

export function parseMcpSiteId(input: Record<string, unknown>): string {
  return String(input.siteId ?? '').trim()
}

export function parseMcpOptionalFolderId(input: Record<string, unknown>): string {
  return input.folderId == null || input.folderId === '' ? '' : String(input.folderId).trim()
}

export function parseMcpContentId(input: Record<string, unknown>): string {
  return String(input.contentId ?? input.id ?? '').trim()
}

export function parseMcpSearchQuery(input: Record<string, unknown>): string {
  return String(input.q ?? input.query ?? '').trim()
}

export function parseMcpStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const values = input.map(value => String(value).trim()).filter(Boolean)
  return values.length > 0 ? values : undefined
}

export function normalizeCoreMcpToolName(tool: string): string {
  const normalized = tool.startsWith('clearideas.') ? tool.slice('clearideas.'.length) : tool
  if (normalized === 'search') return 'search_content'
  if (normalized === 'fetch') return 'retrieve_file_content'
  return normalized
}

export function getCoreMcpToolRequiredScope(tool: string): 'mcp:read' | 'mcp:write' | undefined {
  const normalizedTool = normalizeCoreMcpToolName(tool)
  if (normalizedTool === 'save_file' || normalizedTool === 'create_folder') return 'mcp:write'
  if ((CORE_MCP_TOOL_NAMES as readonly string[]).includes(normalizedTool)) return 'mcp:read'
  return undefined
}
