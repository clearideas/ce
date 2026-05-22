import { ForbiddenError, UnauthorizedError } from '../errors/index.js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { coreRole, coreSiteVisibility } from './config.js'
import { hasSiteRole, type SiteRoleConfig } from './site-permissions.js'

export type FileAccessPurpose = 'view' | 'download'

export interface FileAccessTokenPayload {
  sub: string
  fileId: string
  fileKey: string
  siteId: string
  purpose: FileAccessPurpose
  siteRole: string
  exp: number
}

export type SignedFileAccessToken = FileAccessTokenPayload & { signature: string }

export interface UploadTokenPayload {
  fileId: string
  fileKey: string
  siteId: string
  folderId?: string
  name: string
  contentType: string
  expires: string
  userId: string
}

export type SignedUploadToken = UploadTokenPayload & { signature: string }

export interface CreateFileAccessTokenInput extends Omit<FileAccessTokenPayload, 'exp'> {
  secret: string
  expiresInSeconds?: number
}

export interface VerifyFileAccessTokenInput {
  token: string
  secret: string
  expectedPurpose: FileAccessPurpose
  routeFileId: string
}

export interface AuthorizeFileAccessInput {
  payload: FileAccessTokenPayload
  site: any
  file: any
  accountId?: string
  roles: SiteRoleConfig & { allNonDisabledRoles: readonly string[]; downloaderRoles?: readonly string[] }
  allowPublicViewer?: boolean
}

export function createFileAccessToken(input: CreateFileAccessTokenInput) {
  const payload: FileAccessTokenPayload = {
    sub: input.sub,
    fileId: input.fileId,
    fileKey: input.fileKey,
    siteId: input.siteId,
    purpose: input.purpose,
    siteRole: input.siteRole,
    exp: Date.now() + Math.max(30, input.expiresInSeconds ?? 300) * 1000,
  }
  return Buffer.from(JSON.stringify({ ...payload, signature: signFileAccessPayload(payload, input.secret) })).toString('base64url')
}

export function createUploadToken(input: UploadTokenPayload & { secret: string }) {
  const { secret, ...payload } = input
  return Buffer.from(JSON.stringify({ ...payload, signature: signUploadPayload(payload, secret) })).toString('base64url')
}

export function verifyUploadToken(input: { token: string; secret: string; now?: number }): SignedUploadToken {
  try {
    const decoded = JSON.parse(Buffer.from(decodeURIComponent(input.token), 'base64url').toString('utf8')) as SignedUploadToken
    const fileId = String(decoded.fileId ?? '').trim()
    const fileKey = String(decoded.fileKey ?? '').trim()
    const siteId = String(decoded.siteId ?? '').trim()
    const folderId = String(decoded.folderId ?? '').trim()
    const name = String(decoded.name ?? '').trim()
    const contentType = String(decoded.contentType ?? '').trim() || 'application/octet-stream'
    const expires = String(decoded.expires ?? '').trim()
    const userId = String(decoded.userId ?? '').trim()
    const signature = String(decoded.signature ?? '').trim()
    if (!fileId || !fileKey || !siteId || !name || !expires || !userId || !signature) throw new Error('Missing upload token fields')
    const payload = { fileId, fileKey, siteId, ...(folderId ? { folderId } : {}), name, contentType, expires, userId }
    const expiresAt = Number(expires)
    if (!Number.isFinite(expiresAt)) throw new UnauthorizedError('Invalid upload URL')
    if (expiresAt < (input.now ?? Date.now())) throw new UnauthorizedError('Upload URL has expired')
    const expected = Buffer.from(signUploadPayload(payload, input.secret), 'hex')
    const actual = Buffer.from(signature, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Bad signature')
    return { ...payload, signature }
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error
    throw new UnauthorizedError('Invalid upload URL')
  }
}

export function verifyFileAccessToken(input: VerifyFileAccessTokenInput): SignedFileAccessToken {
  try {
    const decoded = JSON.parse(Buffer.from(input.token, 'base64url').toString('utf8')) as SignedFileAccessToken
    const { signature, ...payload } = decoded
    if (!signature || !payload.sub || !payload.fileId || !payload.fileKey || !payload.siteId || !payload.purpose || !payload.exp) {
      throw new Error('Missing fields')
    }
    if (payload.purpose !== input.expectedPurpose) throw new ForbiddenError('Invalid file access token purpose')
    if (!input.routeFileId || input.routeFileId !== payload.fileId) throw new UnauthorizedError('Invalid file access token')
    if (payload.exp < Date.now()) throw new UnauthorizedError('File access token has expired')

    const expected = Buffer.from(signFileAccessPayload(payload, input.secret), 'hex')
    const actual = Buffer.from(signature, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Bad signature')
    return decoded
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) throw error
    throw new UnauthorizedError('Invalid file access token')
  }
}

export function authorizeFileAccess(input: AuthorizeFileAccessInput) {
  const { payload, site, file } = input
  if (!site || !file || String(file.site ?? '') !== payload.siteId || String(file.key ?? '') !== payload.fileKey) {
    throw new UnauthorizedError('Invalid file access token')
  }

  let { allowed, role } = hasSiteRole({
    site,
    accountId: input.accountId,
    userId: payload.sub,
    permittedRoles: input.roles.allNonDisabledRoles,
    roles: input.roles,
  })
  if (!allowed && input.allowPublicViewer && site.visibility === coreSiteVisibility.public) {
    allowed = true
    role = coreRole.viewer
  }
  if (!allowed) throw new ForbiddenError('File access token is no longer valid for this site membership')
  if (payload.purpose === 'download' && !(input.roles.downloaderRoles ?? input.roles.allNonDisabledRoles).includes(role)) {
    throw new ForbiddenError('Download access is no longer available for this site membership')
  }

  return { role }
}

function signFileAccessPayload(payload: FileAccessTokenPayload, secret: string) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')
}

function signUploadPayload(payload: UploadTokenPayload, secret: string) {
  return createHmac('sha256', secret)
    .update([
      payload.fileKey,
      payload.siteId,
      payload.folderId ?? '',
      payload.name,
      payload.contentType,
      payload.expires,
      payload.userId,
    ].join('\n'))
    .digest('hex')
}
