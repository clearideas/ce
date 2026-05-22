import { coreSiteRelationship, type CoreSiteRelationship } from './config.js'

export type SiteRoleConfig = {
  ownerRoles: readonly string[]
  adminRoles: readonly string[]
  uploaderRoles?: readonly string[]
  editorRoles?: readonly string[]
  defaultRole?: string
}

export type SiteRelationship = CoreSiteRelationship

export interface SiteContentPermissions {
  canRead: boolean
  canListContent: boolean
  canSearchContent: boolean
  canUploadFile: boolean
  canCreateFolder: boolean
  canEditContent: boolean
  canDeleteContent: boolean
}

export function getSiteMemberUserId(member: any): string {
  return String(member?.user?._id ?? member?.user ?? member?.userId?._id ?? member?.userId ?? '')
}

export function siteOwnerId(site: any): string {
  return String(site?.owner?._id ?? site?.owner ?? '')
}

export function isSiteOwner(input: { site: any; accountId: unknown }): boolean {
  return siteOwnerId(input.site) === String(input.accountId ?? '')
}

export function resolveSiteRole(input: {
  site: any
  accountId: unknown
  userId: unknown
  roles: SiteRoleConfig
}): string {
  if (isSiteOwner({ site: input.site, accountId: input.accountId })) return input.roles.ownerRoles[0]
  const userId = String(input.userId ?? '')
  const member = (input.site?.members ?? []).find((candidate: any) => getSiteMemberUserId(candidate) === userId)
  return member?.role ?? input.roles.defaultRole ?? ''
}

export function hasSiteRole(input: {
  site: any
  accountId: unknown
  userId: unknown
  permittedRoles: readonly string[]
  roles: SiteRoleConfig
}): { allowed: boolean; role: string } {
  const role = resolveSiteRole(input)
  return { role, allowed: input.permittedRoles.includes(role) }
}

export function getSiteRelationship(role: string, roles: Pick<SiteRoleConfig, 'ownerRoles'>): SiteRelationship {
  return roles.ownerRoles.includes(role) ? coreSiteRelationship.owner : coreSiteRelationship.shared
}

export function getSiteContentPermissions(
  role: string,
  roles: Pick<SiteRoleConfig, 'uploaderRoles' | 'editorRoles'>,
  readOnly = false,
): SiteContentPermissions {
  const canWrite = !readOnly
  const uploaderRoles = roles.uploaderRoles ?? []
  const editorRoles = roles.editorRoles ?? []
  return {
    canRead: true,
    canListContent: true,
    canSearchContent: true,
    canUploadFile: canWrite && uploaderRoles.includes(role),
    canCreateFolder: canWrite && uploaderRoles.includes(role),
    canEditContent: canWrite && editorRoles.includes(role),
    canDeleteContent: canWrite && editorRoles.includes(role),
  }
}

export function isMcpEnabledSite(site: any): boolean {
  return site?.attributes?.ai?.mcpEnabled === true || site?.attributes?.mcp?.enabled === true
}
