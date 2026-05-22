import {
  createActivityLogger,
  createResponse,
  deleteResponse,
  getResponse,
  listResponse,
  serializeAccount,
  serializeProfile,
  serializeSite,
  serializeUser,
  serializeUserGroup,
  updateResponse,
  isPdfContent,
  collectDescendantContentIds,
  buildLoginUrl as buildCoreLoginUrl,
  encodeContentDisposition,
  toSearchFile,
} from '@clearideas/core'
import { createCoreDomainServices } from '@clearideas/core'
import { getSiteResponse, getSitesResponse } from '@clearideas/core/services/site-endpoints'
import { parseAcceptedFilter, type AcceptedFilter } from '@clearideas/core/services/site-query'
import { BadRequestError, ForbiddenError } from '@clearideas/core/errors'
import type { Request, Response } from 'express'
import mongoose from 'mongoose'
import { config } from '../../config/index.js'
import type { CeAppContext } from '../../lib/app-context.js'
import { createFileAccessToken, createUploadToken, fileAccessTokenSecret, type FileAccessPurpose, uploadSigningSecret } from '../../middleware/file-access-token.js'
import { queuePdfTextExtraction } from '../../services/pdf-text-extraction.js'
import { hydrateSearchResultsFromSource } from '../../services/search-result-hydration.js'

export class CoreController {
  private readonly domain
  private readonly activity

  constructor(private readonly ctx: CeAppContext) {
    this.domain = createCoreDomainServices(this.ctx.models, this.ctx.providers)
    this.activity = createActivityLogger(activity => this.ctx.models.ActivityModel.create(activity))
  }

  health = async (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    res.json({ status: 'ok', app: 'clearideas-ce', db: dbState, date: new Date().toISOString() })
  }

  accountMe = async (req: Request, res: Response) => {
    const { user, account } = await this.domain.getAccountAndUser(String(req.sub!))
    res.json({
      account: account ? serializeAccount(account) : null,
      user: { id: String(user._id), email: user.email, name: user.displayName ?? user.email },
    })
  }

  accountUpdate = async (req: Request, res: Response) => {
    const account = await updateResponse({
      load: async () => (await this.domain.getAccountAndUser(String(req.sub!))).account,
      update: async () => this.domain.updateAccount(String(req.sub!), { name: req.body.name, attributes: req.body.attributes }),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'account-updated',
      target: account._id,
      onModel: 'Account',
      attributes: { source: 'ce-api' },
    })
    res.json({ account: serializeAccount(account) })
  }

  userMe = async (req: Request, res: Response) => {
    const user = await this.domain.getUserProfile(String(req.sub!))
    res.json({ user: { id: String(user._id), email: user.email, name: user.displayName ?? user.email } })
  }

  usersList = async (req: Request, res: Response) => {
    const users = await listResponse({
      load: () => this.domain.listUsersForAccount(String(req.sub!)),
    })
    res.json({
      users: users.map((user: any) => serializeUser(user)),
    })
  }

  siteUsersList = async (req: Request, res: Response) => {
    const users = await listResponse({
      load: () => this.domain.listSiteUsers({ siteId: String(req.params.siteId) }),
    })
    res.json({ users: users.map((user: any) => serializeUser(user)) })
  }

  userGet = async (req: Request, res: Response) => {
    const user = await getResponse({
      load: () => this.domain.getUserById(String(req.params.userId)),
    })
    res.json({
      user: serializeUser(user),
    })
  }

