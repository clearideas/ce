import { z } from 'zod'

const MAX_DISPLAY_NAME_LENGTH = 50
const MAX_CODE_LENGTH = 50

export const SITE_USER_ROLE_OPTIONS = [
  'viewer',
  'downloader',
  'uploader',
  'editor',
  'admin',
  'owner',
  'disabled',
] as const

export const SITE_ALL_NON_DISABLED_ROLES = [
  'owner',
  'admin',
  'editor',
  'uploader',
  'downloader',
  'viewer',
] as const

export type SiteUserRole = (typeof SITE_USER_ROLE_OPTIONS)[number]
export type SiteAllNonDisabledRole = (typeof SITE_ALL_NON_DISABLED_ROLES)[number]

const objectIdString = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { error: 'Invalid ObjectId' })

const codeString = z.string().trim().max(MAX_CODE_LENGTH)

const nullableExpiry = z.preprocess(
  value => value === '' || value == null ? null : value,
  z.union([codeString.min(1), z.null()]).default(null),
)

export const DisplayNameRequestSchema = z
  .string()
  .min(2, { error: 'Display name must be at least 2 characters long' })
  .max(MAX_DISPLAY_NAME_LENGTH, {
    error: 'Display name must be no more than 50 characters long',
  })
  .regex(/^[a-zA-Z\s'-]+$/, {
    error: 'Display name can only contain letters, spaces, hyphens, and apostrophes',
  })
  .transform(value => value.replace(/\s+/g, ' ').trim())

export const EmailRequestSchema = z.preprocess(
  value =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  z.email(),
)

export const NewSiteUserRequestSchema = z.strictObject({
  email: EmailRequestSchema,
  displayName: DisplayNameRequestSchema.optional(),
})

export const SiteUserCreateRequestSchema = z
  .strictObject({
    role: z.enum(SITE_USER_ROLE_OPTIONS),
    id: objectIdString.optional(),
    user: NewSiteUserRequestSchema.optional(),
    expiresAt: nullableExpiry,
    acceptedAt: codeString.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.id && value.user) {
      ctx.addIssue({
        code: 'custom',
        path: ['user'],
        message: 'user is not allowed when id is provided',
      })
    }
    if (!value.id && !value.user) {
      ctx.addIssue({
        code: 'custom',
        path: ['user'],
        message: 'user is required when id is not provided',
      })
    }
  })

export const SiteUserUpdateRequestSchema = z.strictObject({
  role: z.enum(SITE_USER_ROLE_OPTIONS),
  expiresAt: nullableExpiry,
  acceptedAt: codeString.optional(),
})

export const UserPatchRequestSchema = z
  .strictObject({
    displayName: z.preprocess(
      value => (value == null ? undefined : String(value).trim()),
      z.string().max(MAX_DISPLAY_NAME_LENGTH).optional(),
    ),
  })
  .transform(value => (value.displayName == null ? {} : { displayName: value.displayName }))

export type DisplayNameRequest = z.infer<typeof DisplayNameRequestSchema>
export type EmailRequest = z.infer<typeof EmailRequestSchema>
export type NewSiteUserRequest = z.infer<typeof NewSiteUserRequestSchema>
export type SiteUserCreateRequest = z.infer<typeof SiteUserCreateRequestSchema>
export type SiteUserUpdateRequest = z.infer<typeof SiteUserUpdateRequestSchema>
export type UserPatchRequest = z.infer<typeof UserPatchRequestSchema>
