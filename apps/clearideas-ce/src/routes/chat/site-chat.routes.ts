import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { SiteChatController } from '../../controllers/chat/site-chat.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { buildRequireSiteRead } from '../../middleware/access-control.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody, validateParams } from '../../middleware/validation.js'
import { siteChatBodySchema, siteIdParamSchema } from '../../validation/core/schemas.js'

export function buildSiteChatRoutes(ctx: CeAppContext) {
  const router = Router()
  router.use(
    rateLimit({
      windowMs: Number(process.env.CLEARIDEAS_CHAT_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.CLEARIDEAS_CHAT_RATE_LIMIT_LIMIT ?? 120),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )
  const controller = new SiteChatController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)
  const requireSiteRead = buildRequireSiteRead(ctx.models)

  router.get('/chat/models', attachAuthContext, requireAuthContext, asyncHandler(controller.models))

  router.post(
    '/sites/:siteId/chat',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    validateBody(siteChatBodySchema),
    requireSiteRead,
    asyncHandler(controller.chat),
  )

  return router
}
