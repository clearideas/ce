import { ChatTurnRequestSchema } from '@clearideas/contracts-core'
import type { UIMessage } from 'ai'
import type { ChatMessage, ChatSource } from '../types/domain'

/** A chat message in the AI SDK shape: text, plus the answer's sources as a `data-sources` part. */
export type ChatUIMessage = UIMessage<
  unknown,
  { sources: ChatSource[]; status: { label: string }; conversation: ConversationInfo }
>

export type ConversationInfo = { id: string; title: string; siteId: string | null }

/** Stored messages → the chat's messages. */
export function toUIMessages(messages: ChatMessage[]): ChatUIMessage[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    parts: [
      { type: 'text' as const, text: message.text },
      ...(message.sources.length > 0 ? [{ type: 'data-sources' as const, data: message.sources }] : []),
    ],
  }))
}

export function messageText(message: Pick<ChatUIMessage, 'parts'>) {
  return (message.parts ?? []).map(part => (part.type === 'text' ? part.text : '')).join('')
}

export function messageSources(message: Pick<ChatUIMessage, 'parts'>): ChatSource[] {
  const part = (message.parts ?? []).find(candidate => candidate.type === 'data-sources')
  return part && 'data' in part ? (part.data as ChatSource[]) : []
}

/** Messages worth showing: those with text, and the answer being written while the chat is busy. */
export function visibleMessages(messages: ChatUIMessage[], busy: boolean) {
  return messages.filter(
    (message, index) =>
      messageText(message).trim().length > 0 ||
      (busy && index === messages.length - 1 && message.role === 'assistant'),
  )
}

/** The body of one chat turn: the server keeps the conversation, so only the new question is sent. */
export function chatTurnBody(input: {
  conversationId?: string | null
  siteId?: string
  message: { id: string; text: string }
  model?: string
}) {
  const payload = {
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.siteId && !input.conversationId ? { siteId: input.siteId } : {}),
    message: input.message,
    ...(input.model ? { model: input.model } : {}),
  }
  const result = ChatTurnRequestSchema.safeParse(payload)
  if (!result.success) {
    throw new Error(result.error.issues.map(issue => issue.message).join('; ') || 'Invalid chat message.')
  }
  return result.data
}
