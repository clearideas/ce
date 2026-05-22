import { toNodeHandler } from 'better-auth/node'
import { Router } from 'express'
import { AuthController } from '../../controllers/auth/auth.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody } from '../../middleware/validation.js'
import { authCodeSendSchema, authCodeVerifySchema, emptyObjectSchema } from '../../validation/core/schemas.js'

export function buildAuthRoutes(ctx: CeAppContext) {
  const router = Router()
  const controller = new AuthController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)

  router.post('/code/send', validateBody(authCodeSendSchema), asyncHandler(controller.sendCode))
  router.post('/code/verify', validateBody(authCodeVerifySchema), asyncHandler(controller.verifyCode))
  router.post('/logout', attachAuthContext, requireAuthContext, validateBody(emptyObjectSchema), asyncHandler(controller.logout))
  router.get('/session', attachAuthContext, requireAuthContext, asyncHandler(controller.session))
  router.all('/{*any}', toNodeHandler(ctx.auth))

  return router
}
