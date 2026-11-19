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

/** Better Auth `POST /api/auth/revoke-session` (Settings → Active sessions). */
export const SessionRevokeRequestSchema = z.strictObject({
  token: requiredTrimmedString('token', 512),
})

export type AuthCodeSendRequest = z.infer<typeof AuthCodeSendRequestSchema>
export type AuthCodeVerifyRequest = z.infer<typeof AuthCodeVerifyRequestSchema>
export type SessionRevokeRequest = z.infer<typeof SessionRevokeRequestSchema>
