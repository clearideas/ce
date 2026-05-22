import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../../config/index.js'
import { AnalyticsController } from '../../controllers/analytics/analytics.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import {
  buildAttachPermittedSiteIds,
  buildRequireSiteAdmin,
} from '../../middleware/access-control.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js'
import { analyticsFilterSchema, siteIdParamSchema } from '../../validation/core/schemas.js'

export function buildAnalyticsRoutes(ctx: CeAppContext) {
  const router = Router()
  router.use(
    rateLimit({
      windowMs: Number(process.env.CLEARIDEAS_ANALYTICS_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.CLEARIDEAS_ANALYTICS_RATE_LIMIT_LIMIT ?? 300),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )
  const controller = new AnalyticsController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)
  const requireSiteAdmin = buildRequireSiteAdmin(ctx.models)
  const attachAdminSiteIds = buildAttachPermittedSiteIds(ctx.models, config.site.roles.adminRoles)

  router.post(
    '/analytics/most-active',
    attachAuthContext,
    requireAuthContext,
    validateBody(analyticsFilterSchema),
    attachAdminSiteIds,
    asyncHandler(controller.postMostActiveUsers),
  )
  router.post(
    '/site/:siteId/analytics/most-active',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    validateBody(analyticsFilterSchema),
    requireSiteAdmin,
    asyncHandler(controller.postMostActiveUsers),
  )
  router.post(
    '/analytics/most-accessed',
    attachAuthContext,
    requireAuthContext,
    validateBody(analyticsFilterSchema),
    attachAdminSiteIds,
    asyncHandler(controller.postMostAccessed),
  )
  router.post(
    '/analytics/usage-times',
    attachAuthContext,
    requireAuthContext,
    validateBody(analyticsFilterSchema),
    attachAdminSiteIds,
    asyncHandler(controller.postUsageTimes),
  )
  router.post(
    '/analytics/content-activity',
    attachAuthContext,
    requireAuthContext,
    validateBody(analyticsFilterSchema),
    attachAdminSiteIds,
    asyncHandler(controller.postContentActivity),
  )
  router.post(
    '/analytics/monthly-active-users',
    attachAuthContext,
    requireAuthContext,
    validateBody(analyticsFilterSchema),
    attachAdminSiteIds,
    asyncHandler(controller.postMonthlyActiveUsers),
  )
  router.get(
    '/analytics/dashboard',
    attachAuthContext,
    requireAuthContext,
    validateQuery(analyticsFilterSchema),
    attachAdminSiteIds,
    asyncHandler(controller.getDashboard),
  )

  return router
}
