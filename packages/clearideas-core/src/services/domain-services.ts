import { BadRequestError, NotFoundError } from '../errors/index.js'
import type { CoreProviders } from '../providers/index.js'
import { coreRole, coreSiteVisibility, type CoreExtractionStatus } from './config.js'
import {
  filterSitesByVisibility,
  getSitesForUserBase,
  parseAcceptedFilter,
  resolveCurrentUserRole,
} from './site-query.js'
import { createCoreContentService } from './content-service.js'
import { memberUserId } from './site-membership.js'
import { createCoreSiteMembershipService } from './site-membership-service.js'
import { createDefaultUserAttributes } from './user-attributes.js'
import { createCoreUserGroupService } from './user-group-service.js'

type Models = {
  UserModel: any
  AccountModel: any
  SiteModel: any
  ContentModel: any
  UserGroupModel: any
}

export function createCoreDomainServices(models: Models, providers: CoreProviders) {
  const contentService = createCoreContentService(models, providers)
  const userGroupService = createCoreUserGroupService(models)
  const membershipService = createCoreSiteMembershipService(models, {
    defaultUserAttributes: createDefaultUserAttributes,
    createAccountForUser: async user => {
      await models.AccountModel.create({
        name: `${user.displayName || user.email}'s Workspace`,
        owner: user._id,
        attributes: {},
      })
    },
    resolveAutoAccept: ({ user }) => user.attributes?.sites?.autoAcceptInvites !== false,
  })
  return {
    async getAccountAndUser(userId: string) {
      const [user, account] = await Promise.all([
        models.UserModel.findById(userId).lean(),
        models.AccountModel.findOne({ owner: userId }).lean(),
      ])
      if (!user) throw new NotFoundError('User not found')
      if (!account) throw new BadRequestError('No account found')
      return { user, account }
    },

    async listSites(input: {
      userId: string
      accepted?: unknown
      publicVisibility: string
      adminRoles: readonly string[]
      ownerRole: string
    }) {
      const account = await models.AccountModel.findOne({ owner: input.userId }).lean()
      if (!account) throw new BadRequestError('No account found')
      const user = await models.UserModel.findById(input.userId).select('attributes.sites.suppressedSites').lean()

      const acceptedFilter = parseAcceptedFilter(input.accepted)
      const suppressedSiteIds = (user as any)?.attributes?.sites?.suppressedSites ?? []
      const sites = await getSitesForUserBase(
        {
          findSites: query => models.SiteModel.find(query).lean(),
        },
        {
          userId: input.userId,
          accountId: String(account._id),
          accepted: acceptedFilter,
          suppressedSiteIds,
        },
      )

      const withRole = sites.map((site: any) => ({
        ...site,
        currentUserRole: resolveCurrentUserRole(
          site,
          String(account._id),
          input.userId,
          input.ownerRole,
        ),
      }))

      const visibleSites = filterSitesByVisibility(
        withRole,
        input.publicVisibility,
        input.adminRoles,
      )
      return visibleSites
    },

    async createSite(userId: string, name: string) {
      const account = await models.AccountModel.findOne({ owner: userId })
      if (!account) throw new BadRequestError('No account found')
      return models.SiteModel.create({
        name,
        owner: account._id,
        members: [{ user: userId, role: coreRole.owner }],
        attributes: {},
      })
    },

    async updateSite(input: { siteId: string; name?: string; visibility?: string; icon?: string; attributes?: Record<string, unknown>; inviteUrl?: string; invitedByUserId?: string; sendInviteEmails?: boolean }) {
      const site = await models.SiteModel.findById(input.siteId)
      if (!site) throw new NotFoundError('Site not found')
      const previousVisibility = site.visibility ?? coreSiteVisibility.private
      if (input.name != null) site.name = input.name
      if (input.visibility != null) site.visibility = input.visibility
      if (input.icon != null) (site as any).icon = input.icon
      if (input.attributes != null) site.attributes = { ...(site.attributes ?? {}), ...input.attributes }
      await site.save()
      if (input.sendInviteEmails !== false && previousVisibility !== coreSiteVisibility.public && site.visibility === coreSiteVisibility.public) {
        await sendSiteInvitationEmails({
          site,
          invitedByUserId: input.invitedByUserId,
          inviteUrl: input.inviteUrl,
        })
      }
      return site.toObject()
    },

    async deleteSite(siteId: string) {
      const site = await models.SiteModel.findById(siteId)
      if (!site) throw new NotFoundError('Site not found')
      await models.ContentModel.deleteMany({ site: site._id })
      await models.SiteModel.deleteOne({ _id: site._id })
    },

    async getSite(input: { siteId: string; userId: string; ownerRole: string }) {
      const account = await models.AccountModel.findOne({ owner: input.userId }).lean()
      if (!account) throw new BadRequestError('No account found')
      const site = await models.SiteModel.findById(input.siteId).lean()
      if (!site) throw new NotFoundError('Site not found')
      const currentUserRole = resolveCurrentUserRole(
        site,
        String(account._id),
        input.userId,
        input.ownerRole,
      )
      return contentService.hydrateSiteWithContent({ ...site, currentUserRole })
    },

    async createFolder(siteId: string, name: string, parentId?: string) {
      return contentService.createFolder({ siteId, name, parentId })
    },

    async deleteContent(input: { siteId: string; contentId: string }) {
      await contentService.deleteContent(input)
    },

    async updateContent(input: { siteId: string; contentId: string; name?: string }) {
      return contentService.updateContent(input)
    },

    async createUploadTarget(input: { fileName: string; contentType?: string }) {
      return contentService.createUploadTarget(input)
    },

    async createPendingFileUploadTarget(input: {
      siteId: string
      folderId?: string
      fileName: string
      contentType: string
      userId: string
    }) {
      return contentService.createPendingFileUploadTarget(input)
    },

    async uploadFile(input: {
      fileId?: string
      fileKey: string
      siteId: string
      folderId?: string
      name: string
      contentType: string
      body: Buffer
      userId: string
    }) {
      return contentService.uploadFile(input)
    },

    async downloadFile(fileKey: string) {
      return contentService.downloadFile(fileKey)
    },

    async getFile(input: { siteId: string; fileId: string }) {
      return contentService.getFile(input)
    },

    async getFileByKey(fileKey: string) {
      return contentService.getFileByKey(fileKey)
    },

    async updateFileExtraction(input: {
      fileKey: string
      extractedText?: string
      extractedTextKey?: string
      extractionStatus: CoreExtractionStatus
    }) {
      return contentService.updateFileExtraction(input)
    },

    async searchFilesByName(input: { siteId: string; name: string; folderId?: string; limit?: number }) {
      return contentService.searchFilesByName(input)
    },

    async searchFilesByNameAcrossSites(input: { userId: string; name: string; limit?: number }) {
      return contentService.searchFilesByNameAcrossSites(input)
    },

    async getUserProfile(userId: string) {
      const user = await models.UserModel.findById(userId).lean()
      if (!user) throw new NotFoundError('User not found')
      return user
    },

    async updateUserProfile(userId: string, patch: { displayName?: string; attributes?: Record<string, unknown> }) {
      const user = await models.UserModel.findById(userId)
      if (!user) throw new NotFoundError('User not found')
      if (patch.displayName != null) user.displayName = patch.displayName
      if (patch.attributes != null) {
        user.attributes = {
          ...(user.attributes?.toObject?.() ?? user.attributes ?? {}),
          ...patch.attributes,
        }
      }
      await user.save()
      return user.toObject()
    },

    async updateAccount(userId: string, patch: { name?: string; attributes?: Record<string, unknown> }) {
      const account = await models.AccountModel.findOne({ owner: userId })
      if (!account) throw new NotFoundError('Account not found')
      if (patch.name != null) account.name = patch.name
      if (patch.attributes != null) {
        account.attributes = {
          ...(account.attributes?.toObject?.() ?? account.attributes ?? {}),
          ...patch.attributes,
        }
      }
      await account.save()
      return account.toObject()
    },

    async listUsersForAccount(userId: string) {
      return userGroupService.listUsersForAccount(userId)
    },

    async listSiteUsers(input: { siteId: string }) {
      return userGroupService.listSiteUsers(input)
    },

    async getUserById(userId: string) {
      return models.UserModel.findById(userId).lean()
    },

    async createUser(input: { email: string; displayName?: string; siteIds?: string[]; siteRole?: string; invitedByUserId?: string; inviteUrl?: string; sendInviteEmail?: boolean }) {
      const invitedByUser = input.invitedByUserId
        ? await models.UserModel.findById(input.invitedByUserId).select('email displayName').lean()
        : null
      const result = await membershipService.addUserToSites({
        email: input.email,
        displayName: input.displayName,
        siteIds: input.siteIds,
        siteRole: input.siteRole,
      })
      if (result.shouldSendInviteNow && input.sendInviteEmail !== false) {
        await sendUserInvitationEmail({
          user: result.user,
          invitedByUser,
          inviteUrl: input.inviteUrl,
        })
      }
      return result.user
    },

    async listUserGroups(userId: string) {
      return userGroupService.listUserGroups(userId)
    },

    async createUserGroup(userId: string, input: { name: string; users?: string[] }) {
      return userGroupService.createUserGroup(userId, input)
    },

    async addUsersToGroup(input: { userId: string; groupId: string; users: string[] }) {
      return userGroupService.addUsersToGroup(input)
    },

    async removeUserFromGroup(input: { userId: string; groupId: string; memberId: string }) {
      return userGroupService.removeUserFromGroup(input)
    },

    async updateUser(userId: string, patch: { displayName?: string }) {
      const user = await models.UserModel.findById(userId)
      if (!user) throw new NotFoundError('User not found')
      if (patch.displayName != null) user.displayName = patch.displayName.trim()
      await user.save()
      return user.toObject()
    },

    async deleteUser(userId: string) {
      const user = await models.UserModel.findById(userId)
      if (!user) throw new NotFoundError('User not found')
      await models.UserModel.deleteOne({ _id: user._id })
    },

    async removeSiteUser(input: { siteId: string; userId: string }) {
      await membershipService.removeSiteUser(input)
    },

    async updateSiteUser(input: { siteId: string; userId: string; role: string; expiresAt?: string | null }) {
      const result = await membershipService.updateSiteUser(input)
      return {
        ...result.user,
        sites: [{
          siteId: String(result.site._id),
          name: result.site.name,
          role: result.member.role,
          expiresAt: result.member.expiresAt ?? null,
        }],
      }
    },

    async removeUserFromAllSites(input: { userId: string; ownerUserId: string }) {
      await membershipService.removeUserFromOwnedSites(input)
    },
  }

  async function sendSiteInvitationEmails(input: { site: any; invitedByUserId?: string; inviteUrl?: string }) {
    const memberIds = (input.site.members ?? []).map(memberUserId).filter(Boolean)
    if (memberIds.length === 0) return
    const [users, invitedByUser] = await Promise.all([
      models.UserModel.find({ _id: { $in: memberIds } }).lean(),
      input.invitedByUserId
        ? models.UserModel.findById(input.invitedByUserId).select('email displayName').lean()
        : null,
    ])
    const sent = new Set(Object.keys(input.site.attributes?.siteInviteSentAt ?? {}))
    const nextSentAt = { ...(input.site.attributes?.siteInviteSentAt ?? {}) }
    await Promise.all(users
      .filter((user: any) => String(user._id) !== String(input.site.owner))
      .filter((user: any) => !sent.has(String(user._id)))
      .map(async (user: any) => {
        await sendUserInvitationEmail({ user, invitedByUser, site: input.site, inviteUrl: input.inviteUrl })
        nextSentAt[String(user._id)] = new Date().toISOString()
      }))
    input.site.attributes = {
      ...(input.site.attributes ?? {}),
      siteInviteSentAt: nextSentAt,
    }
    await input.site.save?.()
  }

  async function sendUserInvitationEmail(input: { user: any; invitedByUser?: any; site?: any; inviteUrl?: string }) {
    const actionUrl = buildInviteActionUrl({
      inviteUrl: input.inviteUrl,
      email: input.user.email,
      siteId: input.site?._id,
    })
    await providers.email.sendTemplate({
      to: input.user.email,
      templateAlias: input.site ? 'site-invitation' : 'user-invitation',
      templateModel: {
        name: input.user.displayName?.trim?.() || input.user.email,
        invite_sender_name: input.invitedByUser?.displayName || input.invitedByUser?.email || 'A Clear Ideas user',
        site_name: input.site?.name ?? '',
        action_url: actionUrl,
      },
    }).catch(() => undefined)
  }

}

function buildInviteActionUrl(input: { inviteUrl?: string; email?: string; siteId?: unknown }) {
  const base = input.inviteUrl ?? '/'
  try {
    const url = new URL(base)
    if (input.email) url.searchParams.set('email', String(input.email))
    if (input.siteId) url.searchParams.set('siteId', String(input.siteId))
    return url.toString()
  } catch {
    const params = new URLSearchParams()
    if (input.email) params.set('email', String(input.email))
    if (input.siteId) params.set('siteId', String(input.siteId))
    const separator = base.includes('?') ? '&' : '?'
    return params.toString() ? `${base}${separator}${params.toString()}` : base
  }
}
