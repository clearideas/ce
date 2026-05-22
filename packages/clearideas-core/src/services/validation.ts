import {
  AccessKeyCreateRequestSchema,
  AccessKeyUpdateRequestSchema,
  AccountPatchRequestSchema,
  ActivityCreateRequestSchema,
  AnalyticsFilterRequestSchema,
  AuthCodeSendRequestSchema,
  AuthCodeVerifyRequestSchema,
  BinaryUploadBodyRequestSchema,
  ContentSearchRequestSchema,
  EmptyObjectRequestSchema,
  FileUploadTargetRequestSchema,
  FolderCreateRequestSchema,
  McpRequestBodySchema,
  NonEmptyNameRequestSchema,
  NotificationSendRequestSchema,
  NotificationTemplateSendRequestSchema,
  ProfilePatchRequestSchema,
  SiteChatRequestSchema,
  SitePatchRequestSchema,
  SiteUserPatchRequestSchema,
  UserPatchRequestSchema,
  UserCreateRequestSchema,
  UserGroupCreateRequestSchema,
  UserGroupUsersAddRequestSchema,
} from '@clearideas/contracts-core'
import { Types } from 'mongoose'
import { z } from 'zod'
import { coreSiteRoleOptions, coreSiteVisibilityOptions } from './config.js'

const MAX_NAME_LENGTH = 120

export const coreIdSchema = z.preprocess(
  value => String(value ?? '').trim(),
  z.string().min(1),
)

export const coreObjectIdStringSchema = z.preprocess(
  value => String(value ?? '').trim(),
  z.string().regex(/^[a-f\d]{24}$/i, { error: 'Invalid ObjectId' }),
)

export const coreObjectIdSchema = coreObjectIdStringSchema.transform(value => new Types.ObjectId(value))

export const coreOptionalIdSchema = z.preprocess(
  value => value == null || value === '' ? undefined : String(value).trim(),
  z.string().min(1).optional(),
)

export const coreOptionalObjectIdSchema = z.preprocess(
  value => value == null || value === '' ? undefined : String(value).trim(),
  coreObjectIdSchema.optional(),
)

export const coreOptionalObjectIdStringSchema = z.preprocess(
  value => value == null || value === '' ? undefined : String(value).trim(),
  coreObjectIdStringSchema.optional(),
)

export const coreNullableObjectIdSchema = z.preprocess(
  value => value == null || value === '' ? null : String(value).trim(),
  z.union([coreObjectIdSchema, z.null()]),
)

export const coreNullableObjectIdStringSchema = z.preprocess(
  value => value == null || value === '' ? null : String(value).trim(),
  z.union([coreObjectIdStringSchema, z.null()]),
)

export const coreNameSchema = z.preprocess(
  value => String(value ?? '').trim(),
  z.string().min(1, { error: 'name is required' }).max(MAX_NAME_LENGTH, { error: 'name is too long' }),
)

export const coreEmailSchema = z.preprocess(
  value => String(value ?? '').trim().toLowerCase(),
  z.email({ error: 'email is invalid' }).min(1, { error: 'email is required' }),
)

export const coreAttributesSchema = z.record(z.string(), z.unknown())

export const coreSiteVisibilitySchema = z.enum(coreSiteVisibilityOptions)

export const coreSiteRoleSchema = z.enum(coreSiteRoleOptions)

export const coreAccessKeyTypeSchema = z.enum(['mcp'])

export const optionalTrimmedString = (max?: number) => z.preprocess(
  value => value == null ? undefined : String(value).trim(),
  max == null ? z.string().optional() : z.string().max(max).optional(),
)

export const requiredTrimmedString = (field: string, max?: number) => z.preprocess(
  value => String(value ?? '').trim(),
  (max == null ? z.string() : z.string().max(max, `${field} is too long`)).min(1, `${field} is required`),
)

export const emptyStringToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => value === '' ? undefined : value, schema)

export const emptyStringToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => value === '' ? null : value, schema)

export const nullableEmptyString = (max?: number) => z.preprocess(
  value => value == null || value === '' ? null : String(value).trim(),
  z.union([max == null ? z.string() : z.string().max(max), z.null()]),
)

export const stringArraySchema = z.array(z.preprocess(value => String(value).trim(), z.string().min(1))).transform(values => values.filter(Boolean))

export const nonEmptyNameSchema = NonEmptyNameRequestSchema
export const folderCreateSchema = FolderCreateRequestSchema
export const emptyObjectSchema = EmptyObjectRequestSchema
export const sitePatchSchema = SitePatchRequestSchema
export const fileUploadTargetSchema = FileUploadTargetRequestSchema
export const binaryUploadBodySchema = BinaryUploadBodyRequestSchema
export const mcpRequestBodySchema = McpRequestBodySchema

export const siteIdParamSchema = z.strictObject({ siteId: coreObjectIdSchema })

export const fileKeyParamSchema = z.strictObject({ fileKey: requiredTrimmedString('fileKey') })
export const fileIdParamSchema = z.strictObject({ fileId: coreObjectIdSchema })

export const contentSearchBodySchema = ContentSearchRequestSchema

export const siteAndFolderParamsSchema = z.strictObject({
  siteId: coreObjectIdSchema,
  id: coreObjectIdSchema,
})

export const siteAndFileParamsSchema = z.strictObject({
  siteId: coreObjectIdSchema,
  fileId: coreObjectIdSchema,
})

export const fileTokenQuerySchema = z.strictObject({
  purpose: z.enum(['view', 'download']).optional(),
})

export const authCodeSendSchema = AuthCodeSendRequestSchema
export const authCodeVerifySchema = AuthCodeVerifyRequestSchema
export const analyticsFilterSchema = AnalyticsFilterRequestSchema
export const notificationSendSchema = NotificationSendRequestSchema
export const notificationTemplateSendSchema = NotificationTemplateSendRequestSchema
export const siteChatBodySchema = SiteChatRequestSchema
export const profilePatchSchema = ProfilePatchRequestSchema
export const accountPatchSchema = AccountPatchRequestSchema
export const userGroupCreateSchema = UserGroupCreateRequestSchema

export const idParamSchema = z.strictObject({ id: coreObjectIdSchema })

export const userGroupUsersSchema = UserGroupUsersAddRequestSchema

export const userIdParamSchema = z.strictObject({ userId: coreObjectIdSchema })

export const siteAndUserParamsSchema = z.strictObject({
  siteId: coreObjectIdSchema,
  userId: coreObjectIdSchema,
})

export const userGroupUserParamsSchema = z.strictObject({
  id: coreObjectIdSchema,
  userId: coreObjectIdSchema,
})

export const userCreateSchema = UserCreateRequestSchema

export const userPatchSchema = UserPatchRequestSchema

export const siteUserPatchSchema = SiteUserPatchRequestSchema

export const accessKeyIdParamSchema = z.strictObject({ keyId: requiredTrimmedString('keyId') })

export const accessKeyCreateSchema = AccessKeyCreateRequestSchema
export const accessKeyUpdateSchema = AccessKeyUpdateRequestSchema
export const activityCreateSchema = ActivityCreateRequestSchema
