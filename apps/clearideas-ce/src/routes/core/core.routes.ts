import express, { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../../config/index.js'
import { CoreController } from '../../controllers/core/core.controller.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { asyncHandler } from '../../middleware/async-handler.js'
import {
  buildRequireSiteAdmin,
  buildRequireSiteEditor,
  buildRequireSiteRead,
  buildRequireSiteUploader,
  buildRequireUploadTargetUploader,
  buildAttachPermittedSiteIds,
  requireAccountAdmin,
} from '../../middleware/access-control.js'
import { buildAuthContextMiddleware, requireAuthContext } from '../../middleware/auth-context.js'
import {
  buildFileAccessTokenMiddleware,
  buildUploadTokenMiddleware,
} from '../../middleware/file-access-token.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js'
import {
  fileIdParamSchema,
  fileTokenQuerySchema,
  fileUploadTargetSchema,
  folderCreateSchema,
  binaryUploadBodySchema,
  emptyObjectSchema,
  nonEmptyNameSchema,
  accountPatchSchema,
  profilePatchSchema,
  contentSearchBodySchema,
  siteAndFolderParamsSchema,
  siteAndFileParamsSchema,
  siteAndUserParamsSchema,
  siteIdParamSchema,
  sitePatchSchema,
  userCreateSchema,
  idParamSchema,
  userIdParamSchema,
  userPatchSchema,
  siteUserPatchSchema,
  userGroupCreateSchema,
  userGroupUserParamsSchema,
  userGroupUsersSchema,
} from '../../validation/core/schemas.js'

export function buildCoreRoutes(ctx: CeAppContext) {
  const router = Router()
  router.use(
    rateLimit({
      windowMs: Number(process.env.CLEARIDEAS_CORE_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
      limit: Number(process.env.CLEARIDEAS_CORE_RATE_LIMIT_LIMIT ?? 600),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )
  const controller = new CoreController(ctx)
  const attachAuthContext = buildAuthContextMiddleware(ctx.auth.api, ctx.models)
  const requireSiteAdmin = buildRequireSiteAdmin(ctx.models)
  const requireSiteRead = buildRequireSiteRead(ctx.models)
  const requireSiteUploader = buildRequireSiteUploader(ctx.models)
  const requireSiteEditor = buildRequireSiteEditor(ctx.models)
  const requireUploadTargetUploader = buildRequireUploadTargetUploader(ctx.models)
  const attachReadableSiteIds = buildAttachPermittedSiteIds(ctx.models, config.site.roles.readRoles)
  const requireViewToken = buildFileAccessTokenMiddleware(ctx, 'view')
  const requireDownloadToken = buildFileAccessTokenMiddleware(ctx, 'download')
  const requireUploadToken = buildUploadTokenMiddleware(ctx)

  router.get('/health', asyncHandler(controller.health))
  router.get(
    '/account/me',
    attachAuthContext,
    requireAuthContext,
    asyncHandler(controller.accountMe),
  )
  router.patch(
    '/account',
    attachAuthContext,
    requireAuthContext,
    validateBody(accountPatchSchema),
    asyncHandler(controller.accountUpdate),
  )
  router.get('/users', attachAuthContext, requireAuthContext, asyncHandler(controller.usersList))
  router.get(
    '/site/:siteId/users',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteAdmin,
    asyncHandler(controller.siteUsersList),
  )
  router.post(
    '/site/:siteId/users',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteAdmin,
    validateBody(userCreateSchema),
    asyncHandler(controller.siteUserCreate),
  )
  router.get(
    '/users/:userId',
    attachAuthContext,
    requireAuthContext,
    validateParams(userIdParamSchema),
    asyncHandler(controller.userGet),
  )
  router.put(
    '/users/:userId',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    validateParams(userIdParamSchema),
    validateBody(userPatchSchema),
    asyncHandler(controller.userUpdate),
  )
  router.delete(
    '/users/:userId',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    validateParams(userIdParamSchema),
    asyncHandler(controller.userDelete),
  )
  router.delete(
    '/user/:userId',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    validateParams(userIdParamSchema),
    asyncHandler(controller.userRemoveFromAllSites),
  )
  router.put(
    '/site/:siteId/user/:userId',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndUserParamsSchema),
    requireSiteAdmin,
    validateBody(siteUserPatchSchema),
    asyncHandler(controller.siteUserUpdate),
  )
  router.delete(
    '/site/:siteId/user/:userId',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndUserParamsSchema),
    requireSiteAdmin,
    asyncHandler(controller.siteUserRemove),
  )
  router.patch(
    '/site/:siteId/user/:userId/resend',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndUserParamsSchema),
    requireSiteAdmin,
    validateBody(emptyObjectSchema),
    asyncHandler(controller.userResendInvite),
  )
  router.get('/users/me', attachAuthContext, requireAuthContext, asyncHandler(controller.userMe))
  router.get('/profile', attachAuthContext, requireAuthContext, asyncHandler(controller.profileGet))
  router.patch(
    '/profile',
    attachAuthContext,
    requireAuthContext,
    validateBody(profilePatchSchema),
    asyncHandler(controller.profileUpdate),
  )
  router.get(
    '/user-groups',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    asyncHandler(controller.userGroupsList),
  )
  router.post(
    '/user-groups',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    validateBody(userGroupCreateSchema),
    asyncHandler(controller.userGroupsCreate),
  )
  router.patch(
    '/users/group/:id/users',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    validateParams(idParamSchema),
    validateBody(userGroupUsersSchema),
    asyncHandler(controller.userGroupUsersAdd),
  )
  router.delete(
    '/users/group/:id/user/:userId',
    attachAuthContext,
    requireAuthContext,
    requireAccountAdmin,
    validateParams(userGroupUserParamsSchema),
    asyncHandler(controller.userGroupUserRemove),
  )
  router.get('/sites', attachAuthContext, requireAuthContext, asyncHandler(controller.sitesList))
  router.get(
    '/sites/suppressed',
    attachAuthContext,
    requireAuthContext,
    asyncHandler(controller.suppressedSitesList),
  )
  router.post(
    '/sites',
    attachAuthContext,
    requireAuthContext,
    validateBody(nonEmptyNameSchema),
    asyncHandler(controller.sitesCreate),
  )
  router.get(
    '/sites/:siteId',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteRead,
    asyncHandler(controller.siteGet),
  )
  router.patch(
    '/sites/:siteId',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteAdmin,
    validateBody(sitePatchSchema),
    asyncHandler(controller.siteUpdate),
  )
  router.delete(
    '/sites/:siteId',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteAdmin,
    asyncHandler(controller.siteDelete),
  )
  router.patch(
    '/site/:siteId/invitation/accept',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    validateBody(emptyObjectSchema),
    asyncHandler(controller.siteInvitationAccept),
  )
  router.patch(
    '/site/:siteId/invitation/decline',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    validateBody(emptyObjectSchema),
    asyncHandler(controller.siteInvitationDecline),
  )
  router.patch(
    '/site/:siteId/invitation/suppress',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    validateBody(emptyObjectSchema),
    asyncHandler(controller.siteInvitationSuppress),
  )
  router.post(
    '/site/:siteId/search',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteRead,
    validateBody(contentSearchBodySchema),
    asyncHandler(controller.searchSite),
  )
  router.post(
    '/site/:siteId/folder/:id/search',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndFolderParamsSchema),
    requireSiteRead,
    validateBody(contentSearchBodySchema),
    asyncHandler(controller.searchSiteFolder),
  )
  router.post(
    '/search',
    attachAuthContext,
    requireAuthContext,
    validateBody(contentSearchBodySchema),
    attachReadableSiteIds,
    asyncHandler(controller.searchAll),
  )
  router.post(
    '/sites/:siteId/folders',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteIdParamSchema),
    requireSiteUploader,
    validateBody(folderCreateSchema),
    asyncHandler(controller.folderCreate),
  )
  router.put(
    '/site/:siteId/content/:id',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndFolderParamsSchema),
    requireSiteEditor,
    validateBody(nonEmptyNameSchema),
    asyncHandler(controller.contentUpdate),
  )
  router.delete(
    '/site/:siteId/content/:id',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndFolderParamsSchema),
    requireSiteEditor,
    asyncHandler(controller.contentDelete),
  )
  router.get(
    '/site/:siteId/file/:fileId/token',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndFileParamsSchema),
    validateQuery(fileTokenQuerySchema),
    requireSiteRead,
    asyncHandler(controller.fileToken),
  )
  router.get(
    '/site/:siteId/file/:fileId',
    attachAuthContext,
    requireAuthContext,
    validateParams(siteAndFileParamsSchema),
    requireSiteRead,
    asyncHandler(controller.fileGet),
  )
  router.post(
    '/files/upload-target',
    attachAuthContext,
    requireAuthContext,
    validateBody(fileUploadTargetSchema),
    requireUploadTargetUploader,
    asyncHandler(controller.uploadTarget),
  )
  router.put(
    '/files/upload/:fileId',
    validateParams(fileIdParamSchema),
    requireUploadToken,
    express.raw({ type: '*/*', limit: '100mb' }),
    validateBody(binaryUploadBodySchema),
    asyncHandler(controller.uploadFile),
  )
  router.get(
    '/files/view/:fileId',
    validateParams(fileIdParamSchema),
    requireViewToken,
    asyncHandler(controller.viewFile),
  )
  router.get(
    '/files/download/:fileId',
    validateParams(fileIdParamSchema),
    requireDownloadToken,
    asyncHandler(controller.downloadFile),
  )

  return router
}
