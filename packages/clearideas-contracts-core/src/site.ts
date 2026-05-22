import {
  atLeastOneField,
  attributesSchema,
  MAX_SITE_NAME_LENGTH,
  objectIdString,
  optionalNonEmptyTrimmedString,
  optionalTrimmedString,
  requiredTrimmedString,
  tagSchema,
  z,
} from './primitives.js'

export const CoreSiteAttributesRequestSchema = z.strictObject({
  numberingFormat: z.string().optional(),
  notifications: z.boolean().optional(),
  sorting: z.boolean().optional(),
  ai: attributesSchema.optional(),
  search: attributesSchema.optional(),
  display: attributesSchema.optional(),
  media: attributesSchema.optional(),
  mcp: attributesSchema.optional(),
  pdf: attributesSchema.optional(),
  qa: attributesSchema.optional(),
})

export const SitePatchRequestSchema = atLeastOneField(
  z.strictObject({
    name: optionalNonEmptyTrimmedString('name', MAX_SITE_NAME_LENGTH),
    visibility: z.enum(['public', 'private']).optional(),
    archived: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    tags: z.array(tagSchema).optional(),
    icon: optionalTrimmedString(200),
    attributes: CoreSiteAttributesRequestSchema.optional(),
  }),
)

export const SiteCreateRequestSchema = z
  .strictObject({
    site: z.strictObject({
      name: requiredTrimmedString('name', MAX_SITE_NAME_LENGTH),
      visibility: z.enum(['public', 'private']).optional(),
      archived: z.boolean().optional(),
      readOnly: z.boolean().optional(),
      tags: z.array(tagSchema).optional(),
      icon: optionalTrimmedString(200),
      attributes: CoreSiteAttributesRequestSchema.optional(),
    }),
    template: z.array(z.unknown()).optional(),
    templateId: objectIdString.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.template && value.templateId) {
      ctx.addIssue({
        code: 'custom',
        path: ['templateId'],
        message: 'template and templateId cannot both be provided',
      })
    }
  })

export type SitePatchRequest = z.infer<typeof SitePatchRequestSchema>
export type SiteCreateRequest = z.infer<typeof SiteCreateRequestSchema>
