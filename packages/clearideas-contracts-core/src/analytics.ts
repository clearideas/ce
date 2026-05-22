import {
  optionalDateStringSchema,
  optionalStringArrayFromQuerySchema,
  optionalTrimmedString,
  z,
} from './primitives.js'

export const AnalyticsFilterRequestSchema = z.strictObject({
  sites: optionalStringArrayFromQuerySchema,
  siteIds: optionalStringArrayFromQuerySchema,
  siteId: optionalTrimmedString(),
  actions: optionalStringArrayFromQuerySchema,
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  timeZone: optionalTrimmedString(80),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type AnalyticsFilterRequest = z.infer<typeof AnalyticsFilterRequestSchema>
