import { MAX_NAME_LENGTH, optionalTrimmedString, requiredTrimmedString, z } from './primitives.js'

const emailSchema = z.preprocess(
  value =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  z.email(),
)

export const AuthCodeSendRequestSchema = z.strictObject({
  email: emailSchema,
})

export const AuthCodeVerifyRequestSchema = z.strictObject({
  email: emailSchema,
  code: requiredTrimmedString('code', 32),
  name: optionalTrimmedString(MAX_NAME_LENGTH),
})

export type AuthCodeSendRequest = z.infer<typeof AuthCodeSendRequestSchema>
export type AuthCodeVerifyRequest = z.infer<typeof AuthCodeVerifyRequestSchema>
