import { z } from 'zod'

const MAX_NAME_LENGTH = 120
const MAX_SEARCH_QUERY_LENGTH = 500

const atLeastOneField = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine(value => Object.keys(value).length > 0, { error: 'At least one field is required' })

const optionalTrimmedString = (max?: number) =>
  z.preprocess(
    value => (value == null ? undefined : String(value).trim()),
    (max == null ? z.string() : z.string().max(max)).optional(),
  )

const objectIdString = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { error: 'Invalid ObjectId' })
const tagSchema = z.string().trim().min(1).max(100)
const attributesSchema = z.record(z.string(), z.unknown())

export const ContentUpdateRequestSchema = atLeastOneField(
  z.strictObject({
    name: optionalTrimmedString(MAX_NAME_LENGTH),
    status: optionalTrimmedString(50),
    visibility: z.enum(['public', 'private']).optional(),
    tags: z.array(tagSchema).optional(),
    rank: z.number().optional(),
    parent: objectIdString.optional(),
    parentType: optionalTrimmedString(50),
    attributes: attributesSchema.optional(),
  }),
)

export const ContentTagsUpdateRequestSchema = z.strictObject({
  tags: z.array(tagSchema),
})

export const ContentSearchRequestSchema = z
  .strictObject({
    q: z.preprocess(
      value => String(value ?? '').trim(),
      z
        .string()
        .min(1, { error: 'q is required' })
        .max(MAX_SEARCH_QUERY_LENGTH, { error: 'q is too long' }),
    ),
  })
  .transform(value => ({ q: value.q }))

export type ContentUpdateRequest = z.infer<typeof ContentUpdateRequestSchema>
export type ContentTagsUpdateRequest = z.infer<typeof ContentTagsUpdateRequestSchema>
export type ContentSearchRequest = z.infer<typeof ContentSearchRequestSchema>
