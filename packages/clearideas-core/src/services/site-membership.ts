import { BadRequestError } from '../errors/index.js'
import { coreRole, coreSiteRoleOptions, coreSiteRoles } from './config.js'

export const DEFAULT_SITE_ROLES = coreSiteRoleOptions

export type DefaultSiteRole = typeof DEFAULT_SITE_ROLES[number]

export function normalizeSiteRole(role?: string, allowedRoles: readonly string[] = DEFAULT_SITE_ROLES): string {
  const normalized = String(role ?? coreRole.viewer).trim().toLowerCase()
  if (!allowedRoles.includes(normalized)) throw new BadRequestError('Invalid site role')
  return normalized
}

export function memberUserId(member: any): string {
  const value = member?.user?._id ?? member?.user ?? member?.userId
  return value == null ? '' : String(value)
}

export function findSiteMemberByUserId(site: { members?: any[] }, userId: string): any | undefined {
  return (site.members ?? []).find(member => memberUserId(member) === String(userId))
}

export function assertMutableSiteMember(member: any, input: {
  ownerRoles?: readonly string[]
  removeMessage?: string
  roleChangeMessage?: string
  operation: 'remove' | 'role-change'
}) {
  const ownerRoles = input.ownerRoles ?? coreSiteRoles.ownerRoles
  if (!member || !ownerRoles.includes(String(member.role ?? ''))) return
  throw new BadRequestError(
    input.operation === 'remove'
      ? input.removeMessage ?? 'Site owner cannot be removed from the site'
      : input.roleChangeMessage ?? 'Site owner role cannot be changed',
  )
}
