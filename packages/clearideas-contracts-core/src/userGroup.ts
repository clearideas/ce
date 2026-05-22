import {
  MAX_SITE_NAME_LENGTH,
  objectIdString,
  requiredTrimmedString,
  stringArraySchema,
  z,
} from './primitives.js'

export const UserGroupCreateRequestSchema = z
  .strictObject({
    name: requiredTrimmedString('name', MAX_SITE_NAME_LENGTH),
    users: stringArraySchema.optional(),
  })
  .transform(value =>
    value.users ? { name: value.name, users: value.users } : { name: value.name },
  )

export const UserGroupUsersAddRequestSchema = z.strictObject({
  users: z.array(objectIdString).min(1),
})

export type UserGroupCreateRequest = z.infer<typeof UserGroupCreateRequestSchema>
export type UserGroupUsersAddRequest = z.infer<typeof UserGroupUsersAddRequestSchema>