  siteUserCreate = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const user = await createResponse({
      create: () =>
        this.domain.createUser({
          email: req.body.email,
          displayName: req.body.displayName,
          siteIds: [siteId],
          siteRole: req.body.siteRole,
          invitedByUserId: String(req.sub!),
          sendInviteEmail: false,
        }),
    })
    if (await this.shouldSendSiteInviteEmail(siteId)) {
      await this.sendUserInviteCode(req, {
        email: user.email,
        name: user.displayName ?? user.email,
        siteIds: [siteId],
      })
    }
    await this.activity.safe({
      user: req.sub,
      action: 'added-user',
      target: user._id,
      onModel: 'User',
      parent: siteId,
      parentOnModel: 'Site',
      attributes: { email: user.email, role: req.body.siteRole, source: 'ce-api' },
    })
    res.status(200).json({
      user: serializeUser(user),
      message: 'User added.',
    })
  }

  private async sendUserInviteCode(req: Request, input: { email: string; name: string; siteIds: string[] }) {
    const firstSiteId = input.siteIds.length === 1 ? input.siteIds[0] : undefined
    const site = firstSiteId ? await this.ctx.models.SiteModel.findById(firstSiteId).select('name').lean() : null
    const code = await this.ctx.auth.api.createVerificationOTP({
      body: { email: input.email, type: 'sign-in' },
    })
    await this.ctx.providers.email.sendTemplate({
      to: input.email,
      templateAlias: site ? 'site-invitation' : 'user-invitation',
      templateModel: {
        name: input.name,
        invite_sender_name: req.user?.displayName || req.user?.email || 'A Clear Ideas user',
        site_name: site?.name ?? '',
        code,
        action_url: buildLoginUrl(input.email, firstSiteId, code),
      },
    })
    await this.ctx.models.UserModel.updateOne(
      { email: input.email, status: 'pending-invite' },
      { $set: { status: 'pending-invite-response' } },
    )
  }

  private async shouldSendSiteInviteEmail(siteId: string): Promise<boolean> {
    const site = await this.ctx.models.SiteModel.findById(siteId).select('visibility status').lean()
    return (
      (site?.visibility ?? config.site.visibility.private) === config.site.visibility.public &&
      (site?.status ?? config.site.status.active) === config.site.status.active
    )
  }

  userUpdate = async (req: Request, res: Response) => {
    const userId = String(req.params.userId)
    const user = await updateResponse({
      load: () => this.domain.getUserById(userId),
      update: () =>
        this.domain.updateUser(userId, {
          displayName: req.body.displayName,
        }),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'user-updated',
      target: user._id,
      onModel: 'User',
      attributes: { source: 'ce-api' },
    })
    res.json({
      user: serializeUser(user),
    })
  }

  userDelete = async (req: Request, res: Response) => {
    const userId = String(req.params.userId)
    const user = await this.domain.getUserById(userId)
    const result = await deleteResponse({
      load: () => user,
      remove: () => this.domain.deleteUser(userId),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'user-deleted',
      target: user._id,
      onModel: 'User',
      attributes: { email: user.email, source: 'ce-api' },
    })
    res.json(result)
  }

  siteUserUpdate = async (req: Request, res: Response) => {
    const user = await updateResponse({
      load: () => this.domain.getSite({ siteId: String(req.params.siteId), userId: String(req.sub!), ownerRole: config.site.role.owner }),
      update: () =>
        this.domain.updateSiteUser({
          siteId: String(req.params.siteId),
          userId: String(req.params.userId),
          role: req.body.role,
          expiresAt: req.body.expiresAt,
        }),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'site-user-updated',
      target: req.params.userId,
      onModel: 'User',
      parent: req.params.siteId,
      parentOnModel: 'Site',
      attributes: { role: req.body.role, source: 'ce-api' },
    })
    res.json({ user: serializeUser(user) })
  }

  siteUserRemove = async (req: Request, res: Response) => {
    const result = await deleteResponse({
      load: () => this.domain.getSite({ siteId: String(req.params.siteId), userId: String(req.sub!), ownerRole: config.site.role.owner }),
      remove: () => this.domain.removeSiteUser({ siteId: String(req.params.siteId), userId: String(req.params.userId) }),
    })
    res.json(result)
  }

  userRemoveFromAllSites = async (req: Request, res: Response) => {
    const result = await deleteResponse({
      load: () => this.domain.getUserById(String(req.params.userId)),
      remove: () => this.domain.removeUserFromAllSites({ userId: String(req.params.userId), ownerUserId: String(req.sub!) }),
    })
    res.json(result)
  }

  userResendInvite = async (req: Request, res: Response) => {
    const user = await getResponse({
      load: () => this.domain.getUserById(String(req.params.userId)),
    })
    if (!user) throw new BadRequestError('User not found')
    if (!(await this.shouldSendSiteInviteEmail(String(req.params.siteId)))) {
      res.status(200).json({ success: false, message: 'Site invitations are emailed when the site is public.' })
      return
    }
    await this.sendUserInviteCode(req, {
      email: user.email,
      name: user.displayName ?? user.email,
      siteIds: [String(req.params.siteId)],
    })
    await this.activity.safe({
      user: req.sub,
      action: 'site-user-invite-resent',
      target: req.params.userId,
      onModel: 'User',
      parent: req.params.siteId,
      parentOnModel: 'Site',
      attributes: { email: user.email, source: 'ce-api' },
    })
    res.json({ success: true, message: 'Invite resent.' })
  }

  profileGet = async (req: Request, res: Response) => {
    const user = await this.domain.getUserProfile(String(req.sub!))
    res.json({ profile: serializeProfile(user) })
  }

  profileUpdate = async (req: Request, res: Response) => {
    const user = await updateResponse({
      load: () => this.domain.getUserProfile(String(req.sub!)),
      update: () =>
        this.domain.updateUserProfile(String(req.sub!), {
          displayName: req.body.displayName,
          attributes: req.body.attributes,
        }),
    })
    res.json({ profile: serializeProfile(user) })
  }

  userGroupsList = async (req: Request, res: Response) => {
    const groups = await listResponse({
      load: () => this.domain.listUserGroups(String(req.sub!)),
    })
    res.json({ userGroups: groups.map((group: any) => serializeUserGroup(group)) })
  }

  userGroupsCreate = async (req: Request, res: Response) => {
    const group = await createResponse({
      create: () =>
        this.domain.createUserGroup(String(req.sub!), {
          name: req.body.name,
          users: req.body.users,
        }),
    })
    res.status(201).json({
      userGroup: serializeUserGroup(group),
    })
  }

  userGroupUsersAdd = async (req: Request, res: Response) => {
    const group = await updateResponse({
      load: () => this.domain.listUserGroups(String(req.sub!)),
      update: () => this.domain.addUsersToGroup({
        userId: String(req.sub!),
        groupId: String(req.params.id),
        users: req.body.users,
      }),
    })
    res.json({ userGroup: serializeUserGroup(group) })
  }

  userGroupUserRemove = async (req: Request, res: Response) => {
    const group = await updateResponse({
      load: () => this.domain.listUserGroups(String(req.sub!)),
      update: () => this.domain.removeUserFromGroup({
        userId: String(req.sub!),
        groupId: String(req.params.id),
        memberId: String(req.params.userId),
      }),
    })
    res.json({ userGroup: serializeUserGroup(group) })
  }

  sitesList = async (req: Request, res: Response) => {
    const acceptedFilter: AcceptedFilter = parseAcceptedFilter(req.query.accepted)
    const sites = await getSitesResponse({
      acceptedFilter,
      publicVisibility: config.site.publicVisibility,
      adminRoles: config.site.roles.adminRoles,
      loadSites: ({ acceptedFilter }: { acceptedFilter: AcceptedFilter }) =>
        this.domain.listSites({
          userId: String(req.sub!),
          accepted: acceptedFilter,
          publicVisibility: config.site.publicVisibility,
          adminRoles: config.site.roles.adminRoles,
          ownerRole: config.site.role.owner,
        }),
    })
    res.json({ sites: sites.map((site: any) => serializeSite(site)) })
  }

  suppressedSitesList = async (req: Request, res: Response) => {
    const user = await this.ctx.models.UserModel.findById(String(req.sub!)).select('attributes.sites.suppressedSites').lean()
    const suppressedSiteIds = (user as any)?.attributes?.sites?.suppressedSites ?? []
    if (suppressedSiteIds.length === 0) {
      res.json({ sites: [] })
      return
    }
    const sites = await this.ctx.models.SiteModel.find({ _id: { $in: suppressedSiteIds } }).lean()
    res.json({
      sites: sites.map((site: any) => serializeSite({
        ...site,
        currentUserRole: config.site.role.viewer,
        currentUserInvitationStatus: 'suppressed',
      })),
    })
  }

  siteInvitationAccept = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const membership = await this.ctx.models.SiteModel.updateOne(
      { _id: siteId, 'members.user': String(req.sub!) },
      { $set: { 'members.$.acceptedAt': new Date(), 'members.$.declinedAt': null } },
    )
    if (membership.matchedCount === 0) throw new BadRequestError('Site invitation not found')
    await this.ctx.models.UserModel.updateOne(
      { _id: String(req.sub!) },
      { $pull: { 'attributes.sites.suppressedSites': siteId } },
    )
    res.status(200).json({ message: 'Site invitation accepted.' })
  }

  siteInvitationDecline = async (req: Request, res: Response) => {
    await this.ctx.models.UserModel.updateOne(
      { _id: String(req.sub!) },
      { $addToSet: { 'attributes.sites.suppressedSites': String(req.params.siteId) } },
    )
    res.status(200).json({ message: 'Site invitation declined.' })
  }

  siteInvitationSuppress = async (req: Request, res: Response) => {
    await this.ctx.models.UserModel.updateOne(
      { _id: String(req.sub!) },
      { $addToSet: { 'attributes.sites.suppressedSites': String(req.params.siteId) } },
    )
    res.status(200).json({ message: 'Site invitation suppressed.' })
  }

  sitesCreate = async (req: Request, res: Response) => {
    const site = await createResponse({
      create: () => this.domain.createSite(String(req.sub!), req.body.name),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'site-created',
      target: site._id,
      onModel: 'Site',
      attributes: { name: site.name, source: 'ce-api' },
    })
    res.status(201).json({ site: serializeSite(site.toObject()) })
  }

  siteUpdate = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const beforeSite = await this.domain.getSite({
      siteId,
      userId: String(req.sub!),
      ownerRole: config.site.role.owner,
    })
    const previousVisibility = beforeSite.visibility ?? config.site.visibility.private
    const updatedSite = await updateResponse({
      load: () =>
        beforeSite,
      update: () => this.domain.updateSite({
        siteId,
        name: req.body.name,
        visibility: req.body.visibility,
        icon: req.body.icon,
        attributes: req.body.attributes,
        sendInviteEmails: false,
        invitedByUserId: String(req.sub!),
      }),
    })
    if (previousVisibility !== config.site.visibility.public && updatedSite.visibility === config.site.visibility.public) {
      await this.sendSiteInviteCodes(req, updatedSite)
    }
    const visibilityAction = req.body.visibility === config.site.visibility.public ? 'site-made-public' : req.body.visibility === config.site.visibility.private ? 'site-made-private' : 'site-updated'
    await this.activity.safe({
      user: req.sub,
      action: visibilityAction,
      target: updatedSite._id,
      onModel: 'Site',
      attributes: { name: updatedSite.name, visibility: updatedSite.visibility, source: 'ce-api' },
    })
    const site = await getSiteResponse({
      site: await this.domain.getSite({ siteId, userId: String(req.sub!), ownerRole: config.site.role.owner }),
      toPublic: async (currentSite: any) => currentSite,
    })
    res.json({ site: serializeSite(site) })
  }

  private async sendSiteInviteCodes(req: Request, site: any) {
    const sent = new Set(Object.keys(site.attributes?.siteInviteSentAt ?? {}))
    const memberIds = (site.members ?? [])
      .filter((member: any) => member.role !== config.site.role.owner)
      .map((member: any) => member.user ?? member.userId)
      .filter(Boolean)
      .filter((userId: any) => !sent.has(String(userId)))
    if (memberIds.length === 0) return
    const users = await this.ctx.models.UserModel.find({ _id: { $in: memberIds } }).lean()
    const nextSentAt = { ...(site.attributes?.siteInviteSentAt ?? {}) }
    await Promise.all(users.map(async (user: any) => {
      await this.sendUserInviteCode(req, {
        email: user.email,
        name: user.displayName ?? user.email,
        siteIds: [String(site._id)],
      })
      nextSentAt[String(user._id)] = new Date().toISOString()
    }))
    await this.ctx.models.SiteModel.updateOne(
      { _id: site._id },
      { $set: { 'attributes.siteInviteSentAt': nextSentAt } },
    )
  }

  siteDelete = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const site = await this.domain.getSite({ siteId, userId: String(req.sub!), ownerRole: config.site.role.owner })
    const result = await deleteResponse({
      load: () => site,
      remove: () => this.domain.deleteSite(siteId),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'site-deleted',
      target: site._id,
      onModel: 'Site',
      attributes: { name: site.name, source: 'ce-api' },
    })
    res.json(result)
  }

  siteGet = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const currentSite = await this.domain.getSite({ siteId, userId: String(req.sub!), ownerRole: config.site.role.owner })
    if (req.siteRole) currentSite.currentUserRole = req.siteRole
    const site = await getSiteResponse({
      site: currentSite,
      toPublic: async (currentSite: any) => currentSite,
    })
    res.json({ site: serializeSite(site) })
  }

  folderCreate = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const folder = await createResponse({
      create: () => this.domain.createFolder(siteId, req.body.name, req.body.folderId),
    })
    await this.activity.safe({
      user: req.sub,
      action: 'folder-created',
      target: folder._id,
      onModel: 'Content',
      parent: siteId,
      parentOnModel: 'Site',
      attributes: { name: folder.name, source: 'ce-api' },
    })
    res.status(201).json({
      folder: {
        id: String(folder._id),
        name: folder.name,
        parentId: folder.parentType === 'Content' ? String(folder.parent) : undefined,
        files: [],
      },
    })
  }

  contentDelete = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const contentId = String(req.params.id)
    const contentIds = await this.collectSearchContentIds(siteId, contentId)
    await deleteResponse({
      load: () => this.domain.getSite({ siteId, userId: String(req.sub!), ownerRole: config.site.role.owner }),
      remove: () => this.domain.deleteContent({ siteId, contentId }),
    })
    await this.ctx.search?.removeContent(siteId, contentIds).catch(() => undefined)
    await this.activity.safe({
      user: req.sub,
      action: 'content-deleted',
      target: contentId,
      onModel: 'Content',
      parent: siteId,
      parentOnModel: 'Site',
      attributes: { source: 'ce-api' },
    })
    res.status(204).send()
  }

  contentUpdate = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const contentId = String(req.params.id)
    const content = await updateResponse({
      load: () => this.domain.getSite({ siteId, userId: String(req.sub!), ownerRole: config.site.role.owner }),
      update: () => this.domain.updateContent({ siteId, contentId, name: req.body.name }),
    })
    const file = await this.getSearchFileByContentId(siteId, contentId).catch(() => null)
    if (file) await this.ctx.search?.indexFile(file).catch(() => undefined)
    await this.activity.safe({
      user: req.sub,
      action: 'content-updated',
      target: contentId,
      onModel: 'Content',
      parent: siteId,
      parentOnModel: 'Site',
      attributes: { name: (content as any).name, source: 'ce-api' },
    })
    res.json({ content: { id: String((content as any)._id), name: (content as any).name } })
  }

  fileGet = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const fileId = String(req.params.fileId)
    const file = await getResponse<any>({
      load: () => this.domain.getFile({ siteId, fileId }),
    })
    const safeFile = { ...file }
    delete safeFile.extractedText
    delete safeFile.extractedTextKey
    delete safeFile._id
    res.json({
      file: {
        ...safeFile,
        id: file.id ?? String(file._id),
        viewUrl: `/api/files/view/${encodeURIComponent(String(file.id ?? file._id))}`,
        downloadUrl: `/api/files/download/${encodeURIComponent(String(file.id ?? file._id))}`,
      },
    })
  }

  fileToken = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const fileId = String(req.params.fileId)
    const purpose = req.query.purpose === 'view' ? 'view' : 'download'
    if (purpose === 'download' && !config.site.roles.downloaderRoles.includes(String(req.siteRole) as any)) {
      throw new ForbiddenError('Download access is not available for this site role')
    }
    const file = await getResponse<any>({
      load: () => this.domain.getFile({ siteId, fileId }),
    })
    const fileAccessTtlSeconds = config.tokens.fileAccessTtlSeconds()
    const token = createFileAccessToken({
      sub: String(req.sub!),
      fileId: String(file.id ?? file._id),
      fileKey: String(file.key ?? ''),
      siteId,
      purpose: purpose as FileAccessPurpose,
      siteRole: String(req.siteRole ?? ''),
      secret: fileAccessTokenSecret(),
      expiresInSeconds: fileAccessTtlSeconds,
    })
    await this.activity.safe({
      user: req.sub,
      action: purpose === 'view' ? 'requested-viewer-token' : 'requested-download-token',
      target: file.id ?? file._id,
      onModel: 'Content',
      parent: siteId,
      parentOnModel: 'Site',
      attributes: { purpose, fileName: file.name, source: 'ce-file-token' },
    })
    res.json({
      token,
      url: `/api/files/${purpose === 'view' ? 'view' : 'download'}/${encodeURIComponent(String(file.id ?? file._id))}?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + fileAccessTtlSeconds * 1000).toISOString(),
    })
  }

  uploadTarget = async (req: Request, res: Response) => {
    const target = await createResponse({
      create: async () => {
        const siteId = String(req.body.siteId)
        const folderId = req.body.folderId ? String(req.body.folderId) : ''
        const target = await this.domain.createPendingFileUploadTarget({
          siteId,
          folderId,
          fileName: req.body.fileName,
          contentType: req.body.contentType ?? 'application/octet-stream',
          userId: String(req.sub!),
        })
        const expires = String(Date.now() + config.tokens.uploadTtlMs())
        const signed = {
          fileId: String(target.fileId),
          fileKey: target.fileKey,
          siteId,
          folderId,
          name: req.body.fileName,
          contentType: req.body.contentType ?? 'application/octet-stream',
          expires,
          userId: String(req.sub!),
        }
        return {
          ...target,
          url: `/api/files/upload/${encodeURIComponent(String(target.fileId))}`,
          headers: {
            ...(target.headers ?? {}),
            'x-clearideas-upload-token': createUploadToken({ ...signed, secret: uploadSigningSecret() }),
          },
          expiresAt: new Date(Number(expires)).toISOString(),
        }
      },
    })
    res.json({ target })
  }

  uploadFile = async (req: Request, res: Response) => {
    const { fileId, fileKey, siteId, folderId, name, contentType, userId } = req.uploadTarget!
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestError('Upload body must be raw bytes')
    }
    const bodyBuffer = req.body

    await this.domain.uploadFile({
      fileId,
      fileKey,
      siteId,
      folderId,
      name,
      contentType,
      body: bodyBuffer,
      userId,
    })
    queuePdfTextExtraction({
      models: this.ctx.models as any,
      storage: this.ctx.providers.storage,
      search: this.ctx.search,
      fileKey,
      contentType,
    })
    const file = await this.domain.getFileByKey(fileKey).catch(() => null)
    if (file) {
      if (!isPdfContent(file.contentType, file.name)) await this.ctx.search?.indexFile({
        id: file.id,
        siteId: String(file.site),
        siteName: file.siteName,
        folderId: file.folderId,
        folderName: file.folderName,
        name: file.name,
        key: file.key,
        contentType: file.contentType,
        size: file.size,
        uploadedAt: file.uploadedAt,
        updatedAt: file.updatedAt,
        extractionStatus: file.extractionStatus,
      }).catch(() => undefined)
      await this.activity.safe({
        user: userId,
        action: 'file-uploaded',
        target: file.id,
        onModel: 'Content',
        parent: siteId,
        parentOnModel: 'Site',
        attributes: { fileKey, fileName: file.name, source: 'ce-upload' },
      })
    }

    res.json({ ok: true, key: fileKey })
  }

  downloadFile = async (req: Request, res: Response) => {
    const key = String(req.fileAccess?.token.fileKey ?? '')
    const file = req.fileAccess?.file ?? await this.domain.getFile({ siteId: String(req.fileAccess?.token.siteId ?? ''), fileId: String(req.params.fileId) })
    const body = await this.domain.downloadFile(key)
    const fileId = String(file.id ?? file._id ?? req.params.fileId)
    const siteId = String(file.site ?? req.fileAccess?.token.siteId ?? '')
    if (req.sub) {
      await this.activity.safe({
        user: req.sub,
        action: 'file-downloaded',
        target: fileId,
        onModel: 'Content',
        parent: siteId,
        parentOnModel: 'Site',
        attributes: { fileKey: key, fileName: file.name, source: 'ce-file-download' },
      })
    }
    if (file?.contentType) res.setHeader('content-type', file.contentType)
    res.setHeader('content-disposition', encodeContentDisposition(file?.name ?? key, true))
    res.send(body)
  }

  viewFile = async (req: Request, res: Response) => {
    const key = String(req.fileAccess?.token.fileKey ?? '')
    const file = req.fileAccess?.file ?? await this.domain.getFile({ siteId: String(req.fileAccess?.token.siteId ?? ''), fileId: String(req.params.fileId) })
    const body = await this.domain.downloadFile(key)
    const fileId = String(file.id ?? file._id ?? req.params.fileId)
    const siteId = String(file.site ?? req.fileAccess?.token.siteId ?? '')
    if (req.sub) {
      await this.activity.safe({
        user: req.sub,
        action: 'file-viewed',
        target: fileId,
        onModel: 'Content',
        parent: siteId,
        parentOnModel: 'Site',
        attributes: { fileKey: key, fileName: file.name, source: 'ce-file-viewer' },
      })
    }
    if (file?.contentType) res.setHeader('content-type', file.contentType)
    res.setHeader('content-disposition', encodeContentDisposition(file?.name ?? key, false))
    res.send(body)
  }

  searchSite = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const q = String(req.body.q ?? '')
    let files = await this.domain.searchFilesByName({ siteId, name: q })
    if (this.ctx.search) files = mergeSearchResults(files, await this.ctx.search.searchSite({ siteId, q }))
    if (this.ctx.search) files = await hydrateSearchResultsFromSource({ models: this.ctx.models, q, results: files, search: this.ctx.search })
    await this.activity.safe({
      user: req.sub,
      action: 'content-searched',
      target: siteId,
      onModel: 'Site',
      attributes: { q, scope: 'site', resultCount: files.length, source: 'ce-search' },
    })
    res.json({ results: files })
  }

  searchSiteFolder = async (req: Request, res: Response) => {
    const siteId = String(req.params.siteId)
    const folderId = String(req.params.id)
    const q = String(req.body.q ?? '')
    let files = await this.domain.searchFilesByName({ siteId, folderId, name: q })
    if (this.ctx.search) files = mergeSearchResults(files, await this.ctx.search.searchSite({ siteId, folderId, q }))
    if (this.ctx.search) files = await hydrateSearchResultsFromSource({ models: this.ctx.models, q, results: files, search: this.ctx.search })
    await this.activity.safe({
      user: req.sub,
      action: 'content-searched',
      target: folderId,
      onModel: 'Content',
      parent: siteId,
      parentOnModel: 'Site',
      attributes: { q, scope: 'folder', resultCount: files.length, source: 'ce-search' },
    })
    res.json({ results: files })
  }

  searchAll = async (req: Request, res: Response) => {
    const q = String(req.body.q ?? '')
    let files = await this.domain.searchFilesByNameAcrossSites({ userId: String(req.sub!), name: q })
    if (this.ctx.search) {
      const sites = await this.domain.listSites({
        userId: String(req.sub!),
        publicVisibility: config.site.publicVisibility,
        adminRoles: config.site.roles.adminRoles,
        ownerRole: config.site.role.owner,
        accepted: true,
      })
      files = mergeSearchResults(files, await this.ctx.search.searchAcrossSites({
        sites: sites.map((site: any) => ({ id: String(site._id), name: String(site.name ?? '') })),
        q,
      }))
      files = await hydrateSearchResultsFromSource({ models: this.ctx.models, q, results: files, search: this.ctx.search })
    }
    await this.activity.safe({
      user: req.sub,
      action: 'content-searched',
      target: req.sub,
      onModel: 'User',
      attributes: { q, scope: 'all', resultCount: files.length, source: 'ce-search' },
    })
    res.json({ results: files })
  }

  private async collectSearchContentIds(siteId: string, contentId: string) {
    const content = await this.ctx.models.ContentModel.findOne({ _id: contentId, site: siteId }).lean()
    if (!content || content.kind !== 'Folder') return [contentId]
    return [contentId, ...(await collectDescendantContentIds(this.ctx.models.ContentModel, contentId))]
  }

  private async getSearchFileByContentId(siteId: string, contentId: string) {
    const file = await this.domain.getFile({ siteId, fileId: contentId }).catch(() => null)
    return file ? toSearchFile(file) : null
  }
}

function buildLoginUrl(email: string, siteId?: string, code?: string): string {
  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 4100}`
  return buildCoreLoginUrl({ baseUrl, email, siteId, code })
}

function mergeSearchResults(...groups: any[][]) {
  const byId = new Map<string, any>()
  for (const group of groups) {
    for (const result of group) {
      const id = String(result?.id ?? result?._id ?? '')
      if (!id || byId.has(id)) continue
      byId.set(id, result)
    }
  }
  return [...byId.values()]
}
