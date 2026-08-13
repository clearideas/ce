import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { AgentController } from '../../controllers/agent/agent.controller.js'
import { AgentScheduleController } from '../../controllers/agent/agent-schedule.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js'
import {
  agentCreateSchema,
  agentIdParamSchema,
  agentRunCreateSchema,
  agentRunIdParamSchema,
  agentRunsQuerySchema,
  agentScheduleCreateSchema,
  agentScheduleIdParamSchema,
  agentScheduleUpdateSchema,
  agentUpdateSchema,
  emptyObjectSchema,
} from '../../validation/core/schemas.js'
import type { AgentHostService } from '../../services/agent/agent-host.js'

export function buildAgentRoutes(ctx: CeAppContext, agentHost: AgentHostService) {
  const router = Router()
  router.use(
    rateLimit({
      windowMs: Number(process.env.CLEARIDEAS_AGENT_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.CLEARIDEAS_AGENT_RATE_LIMIT_LIMIT ?? 120),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )
  const controller = new AgentController(ctx, agentHost)
  const schedules = new AgentScheduleController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)

  router.get('/agents', attachAuthContext, requireAuthContext, asyncHandler(controller.list))
  router.post('/agents', attachAuthContext, requireAuthContext, validateBody(agentCreateSchema), asyncHandler(controller.create))
  router.get(
    '/agents/:agentId',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentIdParamSchema),
    asyncHandler(controller.get),
  )
  router.patch(
    '/agents/:agentId',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentIdParamSchema),
    validateBody(agentUpdateSchema),
    asyncHandler(controller.update),
  )
  router.delete(
    '/agents/:agentId',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentIdParamSchema),
    asyncHandler(controller.remove),
  )
  router.post(
    '/agents/:agentId/runs',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentIdParamSchema),
    validateBody(agentRunCreateSchema),
    asyncHandler(controller.run),
  )
  router.get('/agent-runs', attachAuthContext, requireAuthContext, validateQuery(agentRunsQuerySchema), asyncHandler(controller.listRuns))
  router.get(
    '/agent-runs/:runId',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentRunIdParamSchema),
    asyncHandler(controller.getRun),
  )
  router.post(
    '/agent-runs/:runId/resume',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentRunIdParamSchema),
    validateBody(emptyObjectSchema),
    asyncHandler(controller.resume),
  )

  router.get(
    '/agents/:agentId/schedules',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentIdParamSchema),
    asyncHandler(schedules.list),
  )
  router.post(
    '/agents/:agentId/schedules',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentIdParamSchema),
    validateBody(agentScheduleCreateSchema),
    asyncHandler(schedules.create),
  )
  router.patch(
    '/agent-schedules/:scheduleId',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentScheduleIdParamSchema),
    validateBody(agentScheduleUpdateSchema),
    asyncHandler(schedules.update),
  )
  router.delete(
    '/agent-schedules/:scheduleId',
    attachAuthContext,
    requireAuthContext,
    validateParams(agentScheduleIdParamSchema),
    asyncHandler(schedules.remove),
  )

  return router
}
