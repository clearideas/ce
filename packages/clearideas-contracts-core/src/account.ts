import { attributesSchema, MAX_NAME_LENGTH, optionalTrimmedString, z } from './primitives.js'

export const AccountPatchRequestSchema = z.strictObject({
  name: optionalTrimmedString(MAX_NAME_LENGTH),
  attributes: attributesSchema.optional(),
})

export type AccountPatchRequest = z.infer<typeof AccountPatchRequestSchema>
