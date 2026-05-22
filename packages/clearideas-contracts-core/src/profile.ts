import {
  attributesSchema,
  MAX_DISPLAY_NAME_LENGTH,
  optionalTrimmedString,
  z,
} from './primitives.js'

export const ProfilePatchRequestSchema = z.strictObject({
  displayName: optionalTrimmedString(MAX_DISPLAY_NAME_LENGTH),
  attributes: attributesSchema.optional(),
})

export type ProfilePatchRequest = z.infer<typeof ProfilePatchRequestSchema>
