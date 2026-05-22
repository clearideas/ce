import { attributesSchema, optionalTrimmedString, requiredTrimmedString, z } from './primitives.js'

export const ActivityCreateRequestSchema = z
  .strictObject({
    action: requiredTrimmedString('action'),
    target: requiredTrimmedString('target'),
    onModel: requiredTrimmedString('onModel'),
    parent: optionalTrimmedString(),
    parentOnModel: optionalTrimmedString(),
    attributes: attributesSchema.optional(),
  })
  .transform(value => ({
    action: value.action,
    target: value.target,
    onModel: value.onModel,
    ...(value.parent ? { parent: value.parent } : {}),
    ...(value.parentOnModel ? { parentOnModel: value.parentOnModel } : {}),
    ...(value.attributes ? { attributes: value.attributes } : {}),
  }))

export type ActivityCreateRequest = z.infer<typeof ActivityCreateRequestSchema>
