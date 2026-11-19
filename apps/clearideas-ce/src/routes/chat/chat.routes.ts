import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { ChatController } from '../../controllers/chat/chat.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js'
import type { ChatService } from '../../services/chat/chat-service.js'
import {
  chatConversationIdParamSchema,
  chatConversationPatchSchema,
  chatConversationsQuerySchema,
  chatTurnSchema,
} from '../../validation/core/schemas.js'

export function buildChatRoutes(ctx: CeAppContext, chat: ChatService) {
  const router = Router()
  router.use(
    '/chat',
    rateLimit({
      windowMs: Number(process.env.CLEARIDEAS_CHAT_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.CLEARIDEAS_CHAT_RATE_LIMIT_LIMIT ?? 120),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )
  const controller = new ChatController(ctx, chat)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)

  router.get('/chat/models', attachAuthContext, requireAuthContext, asyncHandler(controller.models))
  router.get('/chat/sites', attachAuthContext, requireAuthContext, asyncHandler(controller.sites))
  router.get(
    '/chat/conversations',
    attachAuthContext,
    requireAuthContext,
    validateQuery(chatConversationsQuerySchema),
    asyncHandler(controller.list),
  )
  router.get(
    '/chat/conversations/:conversationId',
    attachAuthContext,
    requireAuthContext,
    validateParams(chatConversationIdParamSchema),
    asyncHandler(controller.get),
  )
  router.patch(
    '/chat/conversations/:conversationId',
    attachAuthContext,
    requireAuthContext,
    validateParams(chatConversationIdParamSchema),
    validateBody(chatConversationPatchSchema),
    asyncHandler(controller.rename),
  )
  router.delete(
    '/chat/conversations/:conversationId',
    attachAuthContext,
    requireAuthContext,
    validateParams(chatConversationIdParamSchema),
    asyncHandler(controller.remove),
  )
  router.post(
    '/chat',
    attachAuthContext,
    requireAuthContext,
    validateBody(chatTurnSchema),
    asyncHandler(controller.turn),
  )

  return router
}
