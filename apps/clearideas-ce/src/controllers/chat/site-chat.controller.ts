import { BadRequestError, ForbiddenError } from '@clearideas/core/errors'
import {
  isContentTextAvailable,
  isPdfContent,
  isTextBasedContent,
  llmContentReferenceArgsSchema,
  llmListContentArgsSchema,
  llmRetrieveFileContentArgsSchema,
  llmSearchContentArgsSchema,
  validateSchema,
} from '@clearideas/core'
import { createCoreDomainServices } from '@clearideas/core'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import {
  convertToModelMessages,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai'
import type { Request, Response } from 'express'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'
import {
  CE_SECURITY_PREAMBLE,
  INSTRUCTION_LEAK_REFUSAL,
  getLastUserText,
  isInstructionLeakAttempt,
} from '../../lib/instruction-leak-guard.js'
import { extractPdfTextForFile } from '../../services/pdf-text-extraction.js'
import { hydrateSearchResultsFromSource } from '../../services/search-result-hydration.js'

const aiTool = tool as any

export class SiteChatController {
  private readonly domain

  constructor(private readonly ctx: CeAppContext) {
    this.domain = createCoreDomainServices(ctx.models, ctx.providers)
  }

  models = async (_req: Request, res: Response) => {
    res.json(getConfiguredChatModels())
  }

  chat = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId ?? '').trim()
    if (!siteId) throw new BadRequestError('siteId is required')
    const messages = Array.isArray(req.body?.messages) ? req.body.messages as UIMessage[] : []
    if (messages.length === 0) throw new BadRequestError('messages are required')

    const site = await this.domain.getSite({ siteId, userId: String(req.sub!), ownerRole: config.site.role.owner })
    const role = String(req.siteRole ?? (site as any).currentUserRole ?? '')
    if (!role) throw new ForbiddenError('Site access denied')
    ;(site as any).currentUserRole = role
    if (!isSiteAiChatEnabled(site)) throw new ForbiddenError('AI chat is not enabled for this site')

    const selectedModel = getConfiguredChatModel(typeof req.body?.model === 'string' ? req.body.model : undefined)
    const tools = this.buildSiteChatTools(site, siteId)
    if (isInstructionLeakAttempt(getLastUserText(messages as any))) {
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          const id = 'security-refusal'
          writer.write({ type: 'text-start', id })
          writer.write({ type: 'text-delta', id, delta: INSTRUCTION_LEAK_REFUSAL })
          writer.write({ type: 'text-end', id })
        },
      })
      pipeUIMessageStreamToResponse({ response: res as any, stream })
      return
    }

    const result = streamText({
      model: selectedModel.model,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      system: `${CE_SECURITY_PREAMBLE}\n\n${config.ai.siteChatSystemPrompt} Current site: ${String((site as any).name ?? 'site')} (${siteId}).`,
    })

    result.pipeUIMessageStreamToResponse(res as any, {
      onError: error => {
        logSiteChatError('stream', error, { siteId, model: selectedModel.modelId })
        return isExpectedChatError(error)
          ? getErrorMessage(error)
          : 'The AI response failed. Please try again.'
      },
    })
  }

  private buildSiteChatTools(site: any, siteId: string) {
    return {
      list_content: aiTool({
        description: 'List folders and files in the current Clear Ideas site. This corresponds to clearideas.list_content.',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            folderId: { type: 'string', description: 'Optional folder id. Omit for the site root.' },
            limit: { type: 'number', description: 'Maximum number of content items to return.' },
          },
          additionalProperties: false,
        }),
        execute: async (input: unknown) =>
          executeSiteChatTool('list_content', { siteId, input }, async () => {
            const { folderId, limit = 100 } = await validateSchema(llmListContentArgsSchema, input)
            return {
              site: { id: siteId, name: String(site.name ?? '') },
              contents: listSiteContent(site, String(folderId ?? '')).slice(0, Math.max(1, Math.min(Number(limit) || 100, 200))),
            }
          }),
      }),
      get_site_metadata: aiTool({
        description: 'Inspect metadata for the current Clear Ideas site. This corresponds to clearideas.get_site_metadata.',
        inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
        execute: async () => executeSiteChatTool('get_site_metadata', { siteId }, async () => {
          const allFiles = [
            ...(site.files ?? []),
            ...(site.folders ?? []).flatMap((folder: any) => folder.files ?? []),
          ]
          return {
            site: {
              id: siteId,
              name: String(site.name ?? ''),
              visibility: site.visibility ?? config.site.visibility.private,
              currentUserRole: site.currentUserRole ?? '',
              numberOfFolders: (site.folders ?? []).length,
              numberOfFiles: allFiles.length,
              totalActiveSize: allFiles.reduce((total: number, file: any) => total + (Number(file.size) || 0), 0),
              createdAt: site.createdAt,
              updatedAt: site.updatedAt,
            },
          }
        }),
      }),
      get_content_metadata: aiTool({
        description: 'Inspect metadata for a file or folder in the current site without reading file bytes. This corresponds to clearideas.get_content_metadata.',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            contentId: { type: 'string', description: 'The contentId returned by search_content, list_content, or get_content_metadata.' },
          },
          required: ['contentId'],
          additionalProperties: false,
        }),
        execute: async (input: unknown) => executeSiteChatTool('get_content_metadata', { siteId, input }, async () => {
          const { contentId } = await validateSchema(llmContentReferenceArgsSchema, input)
          const id = String(contentId)
          const file = await this.getSourceFile({ siteId, fileId: id }).catch(() => null)
          const content = file ? formatRetrievedFile(file) : findSiteContent(site, id)
          if (!content) throw new BadRequestError('Content not found')
          return { content, site: { id: siteId, name: String(site.name ?? '') } }
        }),
      }),
      search_content: aiTool({
        description: 'Search files in the current site by file name, full extracted text, or simple metadata syntax like @contentType:application/pdf. This corresponds to clearideas.search_content.',
        inputSchema: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        }),
        execute: async (input: unknown) => executeSiteChatTool('search_content', { siteId, input }, async () => {
          const { query } = await validateSchema(llmSearchContentArgsSchema, input)
          let files = this.ctx.search
            ? await this.ctx.search.searchSite({ siteId, q: query, limit: 50 })
            : await this.domain.searchFilesByName({ siteId, name: query, limit: 50 })
          if (this.ctx.search) {
            files = await hydrateSearchResultsFromSource({
              models: this.ctx.models,
              q: query,
              results: files,
              search: this.ctx.search,
            })
          }
          return {
            results: files.map((x: any) => ({
              id: x.id,
              contentId: x.id,
              fileId: x.id,
              title: x.name,
              name: x.name,
              kind: x.kind ?? 'file',
              contentType: x.contentType,
              extractionStatus: x.extractionStatus,
              textAvailable: x.textAvailable,
              snippet: x.snippet,
              siteId: x.siteId,
              siteName: x.siteName,
              folderId: x.folderId,
              folderName: x.folderName,
            })),
          }
        }),
      }),
      retrieve_file_content: aiTool({
        description: 'Retrieve UTF-8 text from a text-based file in the current site. PDFs work after text extraction completes. This corresponds to clearideas.retrieve_file_content.',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            contentId: { type: 'string', description: 'The contentId returned by search_content, list_content, or get_content_metadata.' },
            maxTokens: { type: 'number' },
          },
          required: ['contentId'],
          additionalProperties: false,
        }),
        execute: async (input: unknown) => executeSiteChatTool('retrieve_file_content', { siteId, input }, async () => {
          const { contentId, maxTokens = 8000 } = await validateSchema(llmRetrieveFileContentArgsSchema, input)
          const contentIdString = String(contentId)
          let file = await this.getSourceFile({ siteId, fileId: contentIdString })
          const isText = isTextBasedContent(file.contentType, file.name)
          let hasExtractedText = hasPdfText(file)
          if (!isText && isPdfContent(file.contentType, file.name) && !hasExtractedText) {
            const extracted = await extractPdfTextForFile({
              models: this.ctx.models as any,
              storage: this.ctx.providers.storage,
              search: this.ctx.search,
              fileKey: String(file.key ?? ''),
              contentType: file.contentType,
            })
            if (extracted) file = await this.getSourceFile({ siteId, fileId: contentIdString })
            hasExtractedText = hasPdfText(file)
          }
          if (!isText && isPdfContent(file.contentType, file.name) && !hasExtractedText) {
            throw new BadRequestError('No extractable text was found in this PDF.')
          }
          if (!isText && !hasExtractedText) throw new BadRequestError('Only text-based files can be retrieved')
          const text = await this.readFileText(file, isText)
          const maxChars = Math.max(1, Math.min(Number(maxTokens) || 8000, 32000)) * 4
          return {
            content: text.length > maxChars ? text.slice(0, maxChars) : text,
            contentInfo: formatRetrievedFile(file),
            truncated: text.length > maxChars,
          }
        }),
      }),
    }
  }

  private async readFileText(file: any, isTextBased: boolean) {
    if (!isTextBased && file.extractedTextKey) {
      return (await this.domain.downloadFile(String(file.extractedTextKey))).toString('utf8')
    }
    if (!isTextBased && typeof file.extractedText === 'string') return file.extractedText
    return (await this.domain.downloadFile(file.key)).toString('utf8')
  }

  private async getSourceFile(input: { siteId: string; fileId: string }) {
    const file = await this.ctx.models.ContentModel.findOne({
      _id: input.fileId,
      site: input.siteId,
      kind: 'File',
      status: config.content.status.active,
    }).select('+extractedText').lean()
    if (!file) throw new BadRequestError('Content not found')
    const [site, folder] = await Promise.all([
      this.ctx.models.SiteModel.findById(file.site).select('_id name').lean(),
      String(file.parentType) === 'Content'
        ? this.ctx.models.ContentModel.findById(file.parent).select('_id name').lean()
        : null,
    ])
    return {
      ...file,
      id: String(file._id),
      siteId: site ? String(site._id) : String(file.site ?? ''),
      siteName: String(site?.name ?? ''),
      folderId: folder ? String(folder._id) : '',
      folderName: String(folder?.name ?? ''),
    }
  }
}

