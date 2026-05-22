import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { ActivityController } from '../../controllers/activity/activity.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { buildRequireActivityTargetRead } from '../../middleware/access-control.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody } from '../../middleware/validation.js'
import { activityCreateSchema } from '../../validation/core/schemas.js'

export function buildActivityRoutes(ctx: CeAppContext) {
  const router = Router()
  router.use(
    rateLimit({
      windowMs: Number(process.env.CLEARIDEAS_ACTIVITY_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.CLEARIDEAS_ACTIVITY_RATE_LIMIT_LIMIT ?? 600),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )
  const controller = new ActivityController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)
  const requireActivityTargetRead = buildRequireActivityTargetRead(ctx.models)

  router.post(
    '/activities',
    attachAuthContext,
    requireAuthContext,
    validateBody(activityCreateSchema),
    requireActivityTargetRead,
    asyncHandler(controller.postActivity),
  )

  return router
}
