import {
  authorizeFileAccess,
  hasSiteRole,
  verifyFileAccessToken,
  verifyUploadToken,
  type FileAccessPurpose,
} from '@clearideas/core'
import { ForbiddenError, UnauthorizedError } from '@clearideas/core/errors'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config/index.js'
import type { CeAppContext } from '../lib/app-context.js'

export { createFileAccessToken, createUploadToken, type FileAccessPurpose } from '@clearideas/core'

export function buildFileAccessTokenMiddleware(ctx: CeAppContext, purpose: FileAccessPurpose) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : ''
      if (!token) throw new UnauthorizedError('File access token is required')

      const payload = verifyFileAccessToken({
        token,
        secret: fileAccessTokenSecret(),
        expectedPurpose: purpose,
        routeFileId: String(req.params.fileId ?? ''),
      })

      const [site, account, file] = await Promise.all([
        ctx.models.SiteModel.findById(payload.siteId).lean(),
        ctx.models.AccountModel.findOne({ owner: payload.sub }).select('_id').lean(),
        ctx.models.ContentModel.findById(payload.fileId).lean(),
      ])
      const { role } = authorizeFileAccess({
        payload,
        site,
        file,
        accountId: String(account?._id ?? ''),
        roles: config.site.roles,
        allowPublicViewer: true,
      })

      req.sub = payload.sub as any
      req.site = site
      req.siteRole = role
      req.fileId = file._id as any
      req.fileAccessPurpose = purpose
      req.fileAccess = { file, token: payload }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function buildUploadTokenMiddleware(ctx: CeAppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const payload = verifyUploadToken({
        token: String(req.headers['x-clearideas-upload-token'] ?? ''),
        secret: uploadSigningSecret(),
      })
      if (!req.params.fileId || String(req.params.fileId) !== payload.fileId) {
        throw new UnauthorizedError('Invalid upload URL')
      }
      const site = await ctx.models.SiteModel.findById(payload.siteId).lean()
      if (!site) throw new ForbiddenError('Site access denied')
      const { allowed, role } = hasSiteRole({
        site,
        accountId: String((await ctx.models.AccountModel.findOne({ owner: payload.userId }).select('_id').lean())?._id ?? ''),
        userId: payload.userId,
        permittedRoles: config.site.roles.uploaderRoles,
        roles: config.site.roles,
      })
      if (!allowed) throw new ForbiddenError('Site access denied')
      if (payload.folderId) {
        const folder = await ctx.models.ContentModel.findOne({
          _id: payload.folderId,
          site: payload.siteId,
          kind: 'Folder',
          status: config.content.status.active,
        }).select('_id').lean()
        if (!folder) throw new ForbiddenError('Folder access denied')
      }
      req.sub = payload.userId as any
      req.site = site
      req.siteRole = role
      req.uploadTarget = payload
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function fileAccessTokenSecret() {
  return config.tokens.fileAccessSecret()
}

export function uploadSigningSecret() {
  return config.tokens.uploadSigningSecret()
}
