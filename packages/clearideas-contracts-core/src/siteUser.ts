import {
  MAX_DISPLAY_NAME_LENGTH,
  objectIdString,
  optionalTrimmedString,
  requiredTrimmedString,
  z,
} from './primitives.js'

export const UserCreateRequestSchema = z
  .strictObject({
    email: z.preprocess(
      value =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      z.email(),
    ),
    displayName: optionalTrimmedString(MAX_DISPLAY_NAME_LENGTH),
    siteIds: z.array(objectIdString).optional(),
    siteRole: optionalTrimmedString(50),
  })
  .transform(value => ({
    email: value.email,
    ...(value.displayName ? { displayName: value.displayName } : {}),
    ...(value.siteIds ? { siteIds: value.siteIds } : {}),
    ...(value.siteRole ? { siteRole: value.siteRole } : {}),
  }))

export const SiteUserPatchRequestSchema = z
  .strictObject({
    role: requiredTrimmedString('role', 50),
    expiresAt: z.preprocess(
      value => (value == null ? undefined : String(value).trim()),
      z.union([z.string(), z.null()]).optional(),
    ),
  })
  .transform(value => ({
    role: value.role,
    ...(value.expiresAt !== undefined ? { expiresAt: value.expiresAt || null } : {}),
  }))

export type UserCreateRequest = z.infer<typeof UserCreateRequestSchema>
export type SiteUserPatchRequest = z.infer<typeof SiteUserPatchRequestSchema>
