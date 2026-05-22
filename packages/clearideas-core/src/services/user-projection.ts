import { coreContentStatus, coreRole } from './config.js'
import { createDefaultUserAttributes } from './user-attributes.js'
import {
  applySerializerOptions,
  extendSerialized,
  serializeDate,
  serializeId,
  type SerializerExtension,
  type SerializerOptions,
} from './serializer.js'

export type SerializedUser = Record<string, any>
export type SerializedUserGroup = Record<string, any>
export type SerializedProfile = Record<string, any>

export type UserSerializationContext = {
  defaults?: Record<string, any>
}

export type SerializeUserOptions = UserSerializationContext & SerializerOptions & {
  extendUser?: SerializerExtension<any, UserSerializationContext, SerializedUser>
}

export type SerializeProfileOptions = UserSerializationContext & SerializerOptions & {
  extendProfile?: SerializerExtension<any, UserSerializationContext, SerializedProfile>
}

export type SerializeUserGroupOptions = SerializerOptions & {
  serializeMember?: (user: any) => SerializedUser
  extendUserGroup?: SerializerExtension<any, Record<string, never>, SerializedUserGroup>
}

export function serializeProfile(user: any, options: SerializeProfileOptions = {}) {
  const defaults = options.defaults ?? createDefaultUserAttributes()
  const serialized: SerializedProfile = {
    id: serializeId(user._id ?? user.id),
    email: user.email,
    displayName: user.displayName ?? '',
    roles: user.roles ?? ['member'],
    attributes: {
      ...defaults,
      ...(user.attributes ?? {}),
      notifications: {
        ...defaults.notifications,
        ...(user.attributes?.notifications ?? {}),
      },
      sites: {
        ...defaults.sites,
        ...(user.attributes?.sites ?? {}),
      },
    },
  }
  return applySerializerOptions(extendSerialized(user, serialized, { defaults }, options.extendProfile), options)
}

export function serializeUser(user: any, options: SerializeUserOptions = {}) {
  const lastActive = user.lastActive ?? user.updatedAt ?? user.createdAt
  const serialized: SerializedUser = {
    id: serializeId(user._id ?? user.id),
    email: user.email,
    displayName: user.displayName ?? user.email,
    name: user.displayName ?? user.email,
    status: user.status ?? coreContentStatus.active,
    roles: user.roles ?? ['member'],
    lastActive: lastActive ? serializeDate(lastActive) : undefined,
    sites: (user.sites ?? []).map((site: any) => ({
      siteId: serializeId(site.siteId ?? site.id),
      name: site.name ?? '',
      role: site.role ?? coreRole.viewer,
      expiresAt: site.expiresAt ?? null,
    })),
  }
  return applySerializerOptions(extendSerialized(user, serialized, options, options.extendUser), options)
}

export function serializeUserGroup(group: any, options: SerializeUserGroupOptions = {}) {
  const serializeMember = options.serializeMember ?? ((user: any) => serializeUser(user))
  const serialized: SerializedUserGroup = {
    id: serializeId(group._id ?? group.id),
    name: group.name,
    icon: group.icon ?? 'fa-user-group',
    users: (group.users ?? []).map((id: any) => serializeId(id)),
    members: (group.members ?? []).map(serializeMember),
    attributes: group.attributes ?? {},
  }
  return applySerializerOptions(extendSerialized(group, serialized, {}, options.extendUserGroup), options)
}
