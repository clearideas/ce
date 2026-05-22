import { Router } from 'express'
import { AccessKeyController } from '../../controllers/access-key/access-key.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody, validateParams } from '../../middleware/validation.js'
import {
  accessKeyCreateSchema,
  accessKeyIdParamSchema,
  accessKeyUpdateSchema,
} from '../../validation/core/schemas.js'

export function buildAccessKeyRoutes(ctx: CeAppContext) {
  const router = Router()
  const controller = new AccessKeyController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)

  router.get('/account/access-keys', attachAuthContext, requireAuthContext, asyncHandler(controller.list))
  router.get('/account/access-keys/types', attachAuthContext, requireAuthContext, asyncHandler(controller.types))
  router.post(
    '/account/access-keys',
    attachAuthContext,
    requireAuthContext,
    validateBody(accessKeyCreateSchema),
    asyncHandler(controller.create),
  )
  router.patch(
    '/account/access-keys/:keyId',
    attachAuthContext,
    requireAuthContext,
    validateParams(accessKeyIdParamSchema),
    validateBody(accessKeyUpdateSchema),
    asyncHandler(controller.update),
  )
  router.delete(
    '/account/access-keys/:keyId',
    attachAuthContext,
    requireAuthContext,
    validateParams(accessKeyIdParamSchema),
    asyncHandler(controller.revoke),
  )

  return router
}