function getConfiguredChatModel(requested?: string) {
  const defaults = getConfiguredChatModels()
  const configured = requested?.trim() || defaults.defaultModel
  if (!configured) throw new BadRequestError('AI_CHAT_MODEL is not configured')
  if (defaults.models.length > 0 && !defaults.models.includes(configured)) {
    throw new BadRequestError('Requested chat model is not allowed')
  }

  const [provider, ...modelParts] = configured.split(':')
  const modelId = modelParts.join(':')
  if (!provider || !modelId) {
    throw new BadRequestError('AI_CHAT_MODEL must use provider:model, for example openai:gpt-5.6-luna')
  }
  if (provider === 'openai') return { provider, modelId, model: openai(modelId) }
  if (provider === 'anthropic') return { provider, modelId, model: anthropic(modelId) }
  throw new BadRequestError(`Unsupported AI chat provider: ${provider}`)
}

function getConfiguredChatModels() {
  const defaultModel = process.env.AI_CHAT_MODEL ?? process.env.CHAT_MODEL ?? ''
  const models = (process.env.AI_CHAT_MODELS ?? defaultModel)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return {
    defaultModel,
    models: models.includes(defaultModel) || !defaultModel ? models : [defaultModel, ...models],
  }
}

function isSiteAiChatEnabled(site: any) {
  return site.attributes?.ai?.chatEnabled === true
}

