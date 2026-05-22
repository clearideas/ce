import { NotFoundError } from '../errors/index.js'
import { coreRole } from './config.js'
import { memberUserId } from './site-membership.js'

export type CoreUserGroupModels = {
  AccountModel: any
  SiteModel: any
  UserModel: any
  UserGroupModel: any
}

export function createCoreUserGroupService(models: CoreUserGroupModels) {
  return {
    async listUsersForAccount(userId: string) {
      const account = await models.AccountModel.findOne({ owner: userId }).lean()
      if (!account) throw new NotFoundError('Account not found')
      const sites = await models.SiteModel.find({ owner: account._id }).lean()
      const userIds = new Set<string>([String(account.owner)])
      for (const site of sites) {
        for (const member of site.members ?? []) {
          const id = memberUserId(member)
          if (id) userIds.add(id)
        }
      }
      const users = await models.UserModel.find({ _id: { $in: [...userIds] } }).lean()
      return users.map((user: any) => ({
        ...user,
        sites: sites
          .filter((site: any) => (site.members ?? []).some((member: any) => memberUserId(member) === String(user._id)))
          .map((site: any) => {
            const member = (site.members ?? []).find((candidate: any) => memberUserId(candidate) === String(user._id))
            return {
              siteId: String(site._id),
              name: site.name,
              role: member?.role ?? coreRole.viewer,
            }
          }),
      }))
    },

    async listSiteUsers(input: { siteId: string }) {
      const site = await models.SiteModel.findById(input.siteId).lean()
      if (!site) throw new NotFoundError('Site not found')
      const members = site.members ?? []
      const users = await models.UserModel.find({ _id: { $in: members.map(memberUserId).filter(Boolean) } }).lean()
      return users.map((user: any) => {
        const member = members.find((candidate: any) => memberUserId(candidate) === String(user._id))
        return {
          ...user,
          sites: [{
            siteId: String(site._id),
            name: site.name,
            role: member?.role ?? coreRole.viewer,
          }],
        }
      })
    },

    async listUserGroups(userId: string) {
      const account = await models.AccountModel.findOne({ owner: userId }).lean()
      if (!account) throw new NotFoundError('Account not found')
      const groups = await models.UserGroupModel.find({ owner: account._id }).lean()
      return hydrateUserGroupMembers(models, groups)
    },

    async createUserGroup(userId: string, input: { name: string; users?: string[] }) {
      const account = await models.AccountModel.findOne({ owner: userId }).lean()
      if (!account) throw new NotFoundError('Account not found')
      return models.UserGroupModel.create({
        owner: account._id,
        name: input.name,
        users: input.users ?? [],
        attributes: {},
      })
    },

    async addUsersToGroup(input: { userId: string; groupId: string; users: string[] }) {
      const account = await models.AccountModel.findOne({ owner: input.userId }).lean()
      if (!account) throw new NotFoundError('Account not found')
      const group = await models.UserGroupModel.findOne({ _id: input.groupId, owner: account._id })
      if (!group) throw new NotFoundError('User group not found')
      const availableUsers = await this.listUsersForAccount(input.userId)
      const availableUserIds = new Set(availableUsers.map((user: any) => String(user._id)))
      const currentUserIds = new Set((group.users ?? []).map((id: any) => String(id)))
      for (const userId of input.users) {
        if (availableUserIds.has(userId)) currentUserIds.add(userId)
      }
      group.users = [...currentUserIds]
      await group.save()
      return hydrateUserGroupMembers(models, [group.toObject()]).then(groups => groups[0])
    },

    async removeUserFromGroup(input: { userId: string; groupId: string; memberId: string }) {
      const account = await models.AccountModel.findOne({ owner: input.userId }).lean()
      if (!account) throw new NotFoundError('Account not found')
      const group = await models.UserGroupModel.findOne({ _id: input.groupId, owner: account._id })
      if (!group) throw new NotFoundError('User group not found')
      group.users = (group.users ?? []).filter((id: any) => String(id) !== input.memberId)
      await group.save()
      return hydrateUserGroupMembers(models, [group.toObject()]).then(groups => groups[0])
    },
  }
}

async function hydrateUserGroupMembers(models: CoreUserGroupModels, groups: any[]) {
  const userIds = [
    ...new Set(groups.flatMap(group => (group.users ?? []).map((id: any) => String(id)))),
  ]
  const users = userIds.length > 0
    ? await models.UserModel.find({ _id: { $in: userIds } }).lean()
    : []
  const usersById = new Map(users.map((user: any) => [String(user._id), user]))
  return groups.map(group => ({
    ...group,
    members: (group.users ?? [])
      .map((id: any) => usersById.get(String(id)))
      .filter(Boolean),
  }))
}
