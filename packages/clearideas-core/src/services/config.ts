import { SITE_ALL_NON_DISABLED_ROLES } from '@clearideas/contracts-core'

export const coreRole = {
  owner: 'owner',
  admin: 'admin',
  editor: 'editor',
  uploader: 'uploader',
  downloader: 'downloader',
  viewer: 'viewer',
  disabled: 'disabled',
} as const

export const coreSiteVisibility = {
  public: 'public',
  private: 'private',
} as const

export const coreSiteStatus = {
  active: 'active',
  deleted: 'deleted',
  deletePending: 'delete-pending',
} as const

export const coreContentStatus = {
  active: 'active',
  uploadPending: 'upload-pending',
} as const

export const coreExtractionStatus = {
  pending: 'pending',
  complete: 'complete',
  failed: 'failed',
  unsupported: 'unsupported',
  limited: 'limited',
} as const

export const coreNotificationAction = {
  uploaded: 'uploaded',
  created: 'created',
  deleted: 'deleted',
} as const

export const coreSiteRoleOptions = [
  coreRole.admin,
  coreRole.editor,
  coreRole.uploader,
  coreRole.downloader,
  coreRole.viewer,
  coreRole.disabled,
] as const

export const coreSiteVisibilityOptions = [
  coreSiteVisibility.private,
  coreSiteVisibility.public,
] as const

export const coreSiteRelationship = {
  owner: 'owner',
  shared: 'shared',
} as const

export const coreAcceptedFilter = {
  all: 'all',
  pending: 'pending',
} as const

export const coreSiteRoles = {
  ownerRoles: [coreRole.owner],
  adminRoles: [coreRole.owner, coreRole.admin],
  editorRoles: [coreRole.owner, coreRole.admin, coreRole.editor],
  uploaderRoles: [coreRole.owner, coreRole.admin, coreRole.editor, coreRole.uploader],
  downloaderRoles: [coreRole.owner, coreRole.admin, coreRole.editor, coreRole.uploader, coreRole.downloader],
  readRoles: [coreRole.owner, coreRole.admin, coreRole.editor, coreRole.uploader, coreRole.downloader, coreRole.viewer],
  allNonDisabledRoles: SITE_ALL_NON_DISABLED_ROLES,
} as const

export type CoreSiteRoles = typeof coreSiteRoles
export type CoreRole = typeof coreRole[keyof typeof coreRole]
export type CoreExtractionStatus = typeof coreExtractionStatus[keyof typeof coreExtractionStatus]
export type CoreSiteRelationship = typeof coreSiteRelationship[keyof typeof coreSiteRelationship]
export type CoreAcceptedFilterValue = typeof coreAcceptedFilter[keyof typeof coreAcceptedFilter]
