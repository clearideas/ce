import {
  MAX_NAME_LENGTH,
  objectIdString,
  optionalTrimmedString,
  requiredTrimmedString,
  stringArraySchema,
  z,
} from './primitives.js'

export const AccessKeyCreateRequestSchema = z
  .strictObject({
    name: requiredTrimmedString('name', MAX_NAME_LENGTH),
    description: optionalTrimmedString(),
    keyType: z.preprocess(value => String(value ?? '').trim(), z.enum(['mcp'])),
    scopes: stringArraySchema.refine(values => values.length > 0, {
      error: 'At least one scope is required',
    }),
    expiresIn: z.preprocess(
      value => (value == null || value === '' ? undefined : Number(value)),
      z.number().int().positive({ error: 'expiresIn must be a positive number' }).optional(),
    ),
    siteId: objectIdString.optional(),
  })
  .transform(value => ({
    name: value.name,
    ...(value.description ? { description: value.description } : {}),
    keyType: value.keyType,
    scopes: value.scopes,
    ...(value.expiresIn != null ? { expiresIn: value.expiresIn } : {}),
    ...(value.siteId ? { siteId: value.siteId } : {}),
  }))

export const AccessKeyUpdateRequestSchema = z.strictObject({
  name: optionalTrimmedString(MAX_NAME_LENGTH),
  description: optionalTrimmedString(),
  scopes: stringArraySchema.optional(),
  expiresAt: z.preprocess(
    value =>
      value === undefined ? undefined : value == null || value === '' ? null : String(value),
    z.union([z.string(), z.null()]).optional(),
  ),
})

export type AccessKeyCreateRequest = z.infer<typeof AccessKeyCreateRequestSchema>
export type AccessKeyUpdateRequest = z.infer<typeof AccessKeyUpdateRequestSchema>
