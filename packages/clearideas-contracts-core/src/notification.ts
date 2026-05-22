import { attributesSchema, requiredTrimmedString, optionalTrimmedString, z } from './primitives.js'

export const NotificationSendRequestSchema = z.strictObject({
  to: z.preprocess(
    value =>
      String(value ?? '')
        .trim()
        .toLowerCase(),
    z.email(),
  ),
  subject: requiredTrimmedString('subject', 200),
  body: requiredTrimmedString('body', 10000),
})

export const NotificationTemplateSendRequestSchema = z
  .strictObject({
    to: z.preprocess(
      value =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      z.email(),
    ),
    template: optionalTrimmedString(120),
    templateAlias: optionalTrimmedString(120),
    variables: attributesSchema.optional(),
  })
  .refine(value => Boolean(value.template || value.templateAlias), {
    error: 'template is required',
  })

export type NotificationSendRequest = z.infer<typeof NotificationSendRequestSchema>
export type NotificationTemplateSendRequest = z.infer<
  typeof NotificationTemplateSendRequestSchema
>
