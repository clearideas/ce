import { ForbiddenError } from '@clearideas/core/errors'
import {
  castSiteQueryIds,
  getPermittedSiteIdsBase,
  hasSiteRole,
  normalizeStringArray,
} from '@clearideas/core'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config/index.js'

type Models = {
  SiteModel: {
    findById: (id: string) => { lean: () => Promise<any | null> }
    find: (query: Record<string, unknown>) => { select: (projection: string) => { lean: () => Promise<any[]> } }
  }
  ContentModel: {
    findById: (id: string) => { select: (projection: string) => { lean: () => Promise<any | null> } }
    findOne: (query: Record<string, unknown>) => { select: (projection: string) => { lean: () => Promise<any | null> } }
  }
}

export function isAccountAdmin(req: Request) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : []
  if (roles.some(role => config.site.roles.adminRoles.includes(String(role) as any))) return true
  return !!req.account?.owner && !!req.sub && String(req.account.owner) === String(req.sub)
}

export function requireAccountAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!isAccountAdmin(req)) return next(new ForbiddenError('Owner or admin access is required.'))
  next()
}

export function buildRequireSiteAdmin(models: Models) {
  return buildVerifySiteRole(models, config.site.roles.adminRoles)
}

export function buildRequireSiteRead(models: Models) {
  return buildVerifySiteRole(models, config.site.roles.allNonDisabledRoles, { allowPublicViewer: true })
}

export function buildRequireSiteUploader(models: Models) {
  return buildVerifySiteRole(models, config.site.roles.uploaderRoles)
}

export function buildRequireSiteEditor(models: Models) {
  return buildVerifySiteRole(models, config.site.roles.editorRoles)
}

export function buildAttachPermittedSiteIds(models: Models, roles: readonly string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.accountId) return next(new ForbiddenError())
      if (!req.sub) return next(new ForbiddenError())

      const requestedSites = normalizeStringArray(
        req.body?.sites ??
        req.query?.sites ??
        req.body?.siteIds ??
        req.query?.siteIds ??
        req.body?.siteId ??
        req.query?.siteId ??
        req.params.siteId,
      )
      req.permittedSiteIds = await getPermittedSiteIdsBase(
        {
          findSiteIds: async query => {
            const rows = await models.SiteModel.find(castSiteQueryIds(query)).select('_id').lean()
            return rows.map((site: any) => String(site._id))
          },
        },
        {
          accountId: String(req.accountId),
          userId: String(req.sub),
          roles,
          ownerRoles: config.site.roles.ownerRoles,
          siteIds: requestedSites.length > 0 ? requestedSites : undefined,
        },
      )
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function buildRequireUploadTargetUploader(models: Models) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const siteId = String(req.body?.siteId ?? '')
      const folderId = req.body?.folderId ? String(req.body.folderId) : ''
      await verifySiteRoleById({
        models,
        req,
        siteId,
        permittedRoles: config.site.roles.uploaderRoles,
      })
      if (folderId) await assertFolderBelongsToSite(models, { siteId, folderId })
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function buildRequireActivityTargetRead(models: Models) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const siteId = await resolveActivitySiteId(models, req)
      if (!siteId) return next()
      await verifySiteRoleById({
        models,
        req,
        siteId,
        permittedRoles: config.site.roles.allNonDisabledRoles,
        allowPublicViewer: true,
      })
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function buildVerifySiteRole(models: Models, permittedRoles: readonly string[], options: { allowPublicViewer?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const siteId = String(req.params.siteId ?? '')
      await verifySiteRoleById({ models, req, siteId, permittedRoles, allowPublicViewer: options.allowPublicViewer })
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

async function verifySiteRoleById(input: {
  models: Models
  req: Request
  siteId: string
  permittedRoles: readonly string[]
  allowPublicViewer?: boolean
}) {
  if (!input.req.accountId) throw new ForbiddenError()
  if (!input.req.sub) throw new ForbiddenError()

  const site = input.siteId ? await input.models.SiteModel.findById(input.siteId).lean() : null
  if (!site) throw new ForbiddenError('Site access denied')

  let { allowed, role } = hasSiteRole({
    site,
    accountId: input.req.accountId,
    userId: input.req.sub,
    permittedRoles: input.permittedRoles,
    roles: config.site.roles,
  })
  if (!allowed && input.allowPublicViewer && site.visibility === config.site.visibility.public && input.permittedRoles.includes(config.site.role.viewer)) {
    allowed = true
    role = config.site.role.viewer
  }
  if (!allowed) throw new ForbiddenError()

  input.req.site = site
  input.req.siteRole = role
}

export async function assertSiteReadAccess(input: {
  models: Models
  accountId: string
  userId: string
  siteId: string
}) {
  const site = await input.models.SiteModel.findById(input.siteId).lean()
  if (!site) throw new ForbiddenError('Site access denied')
  const { allowed } = hasSiteRole({
    site,
    accountId: input.accountId,
    userId: input.userId,
    permittedRoles: config.site.roles.allNonDisabledRoles,
    roles: config.site.roles,
  })
  const publicAccess =
    site.visibility === config.site.visibility.public &&
    config.site.roles.allNonDisabledRoles.includes(config.site.role.viewer)
  if (!allowed && !publicAccess) throw new ForbiddenError('Site access denied')
  return site
}

async function assertFolderBelongsToSite(models: Models, input: { siteId: string; folderId: string }) {
  const folder = await models.ContentModel.findOne({
    _id: input.folderId,
    site: input.siteId,
    kind: 'Folder',
    status: config.content.status.active,
  }).select('_id').lean()
  if (!folder) throw new ForbiddenError('Folder access denied')
}

async function resolveActivitySiteId(models: Models, req: Request) {
  if (req.body.parentOnModel === 'Site' && req.body.parent) return String(req.body.parent)
  if (req.body.onModel === 'Site' && req.body.target) return String(req.body.target)
  if (req.body.onModel === 'Content' && req.body.target) {
    const content = await models.ContentModel.findById(req.body.target).select('site').lean()
    if (!content) throw new ForbiddenError('Site access denied')
    return String(content.site)
  }
  return ''
}
