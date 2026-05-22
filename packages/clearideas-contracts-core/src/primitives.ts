import { z } from 'zod'

export { z }

export const MAX_NAME_LENGTH = 120
export const MAX_SITE_NAME_LENGTH = 100
export const MAX_DISPLAY_NAME_LENGTH = 50
export const MAX_SEARCH_QUERY_LENGTH = 500

export const atLeastOneField = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine(value => Object.keys(value).length > 0, { error: 'At least one field is required' })

export const optionalTrimmedString = (max?: number) =>
  z.preprocess(
    value => (value == null ? undefined : String(value).trim()),
    (max == null ? z.string() : z.string().max(max)).optional(),
  )

export const nullableTrimmedString = (max?: number) =>
  z.preprocess(
    value => (value == null || value === '' ? null : String(value).trim()),
    z.union([max == null ? z.string() : z.string().max(max), z.null()]),
  )

export const optionalNonEmptyTrimmedString = (field: string, max?: number) =>
  z.preprocess(
    value => (value == null ? undefined : String(value).trim()),
    (max == null ? z.string() : z.string().max(max, `${field} is too long`))
      .min(1, `${field} is required`)
      .optional(),
  )

export const requiredTrimmedString = (field: string, max?: number) =>
  z.preprocess(
    value => String(value ?? '').trim(),
    (max == null ? z.string() : z.string().max(max, `${field} is too long`)).min(
      1,
      `${field} is required`,
    ),
  )

export const objectIdString = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, { error: 'Invalid ObjectId' })

export const tagSchema = z.string().trim().min(1).max(100)
export const attributesSchema = z.record(z.string(), z.unknown())

export const stringArraySchema = z
  .array(z.preprocess(value => String(value).trim(), z.string().min(1)))
  .transform(values => values.filter(Boolean))

export const optionalStringArrayFromQuerySchema = z.preprocess(
  value => {
    if (value == null || value === '') return undefined
    if (Array.isArray(value)) return value
    return [value]
  },
  z.array(z.preprocess(value => String(value).trim(), z.string().min(1))).optional(),
)

export const optionalDateStringSchema = z.preprocess(
  value => (value == null || value === '' ? undefined : String(value).trim()),
  z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
)
