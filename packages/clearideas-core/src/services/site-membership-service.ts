import { BadRequestError, NotFoundError } from '../errors/index.js'
import {
  assertMutableSiteMember,
  findSiteMemberByUserId,
  memberUserId,
  normalizeSiteRole,
} from './site-membership.js'
import { coreRole, coreSiteRoles, coreSiteVisibility } from './config.js'

export type CoreSiteMembershipModels = {
  UserModel: any
  AccountModel?: any
  SiteModel: any
}

export type AddSiteUserResult = {
  user: any
  sites: any[]
  invitedSites: any[]
  newUser: boolean
  existingMemberUpdated: boolean
  shouldSendInviteNow: boolean
}

export type AddSiteUserOptions = {
  pendingStatus?: string
  defaultRoles?: string[]
  defaultUserAttributes?: () => Record<string, unknown>
  createAccountForUser?: (user: any) => Promise<void>
  resolveAutoAccept?: (input: { user: any; site: any }) => Promise<boolean> | boolean
}

export function createCoreSiteMembershipService(
  models: CoreSiteMembershipModels,
  options: AddSiteUserOptions = {},
) {
  return {
    async addUserToSites(input: {
      email: string
      displayName?: string
      siteIds?: string[]
      siteRole?: string
      userAttributes?: Record<string, unknown>
    }): Promise<AddSiteUserResult> {
      const email = String(input.email ?? '').trim().toLowerCase()
      if (!email) throw new BadRequestError('email is required')
      const siteRole = normalizeSiteRole(input.siteRole)
      const { user, newUser } = await getOrCreateUser(models, options, {
        email,
        displayName: input.displayName,
        attributes: input.userAttributes,
      })

      let existingMemberUpdated = false
      let invitedSites: any[] = []
      if (input.siteIds?.length) {
        const sites = await models.SiteModel.find({ _id: { $in: input.siteIds } })
        for (const site of sites) {
          const result = await addUserToSiteDocument({
            site,
            user,
            role: siteRole,
            resolveAutoAccept: options.resolveAutoAccept,
          })
          existingMemberUpdated = existingMemberUpdated || result.existingMemberUpdated
        }
        invitedSites = sites.map((site: any) => site.toObject?.() ?? site)
      }

      const shouldSendInviteNow =
        !input.siteIds?.length ||
        invitedSites.some((site: any) => (site.visibility ?? coreSiteVisibility.private) === coreSiteVisibility.public)
      return {
        user,
        sites: invitedSites,
        invitedSites,
        newUser,
        existingMemberUpdated,
        shouldSendInviteNow,
      }
    },

    async updateSiteUser(input: {
      siteId: string
      userId: string
      role: string
      expiresAt?: string | Date | null
      acceptedAt?: string | Date | null
      ownerRoles?: readonly string[]
    }) {
      const site = await models.SiteModel.findById(input.siteId)
      if (!site) throw new NotFoundError('Site not found')
      const role = normalizeSiteRole(input.role)
      const member = findSiteMemberByUserId(site, input.userId)
      if (!member) throw new NotFoundError('Site user not found')
      assertMutableSiteMember(member, {
        ownerRoles: input.ownerRoles,
        operation: 'role-change',
      })
      const previousRole = member.role
      const previousExpiresAt = member.expiresAt
      const previousAcceptedAt = member.acceptedAt
      member.role = role
      if (input.expiresAt !== undefined) member.expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined
      if (input.acceptedAt !== undefined) member.acceptedAt = input.acceptedAt ? new Date(input.acceptedAt) : null
      await site.save()
      const user = await models.UserModel.findById(input.userId).lean()
      if (!user) throw new NotFoundError('User not found')
      return {
        site,
        user,
        member,
        previousRole,
        previousExpiresAt,
        previousAcceptedAt,
      }
    },

    async removeSiteUser(input: {
      siteId: string
      userId: string
      ownerRoles?: readonly string[]
      assertTargetIsNotOwner?: (site: any, userId: string) => Promise<void>
    }) {
      const site = await models.SiteModel.findById(input.siteId)
      if (!site) throw new NotFoundError('Site not found')
      const member = findSiteMemberByUserId(site, input.userId)
      if (!member) throw new NotFoundError('Site user not found')
      assertMutableSiteMember(member, {
        ownerRoles: input.ownerRoles,
        operation: 'remove',
      })
      await input.assertTargetIsNotOwner?.(site, input.userId)
      const removedMember = { ...member.toObject?.() ?? member }
      site.members = (site.members ?? []).filter((candidate: any) => memberUserId(candidate) !== input.userId)
      await site.save()
      return { site, removedMember }
    },

    async removeUserFromOwnedSites(input: {
      ownerUserId: string
      userId: string
      activeStatus?: string
      ownerRoles?: readonly string[]
    }) {
      const account = models.AccountModel
        ? await models.AccountModel.findOne({ owner: input.ownerUserId }).lean()
        : null
      if (models.AccountModel && !account) throw new NotFoundError('Account not found')
      const ownerId = account?._id ?? input.ownerUserId
      if (String(account?.owner ?? input.ownerUserId) === input.userId) {
        throw new BadRequestError('Workspace owner cannot be removed from all sites')
      }
      const ownerRoles = input.ownerRoles ?? coreSiteRoles.ownerRoles
      const query: Record<string, unknown> = {
        owner: ownerId,
        members: {
          $elemMatch: {
            user: input.userId,
            role: { $nin: ownerRoles },
          },
        },
      }
      if (input.activeStatus) query.status = input.activeStatus
      const sites = await models.SiteModel.find(query, { _id: 1 }).exec()
      if (sites.length > 0) {
        await models.SiteModel.updateMany(
          { _id: { $in: sites.map((site: any) => site._id) }, ...(input.activeStatus ? { status: input.activeStatus } : {}) },
          { $pull: { members: { user: input.userId, role: { $nin: ownerRoles } } } },
        ).exec()
      }
      return { account, siteIds: sites.map((site: any) => site._id) }
    },

    async clearMemberDecline(input: { site: any; userId: string }) {
      const member = findSiteMemberByUserId(input.site, input.userId)
      if (!member) throw new NotFoundError('Site user not found')
      member.declinedAt = null
      await input.site.save()
      return { member }
    },
  }
}

