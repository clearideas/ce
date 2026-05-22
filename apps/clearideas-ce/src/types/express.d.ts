import type { Types } from 'mongoose'

export declare global {
  namespace Express {
    interface Request {
      sub?: Types.ObjectId | null
      accountId?: Types.ObjectId | null
      account?: { _id: Types.ObjectId; owner?: Types.ObjectId; name?: string } | null
      user?: { _id: Types.ObjectId; email?: string; displayName?: string; roles?: string[] } | null
      site?: any | null
      siteRole?: string
      permittedSiteIds?: string[]
      fileId?: Types.ObjectId | null
      fileAccessPurpose?: 'view' | 'download'
      fileAccess?: {
        file: any
        token: {
          sub: string
          fileId: string
          fileKey: string
          siteId: string
          purpose: 'view' | 'download'
          siteRole: string
          exp: number
        }
      }
      uploadTarget?: {
        fileId: string
        fileKey: string
        siteId: string
        folderId?: string
        name: string
        contentType: string
        expires: string
        userId: string
        signature: string
      }
      accessKey?: {
        _id: Types.ObjectId
        accountId: Types.ObjectId
        keyType: string
        scopes: string[]
        siteId?: Types.ObjectId | string | null
        metadata?: Record<string, any> | null
      } | null
    }
  }
}
