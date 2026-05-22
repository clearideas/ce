import { Router } from 'express'
import { NotificationController } from '../../controllers/notification/notification.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody } from '../../middleware/validation.js'
import { notificationSendSchema, notificationTemplateSendSchema } from '../../validation/core/schemas.js'

export function buildNotificationRoutes(ctx: CeAppContext) {
  const router = Router()
  const controller = new NotificationController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)

  router.post('/notifications/send', attachAuthContext, requireAuthContext, validateBody(notificationSendSchema), asyncHandler(controller.send))
  router.post('/notifications/template/send', attachAuthContext, requireAuthContext, validateBody(notificationTemplateSendSchema), asyncHandler(controller.sendTemplate))

  return router
}
