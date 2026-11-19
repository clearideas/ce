import { BadRequestError, NotFoundError } from '@clearideas/core/errors'
import type { ChatTurnRequest } from '@clearideas/contracts-core'
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai'
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import type { CeAppContext } from '../../lib/app-context.js'
import { INSTRUCTION_LEAK_REFUSAL, isInstructionLeakAttempt } from '../../lib/instruction-leak-guard.js'
import { MAX_CHAT_MESSAGES } from '../../models/chat.js'
import { configuredChatModels } from '../../services/chat/chat-models.js'
import type { ChatService } from '../../services/chat/chat-service.js'
import type { ChatScopeSite, ChatSource } from '../../services/chat/chat-tools.js'

interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
  model?: string
  createdAt: Date
}

/**
 * Chat (Ask and Site AI). Conversations are stored per user; `POST /chat` runs one turn on the agent
 * runtime and streams it as an AI SDK UI message stream:
 *
 * - `data-conversation` (transient): the conversation the turn belongs to (new ones get an id);
 * - `data-status` (transient): what the assistant is doing ("Searching for …");
 * - text parts, then `data-sources`: the files the answer is based on.
 */
export class ChatController {
  constructor(
    private readonly ctx: CeAppContext,
    private readonly chat: ChatService,
  ) {}

  models = async (_req: Request, res: Response) => {
    res.json({ ...configuredChatModels(), configured: this.chat.isConfigured() })
  }

  /** Sites an all-sites conversation uses: readable by the user, AI chat on, not blocked. */
  sites = async (req: Request, res: Response) => {
    const sites = await this.chat.scopeSites(await this.access(req))
    res.json({ sites })
  }

  list = async (req: Request, res: Response) => {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined
    const rows = await this.ctx.models.ChatConversationModel.find({
      userId: req.sub,
      ...(siteId ? { siteId } : {}),
    })
      .select('_id title siteId updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean()
    res.json({ conversations: rows.map(serializeSummary) })
  }

  get = async (req: Request, res: Response) => {
    const row = await this.findConversation(req)
    res.json({ conversation: { ...serializeSummary(row), messages: row.messages.map(serializeMessage) } })
  }

  rename = async (req: Request, res: Response) => {
    const row = await this.ctx.models.ChatConversationModel.findOneAndUpdate(
      { _id: req.params.conversationId, userId: req.sub },
      { $set: { title: String(req.body.title) } },
      { returnDocument: 'after', lean: true },
    )
    if (!row) throw new NotFoundError('Conversation not found.')
    res.json({ conversation: serializeSummary(row) })
  }

  remove = async (req: Request, res: Response) => {
    const deleted = await this.ctx.models.ChatConversationModel.deleteOne({
      _id: req.params.conversationId,
      userId: req.sub,
    })
    if (deleted.deletedCount === 0) throw new NotFoundError('Conversation not found.')
    res.status(204).end()
  }

  turn = async (req: Request, res: Response) => {
    const body = req.body as ChatTurnRequest
    const access = await this.access(req)
    const existing = body.conversationId ? await this.findConversation(req, body.conversationId) : null
    const siteId = existing ? (existing.siteId ? String(existing.siteId) : undefined) : body.siteId
    const sites: ChatScopeSite[] = await this.chat.scopeSites(access, siteId)
    if (sites.length === 0) {
      throw new BadRequestError(
        'None of your sites has AI chat turned on. A site admin can turn it on in Site settings → AI.',
      )
    }
    if (!this.chat.isConfigured()) throw new BadRequestError('AI chat is not configured on this server.')
    if (existing && existing.messages.length >= MAX_CHAT_MESSAGES) {
      throw new BadRequestError('This conversation is full. Start a new one.')
    }

    const question: StoredMessage = {
      id: body.message.id,
      role: 'user',
      text: body.message.text,
      createdAt: new Date(),
    }
    const conversation =
      existing ??
      (
        await this.ctx.models.ChatConversationModel.create({
          accountId: req.accountId,
          userId: req.sub,
          ...(siteId ? { siteId } : {}),
          title: titleFrom(question.text),
          messages: [],
        })
      ).toObject()
    const conversationId = String(conversation._id)
    const history = (existing?.messages ?? []).map((message: StoredMessage) => ({
      role: message.role,
      text: message.text,
    }))
    await this.append(conversationId, [question])

    const abort = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) abort.abort()
    })
    const answerId = `msg_${randomUUID()}`
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'start', messageId: answerId })
        writer.write({
          type: 'data-conversation',
          data: { id: conversationId, title: conversation.title, siteId: siteId ?? null },
          transient: true,
        })
        const textId = `text_${answerId}`
        let started = false
        const writeText = (delta: string) => {
          if (!started) {
            writer.write({ type: 'text-start', id: textId })
            started = true
          }
          writer.write({ type: 'text-delta', id: textId, delta })
        }

        let answer: StoredMessage
        if (isInstructionLeakAttempt(question.text)) {
          writeText(INSTRUCTION_LEAK_REFUSAL)
          answer = {
            id: answerId,
            role: 'assistant',
            text: INSTRUCTION_LEAK_REFUSAL,
            sources: [],
            createdAt: new Date(),
          }
        } else {
          const result = await this.chat.runTurn({
            access,
            sites,
            history,
            question: question.text,
            model: body.model,
            signal: abort.signal,
            onText: writeText,
            onActivity: label => writer.write({ type: 'data-status', data: { label }, transient: true }),
          })
          answer = {
            id: answerId,
            role: 'assistant',
            text: result.text,
            sources: result.sources,
            model: result.model,
            createdAt: new Date(),
          }
        }
        if (started) writer.write({ type: 'text-end', id: textId })
        if (answer.sources?.length) writer.write({ type: 'data-sources', data: answer.sources })
        await this.append(conversationId, [answer])
        writer.write({ type: 'finish' })
      },
      onError: error => {
        logChatError(error, { conversationId })
        return chatErrorMessage(error)
      },
    })
    pipeUIMessageStreamToResponse({ response: res as any, stream })
  }

  private async append(conversationId: string, messages: StoredMessage[]) {
    await this.ctx.models.ChatConversationModel.updateOne(
      { _id: conversationId },
      { $push: { messages: { $each: messages } } },
    )
  }

  private async access(req: Request) {
    const user = await this.ctx.models.UserModel.findById(String(req.sub))
      .select('attributes.sites.suppressedSites')
      .lean()
    return {
      accountId: String(req.accountId),
      userId: String(req.sub),
      suppressedSiteIds: ((user as any)?.attributes?.sites?.suppressedSites ?? []).map(String),
    }
  }

  private async findConversation(req: Request, conversationId = String(req.params.conversationId)) {
    const row = await this.ctx.models.ChatConversationModel.findOne({
      _id: conversationId,
      userId: req.sub,
    }).lean()
    if (!row) throw new NotFoundError('Conversation not found.')
    return row
  }
}

function titleFrom(text: string) {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

function serializeSummary(row: any) {
  return {
    id: String(row._id),
    title: String(row.title ?? ''),
    siteId: row.siteId ? String(row.siteId) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function serializeMessage(message: StoredMessage) {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    sources: message.sources ?? [],
    createdAt: message.createdAt,
  }
}

function chatErrorMessage(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'RUN_SUSPENDED') {
    return 'This question needed more work than one answer allows. Try a narrower question.'
  }
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500 && error instanceof Error)
    return error.message
  return 'The AI response failed. Please try again.'
}

function logChatError(error: unknown, context: Record<string, unknown>) {
  console.error('[clearideas-ce:chat]', {
    ...context,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  })
}
