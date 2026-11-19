import { ROLE_ICONS } from '../icons'

/**
 * Site roles as shown to users — the single source for labels, descriptions and glyphs.
 * Descriptions mirror `packages/clearideas-core/src/services/config.ts` (`uploaderRoles`,
 * `downloaderRoles`, `readRoles`): viewers can view but not download; downloaders can also download;
 * uploaders can also upload; editors manage content; admins manage users and settings as well.
 */
export type SiteRole = 'owner' | 'admin' | 'editor' | 'uploader' | 'downloader' | 'viewer' | 'disabled'

export interface SiteRoleOption {
  value: SiteRole
  title: string
  subtitle: string
  icon: string
}

export const SITE_ROLES: readonly SiteRoleOption[] = [
  { value: 'owner', title: 'Owner', subtitle: 'Full control of the site', icon: ROLE_ICONS.owner },
  { value: 'admin', title: 'Admin', subtitle: 'Manage settings, users and content', icon: ROLE_ICONS.admin },
  {
    value: 'editor',
    title: 'Editor',
    subtitle: 'Upload, organise and delete content',
    icon: ROLE_ICONS.editor,
  },
  {
    value: 'uploader',
    title: 'Uploader',
    subtitle: 'View, download and upload content',
    icon: ROLE_ICONS.uploader,
  },
  {
    value: 'downloader',
    title: 'Downloader',
    subtitle: 'View and download content',
    icon: ROLE_ICONS.downloader,
  },
  { value: 'viewer', title: 'Viewer', subtitle: 'View content only', icon: ROLE_ICONS.viewer },
  { value: 'disabled', title: 'Disabled', subtitle: 'No access to the site', icon: ROLE_ICONS.disabled },
]

/** Roles that can be granted when inviting or changing a user (owner is assigned by ownership). */
export const ASSIGNABLE_SITE_ROLES = SITE_ROLES.filter(role => role.value !== 'owner')

export function getSiteRole(value: string | undefined | null): SiteRoleOption | undefined {
  return SITE_ROLES.find(role => role.value === value)
}

/**
 * What a site role may do with content — mirrors the server's checks so the UI never offers an
 * action the API will reject: `coreSiteRoles` + `getSiteContentPermissions` in
 * `packages/clearideas-core/src/services/{config,site-permissions}.ts` (folder create and upload
 * need an uploader role, rename/delete an editor role, download a downloader role; users and
 * settings an admin role). `test/web/roles.test.ts` pins the parity.
 */
export const SITE_ROLE_GROUPS = {
  admin: ['owner', 'admin'],
  editor: ['owner', 'admin', 'editor'],
  uploader: ['owner', 'admin', 'editor', 'uploader'],
  downloader: ['owner', 'admin', 'editor', 'uploader', 'downloader'],
} as const satisfies Record<string, readonly SiteRole[]>

export interface SiteContentPermissions {
  canUpload: boolean
  canCreateFolder: boolean
  /** Rename, delete, bulk-select. */
  canEdit: boolean
  canDownload: boolean
  /** Site users and settings. */
  canManage: boolean
}

export function siteContentPermissions(role: string | undefined | null): SiteContentPermissions {
  const has = (group: readonly string[]) => group.includes(role ?? '')
  return {
    canUpload: has(SITE_ROLE_GROUPS.uploader),
    canCreateFolder: has(SITE_ROLE_GROUPS.uploader),
    canEdit: has(SITE_ROLE_GROUPS.editor),
    canDownload: has(SITE_ROLE_GROUPS.downloader),
    canManage: has(SITE_ROLE_GROUPS.admin),
  }
}
