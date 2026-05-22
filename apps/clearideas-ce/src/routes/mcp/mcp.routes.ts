import { Router } from 'express'
import { McpController } from '../../controllers/mcp/mcp.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import { buildAccessKeyAuthMiddleware } from '../../middleware/access-key-auth.js'
import { validateBody } from '../../middleware/validation.js'
import { mcpRequestBodySchema } from '../../validation/core/schemas.js'

export function buildMcpRoutes(ctx: CeAppContext) {
  const router = Router()
  const controller = new McpController(ctx)
  const accessKeyAuth = buildAccessKeyAuthMiddleware(ctx)

  router.use('/mcp', mcpCors)
  router.get('/mcp', asyncHandler(controller.status))
  router.options('/mcp', (_req, res) => res.sendStatus(204))
  router.post(
    '/mcp',
    validateBody(mcpRequestBodySchema),
    asyncHandler(async (req, res, next) => {
      if (isInitializationCall(req.body)) {
        await controller.handle(req, res)
        return
      }
      next()
    }),
    accessKeyAuth,
    asyncHandler(controller.handle),
  )

  return router
}

function isInitializationCall(body: any) {
  const method = typeof body?.method === 'string' ? body.method : ''
  return [
    'initialize',
    'notifications/initialized',
  ].includes(method)
}

function mcpCors(req: any, res: any, next: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
}