function listSiteContent(site: any, folderId: string) {
  const folders = (site.folders ?? [])
    .filter((folder: any) => String(folder.parentId ?? '') === folderId)
    .map((folder: any) => formatFolder(folder, site))
  const rootFiles = (site.files ?? []).map((file: any) => formatFile(file, site, null))
  if (!folderId) return [...folders, ...rootFiles]
  const folder = (site.folders ?? []).find((candidate: any) => String(candidate._id) === folderId)
  if (!folder) return []
  return (folder.files ?? []).map((file: any) => formatFile(file, site, folder))
}

function findSiteContent(site: any, contentId: string) {
  for (const folder of site.folders ?? []) {
    if (String(folder._id) === contentId) return { ...formatFolder(folder, site), folder }
  }
  for (const file of site.files ?? []) {
    if (String(file._id) === contentId) return { ...formatFile(file, site, null), file }
  }
  for (const folder of site.folders ?? []) {
    for (const file of folder.files ?? []) {
      if (String(file._id) === contentId) return { ...formatFile(file, site, folder), file }
    }
  }
  return null
}

function formatFile(file: any, site: any, folder: any) {
  const textAvailable = isContentTextAvailable(file)
  return {
    id: String(file._id),
    contentId: String(file._id),
    fileId: String(file._id),
    name: String(file.name ?? ''),
    kind: 'file',
    siteId: String(site._id),
    siteName: String(site.name ?? ''),
    folderId: folder ? String(folder._id) : '',
    folderName: folder ? String(folder.name ?? '') : '',
    parentId: folder ? String(folder._id) : '',
    size: file.size ?? null,
    contentType: file.contentType ?? null,
    extractionStatus: file.extractionStatus ?? null,
    extractedTextUpdatedAt: file.extractedTextUpdatedAt ?? null,
    textAvailable,
    updatedAt: file.updatedAt ?? file.uploadedAt ?? null,
  }
}

