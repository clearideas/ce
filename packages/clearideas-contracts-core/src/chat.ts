import { objectIdString, optionalTrimmedString, requiredTrimmedString, z } from './primitives.js'

/** Legacy per-site chat request (AI SDK UI messages). Kept for compatibility; CE uses `ChatTurnRequestSchema`. */
export const SiteChatRequestSchema = z.strictObject({
  messages: z.array(z.unknown()).min(1, { error: 'messages are required' }),
  model: optionalTrimmedString(120),
})

export type SiteChatRequest = z.infer<typeof SiteChatRequestSchema>

/** Longest question accepted in one chat turn. */
export const MAX_CHAT_MESSAGE_LENGTH = 8000

/**
 * One chat turn (`POST /api/chat`). The server keeps the conversation: the client sends only the new
 * message. Without `conversationId` a conversation is created, scoped to `siteId` or, without it, to
 * every site the user can read that has AI chat turned on.
 */
export const ChatTurnRequestSchema = z.strictObject({
  conversationId: objectIdString.optional(),
  siteId: objectIdString.optional(),
  message: z.strictObject({
    id: requiredTrimmedString('message id', 120),
    text: requiredTrimmedString('message', MAX_CHAT_MESSAGE_LENGTH),
  }),
  model: optionalTrimmedString(120),
})

export type ChatTurnRequest = z.infer<typeof ChatTurnRequestSchema>

export const ChatConversationPatchRequestSchema = z.strictObject({
  title: requiredTrimmedString('title', 120),
})

export type ChatConversationPatchRequest = z.infer<typeof ChatConversationPatchRequestSchema>

export const ChatConversationsQuerySchema = z.strictObject({
  siteId: objectIdString.optional(),
})

export const chatConversationIdParamSchema = z.strictObject({
  conversationId: objectIdString,
})
