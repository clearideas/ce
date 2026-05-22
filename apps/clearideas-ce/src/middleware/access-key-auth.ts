import { ForbiddenError, UnauthorizedError } from '@clearideas/core/errors'
import { hashAccessKeyValue } from '@clearideas/core'
import type { NextFunction, Request, Response } from 'express'
import type { CeAppContext } from '../lib/app-context.js'

export function buildAccessKeyAuthMiddleware(ctx: CeAppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = String(req.headers.authorization ?? '')
      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Bearer token required')
      }
      const token = authHeader.slice('Bearer '.length).trim()
      if (!token) throw new UnauthorizedError('Invalid bearer token')
      const keyHash = hashAccessKeyValue(token)
      const accessKey = await ctx.models.AccessKeyModel.findOne({
        keyHash,
        isActive: true,
      }).lean()
      if (!accessKey) throw new UnauthorizedError('Invalid access key')
      if (accessKey.expiresAt && new Date(accessKey.expiresAt) <= new Date()) {
        throw new UnauthorizedError('Access key expired')
      }
      if (accessKey.keyType !== 'mcp') {
        throw new UnauthorizedError('Invalid key type for MCP endpoint')
      }
      const scopes = accessKey.scopes ?? []
      const hasReadScope = scopes.includes('mcp:read')
      if (!hasReadScope) {
        throw new ForbiddenError('Access key missing required MCP read scope')
      }
      const account = await ctx.models.AccountModel.findById(accessKey.accountId).lean()
      if (!account) throw new UnauthorizedError('Associated account not found')
      const user = await ctx.models.UserModel.findById(account.owner).lean()
      if (!user) throw new UnauthorizedError('Associated user not found')

      req.accessKey = {
        _id: accessKey._id,
        accountId: accessKey.accountId,
        keyType: accessKey.keyType,
        scopes,
        siteId: accessKey.siteId,
        metadata: accessKey.metadata,
      } as any
      req.accountId = accessKey.accountId as any
      req.account = account as any
      req.sub = account.owner as any
      req.user = user as any
      void ctx.models.AccessKeyModel.updateOne(
        { _id: accessKey._id },
        {
          $set: {
            lastUsedAt: new Date(),
            'metadata.lastUsedIp': req.ip,
            'metadata.userAgent': req.get('User-Agent'),
          },
        },
      ).catch(() => undefined)
      next()
    } catch (error) {
      next(error)
    }
  }
}