function formatFolder(folder: any, site: any) {
  return {
    id: String(folder._id),
    contentId: String(folder._id),
    folderId: String(folder._id),
    name: String(folder.name ?? ''),
    kind: 'folder',
    siteId: String(site._id),
    siteName: String(site.name ?? ''),
    parentId: folder.parentId ? String(folder.parentId) : '',
    size: null,
    contentType: null,
    fileCount: (folder.files ?? []).length,
    updatedAt: folder.updatedAt ?? folder.createdAt ?? null,
  }
}

function hasPdfText(file: any) {
  return isPdfContent(file.contentType, file.name) &&
    file.extractionStatus === config.content.extractionStatus.complete &&
    Boolean(file.extractedTextKey || file.extractedText)
}

function formatRetrievedFile(file: any) {
  const textAvailable = isContentTextAvailable(file)
  return {
    id: String(file.id ?? file._id ?? ''),
    contentId: String(file.id ?? file._id ?? ''),
    fileId: String(file.id ?? file._id ?? ''),
    name: String(file.name ?? ''),
    kind: 'file',
    siteId: String(file.site ?? ''),
    siteName: String(file.siteName ?? ''),
    folderId: String(file.folderId ?? ''),
    folderName: String(file.folderName ?? ''),
    size: file.size ?? null,
    contentType: file.contentType ?? null,
    extractionStatus: file.extractionStatus ?? null,
    extractedTextUpdatedAt: file.extractedTextUpdatedAt ?? null,
    textAvailable,
    updatedAt: file.updatedAt ?? file.uploadedAt ?? null,
  }
}

async function executeSiteChatTool<T>(toolName: string, context: Record<string, unknown>, execute: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await execute()
  } catch (error) {
    logSiteChatError(toolName, error, context)
    return { error: isExpectedChatError(error) ? getErrorMessage(error) : 'The tool failed. Please try again.' }
  }
}

function isExpectedChatError(error: unknown) {
  return typeof (error as { statusCode?: unknown } | null)?.statusCode === 'number' &&
    Number((error as { statusCode: number }).statusCode) >= 400 &&
    Number((error as { statusCode: number }).statusCode) < 500
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'The AI response failed.')
}

function logSiteChatError(scope: string, error: unknown, context: Record<string, unknown>) {
  const message = getErrorMessage(error)
  console.error('[clearideas-ce:site-chat]', {
    scope,
    ...context,
    name: error instanceof Error ? error.name : typeof error,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  })
}