async function getOrCreateUser(
  models: CoreSiteMembershipModels,
  options: AddSiteUserOptions,
  input: { email: string; displayName?: string; attributes?: Record<string, unknown> },
): Promise<{ user: any; newUser: boolean }> {
  let user = await models.UserModel.findOne({ email: input.email })
  if (user == null) {
    user = await models.UserModel.create({
      email: input.email,
      displayName: input.displayName?.trim() || input.email,
      status: options.pendingStatus ?? 'pending-invite',
      roles: options.defaultRoles ?? ['member'],
      attributes: input.attributes ?? options.defaultUserAttributes?.() ?? {},
    })
    await options.createAccountForUser?.(user)
    return { user, newUser: true }
  }
  if ((!user.displayName || user.displayName === user.email) && input.displayName?.trim()) {
    user.displayName = input.displayName.trim()
    await user.save()
  }
  return { user, newUser: false }
}

async function addUserToSiteDocument(input: {
  site: any
  user: any
  role: string
  resolveAutoAccept?: (input: { user: any; site: any }) => Promise<boolean> | boolean
}) {
  const members = input.site.members ?? []
  const member = members.find((candidate: any) => memberUserId(candidate) === String(input.user._id))
  const shouldAutoAccept = (input.site.visibility ?? coreSiteVisibility.private) === coreSiteVisibility.public &&
    Boolean(await input.resolveAutoAccept?.({ user: input.user, site: input.site }))
  const siteId = String(input.site._id)
  const suppressedSites = input.user.attributes?.sites?.suppressedSites ?? []
  const clearedSuppression = suppressedSites.includes(siteId)
  if (clearedSuppression) {
    input.user.attributes.sites.suppressedSites = suppressedSites.filter((id: string) => id !== siteId)
  }
  if (member == null) {
    members.push({
      user: input.user._id,
      role: input.role,
      acceptedAt: shouldAutoAccept ? new Date() : null,
      declinedAt: null,
    })
    input.site.members = members
    await Promise.all([
      input.site.save(),
      ...(clearedSuppression ? [input.user.save()] : []),
    ])
    return { existingMemberUpdated: false }
  }
  if (member.role !== coreRole.owner) {
    const wasAccepted = member.acceptedAt != null && member.declinedAt == null
    member.role = input.role
    member.declinedAt = null
    member.acceptedAt = wasAccepted
      ? member.acceptedAt
      : shouldAutoAccept
        ? new Date()
        : null
    await Promise.all([
      input.site.save(),
      ...(clearedSuppression ? [input.user.save()] : []),
    ])
    return { existingMemberUpdated: true }
  }
  if (clearedSuppression) await input.user.save()
  return { existingMemberUpdated: false }
}
