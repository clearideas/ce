import { describe, expect, it } from 'vitest'
import {
  ASSIGNABLE_SITE_ROLES,
  SITE_ROLE_GROUPS,
  SITE_ROLES,
  getSiteRole,
  siteContentPermissions,
} from '../../src-web/src/config/roles'
import { ROLE_ICONS } from '../../src-web/src/icons'

describe('site roles (review finding U7)', () => {
  it('is the single source for role copy and glyphs', () => {
    expect(SITE_ROLES.map(role => role.value)).toEqual([
      'owner',
      'admin',
      'editor',
      'uploader',
      'downloader',
      'viewer',
      'disabled',
    ])
    for (const role of SITE_ROLES) {
      expect(role.icon).toBe(ROLE_ICONS[role.value])
      expect(role.subtitle.length).toBeGreaterThan(8)
    }
    expect(ASSIGNABLE_SITE_ROLES.some(role => role.value === 'owner')).toBe(false)
    expect(getSiteRole('viewer')?.subtitle).toBe('View content only')
    expect(getSiteRole('downloader')?.subtitle).toContain('download')
    expect(getSiteRole('nope')).toBeUndefined()
  })
})

describe('site content permissions mirror the server', () => {
  it('uses the same role groups as packages/clearideas-core', async () => {
    const { coreSiteRoles } = await import('../../../../packages/clearideas-core/src/services/config')
    expect([...SITE_ROLE_GROUPS.admin]).toEqual([...coreSiteRoles.adminRoles])
    expect([...SITE_ROLE_GROUPS.editor]).toEqual([...coreSiteRoles.editorRoles])
    expect([...SITE_ROLE_GROUPS.uploader]).toEqual([...coreSiteRoles.uploaderRoles])
    expect([...SITE_ROLE_GROUPS.downloader]).toEqual([...coreSiteRoles.downloaderRoles])
  })

  it.each([
    ['owner', { canUpload: true, canCreateFolder: true, canEdit: true, canDownload: true, canManage: true }],
    [
      'editor',
      { canUpload: true, canCreateFolder: true, canEdit: true, canDownload: true, canManage: false },
    ],
    [
      'uploader',
      { canUpload: true, canCreateFolder: true, canEdit: false, canDownload: true, canManage: false },
    ],
    [
      'downloader',
      { canUpload: false, canCreateFolder: false, canEdit: false, canDownload: true, canManage: false },
    ],
    [
      'viewer',
      { canUpload: false, canCreateFolder: false, canEdit: false, canDownload: false, canManage: false },
    ],
    [
      undefined,
      { canUpload: false, canCreateFolder: false, canEdit: false, canDownload: false, canManage: false },
    ],
  ])('%s', (role, expected) => {
    expect(siteContentPermissions(role)).toEqual(expected)
  })
})
