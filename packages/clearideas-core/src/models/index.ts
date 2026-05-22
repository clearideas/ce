import { type Model, type Mongoose, Schema, Types } from 'mongoose'
import { coreContentStatus, coreSiteVisibility, type CoreExtractionStatus } from '../services/config.js'

export interface User {
  email: string
  displayName?: string
  status?: string
  roles: string[]
  lastActive?: Date
  attributes?: Record<string, unknown>
}

export interface Account {
  name: string
  owner: Types.ObjectId
  attributes?: Record<string, unknown>
}

export interface SiteMember {
  user: Types.ObjectId
  role: string
  expiresAt?: Date
  acceptedAt?: Date | null
  declinedAt?: Date | null
}

export interface Site {
  name: string
  owner: Types.ObjectId // owning app decides whether this references an account or user principal
  members: SiteMember[]
  status?: string
  visibility?: string
  attributes?: Record<string, unknown>
}

export interface Session {
  token: string
  userId: Types.ObjectId
  expiresAt: Date
}

export interface UserGroup {
  owner: Types.ObjectId
  name: string
  users: Types.ObjectId[]
  attributes?: Record<string, unknown>
}

export interface AccessKey {
  accountId: Types.ObjectId
  name: string
  description?: string
  keyHash: string
  prefix: string
  keyId: string
  keyType: string
  scopes: string[]
  siteId?: Types.ObjectId | null
  lastUsedAt?: Date
  expiresAt?: Date
  isActive: boolean
  metadata?: Record<string, unknown>
}

export interface Activity {
  user: Types.ObjectId
  action: string
  target: Types.ObjectId
  onModel: string
  parent?: Types.ObjectId | null
  parentOnModel?: string | null
  attributes?: Record<string, unknown>
}

export interface Content {
  name: string
  status: string
  visibility?: string
  tags?: string[]
  owner: Types.ObjectId
  site: Types.ObjectId
  parent: Types.ObjectId
  parentType: 'Site' | 'Content'
  rank?: number
  kind: 'Folder' | 'File'
  attributes?: Record<string, unknown>
  key?: string
  size?: number
  contentType?: string
  extension?: string
  uploadedBy?: Types.ObjectId
  uploadedAt?: Date
  extractedText?: string
  extractedTextKey?: string
  extractionStatus?: CoreExtractionStatus
  extractedTextUpdatedAt?: Date
}

export interface CoreSchemas {
  userSchema: Schema<User>
  accountSchema: Schema<Account>
  siteSchema: Schema<Site>
  contentSchema: Schema<Content>
  sessionSchema: Schema<Session>
  userGroupSchema: Schema<UserGroup>
  accessKeySchema: Schema<AccessKey>
  activitySchema: Schema<Activity>
}

export interface CoreModelNames {
  user: string
  account: string
  site: string
  content: string
  session: string
  userGroup: string
  accessKey: string
  activity: string
}

export interface RegisterCoreModelsOptions {
  modelNames?: Partial<CoreModelNames>
  extendSchemas?: (schemas: CoreSchemas) => void
}

export interface CoreModels {
  UserModel: Model<User>
  AccountModel: Model<Account>
  SiteModel: Model<Site>
  ContentModel: Model<Content>
  SessionModel: Model<Session>
  UserGroupModel: Model<UserGroup>
  AccessKeyModel: Model<AccessKey>
  ActivityModel: Model<Activity>
}

const defaultModelNames: CoreModelNames = {
  user: 'User',
  account: 'Account',
  site: 'Site',
  content: 'Content',
  session: 'Session',
  userGroup: 'UserGroup',
  accessKey: 'AccessKey',
  activity: 'Activity',
}

export function createUserSchema(): Schema<User> {
  return new Schema<User>(
    {
      email: { type: String, required: true, unique: true, index: true, lowercase: true },
      displayName: { type: String, required: false },
      status: { type: String, required: false },
      roles: [{ type: String, required: false }],
      lastActive: { type: Date, required: false },
      attributes: { type: Schema.Types.Mixed, required: true, default: {} },
    },
    { timestamps: true },
  )
}

export function createAccountSchema(): Schema<Account> {
  return new Schema<Account>(
    {
      name: { type: String, required: true },
      owner: { type: Schema.Types.ObjectId, required: true, ref: 'User', unique: true },
      attributes: { type: Schema.Types.Mixed, required: true, default: {} },
    },
    { timestamps: true },
  )
}

export function createSiteSchema(): Schema<Site> {
  return new Schema<Site>(
    {
      name: { type: String, required: true },
      owner: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      members: [
        {
          user: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
          role: { type: String, required: false },
          expiresAt: { type: Date, required: false },
          acceptedAt: { type: Date, required: false, default: null },
          declinedAt: { type: Date, required: false, default: null },
        },
      ],
      status: { type: String, required: false },
      visibility: { type: String, required: false },
      attributes: { type: Schema.Types.Mixed, required: true, default: {} },
    },
    { timestamps: true },
  )
}

export function createSessionSchema(): Schema<Session> {
  return new Schema<Session>(
    {
      token: { type: String, required: true, unique: true, index: true },
      userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      expiresAt: { type: Date, required: true, index: true },
    },
    { timestamps: true },
  )
}

export function createContentSchema(): Schema<Content> {
  const schema = new Schema<Content>(
    {
      name: { type: String, required: true },
      status: { type: String, required: true, default: coreContentStatus.active, index: true },
      visibility: { type: String, required: false, default: coreSiteVisibility.public, index: true },
      tags: { type: [String], required: false },
      owner: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      site: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
      parent: { type: Schema.Types.ObjectId, required: true, index: true },
      parentType: { type: String, required: true, enum: ['Site', 'Content'], index: true },
      rank: { type: Number, required: false, default: 1 },
      kind: { type: String, required: true, enum: ['Folder', 'File'], index: true },
      attributes: { type: Schema.Types.Mixed, required: true, default: {} },
      key: { type: String, required: false, index: true },
      size: { type: Number, required: false },
      contentType: { type: String, required: false },
      extension: { type: String, required: false },
      uploadedBy: { type: Schema.Types.ObjectId, required: false, ref: 'User' },
      uploadedAt: { type: Date, required: false },
      extractedText: { type: String, required: false, select: false },
      extractedTextKey: { type: String, required: false },
      extractionStatus: { type: String, required: false },
      extractedTextUpdatedAt: { type: Date, required: false },
    },
    { timestamps: true },
  )
  schema.index({ site: 1, parent: 1, status: 1, rank: 1 })
  schema.index({ site: 1, kind: 1, status: 1 })
  return schema
}

export function createUserGroupSchema(): Schema<UserGroup> {
  return new Schema<UserGroup>(
    {
      owner: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      name: { type: String, required: true },
      users: [{ type: Schema.Types.ObjectId, required: true, ref: 'User' }],
      attributes: { type: Schema.Types.Mixed, required: true, default: {} },
    },
    { timestamps: true },
  )
}

export function createCoreSchemas(): CoreSchemas {
  return {
    userSchema: createUserSchema(),
    accountSchema: createAccountSchema(),
    siteSchema: createSiteSchema(),
    contentSchema: createContentSchema(),
    sessionSchema: createSessionSchema(),
    userGroupSchema: createUserGroupSchema(),
    accessKeySchema: createAccessKeySchema(),
    activitySchema: createActivitySchema(),
  }
}

export function createAccessKeySchema(): Schema<AccessKey> {
  const schema = new Schema<AccessKey>(
    {
      accountId: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      description: { type: String, required: false, trim: true, maxlength: 500 },
      keyHash: { type: String, required: true, unique: true, select: false },
      prefix: { type: String, required: true, index: true },
      keyId: { type: String, required: true, index: true },
      keyType: { type: String, required: true, index: true },
      scopes: [{ type: String, required: true }],
      siteId: { type: Schema.Types.ObjectId, required: false, ref: 'Site', index: true },
      lastUsedAt: { type: Date, required: false },
      expiresAt: { type: Date, required: false, index: true },
      isActive: { type: Boolean, required: true, default: true },
      metadata: { type: Schema.Types.Mixed, required: false, default: {} },
    },
    { timestamps: true },
  )
  schema.index({ accountId: 1, isActive: 1 })
  schema.index({ keyType: 1, keyId: 1, isActive: 1 })
  return schema
}

export function createActivitySchema(): Schema<Activity> {
  const schema = new Schema<Activity>(
    {
      user: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
      action: { type: String, required: true, index: true },
      target: { type: Schema.Types.ObjectId, required: true, index: true },
      onModel: { type: String, required: true, index: true },
      parent: { type: Schema.Types.ObjectId, required: false, index: true },
      parentOnModel: { type: String, required: false, index: true },
      attributes: { type: Schema.Types.Mixed, required: false, default: {} },
    },
    { timestamps: true },
  )
  schema.index({ parent: 1, parentOnModel: 1, createdAt: -1 })
  schema.index({ target: 1, onModel: 1, createdAt: -1 })
  return schema
}

export function registerCoreModels(
  mongoose: Mongoose,
  options: RegisterCoreModelsOptions = {},
): CoreModels {
  const names = { ...defaultModelNames, ...(options.modelNames ?? {}) }
  const schemas = createCoreSchemas()
  options.extendSchemas?.(schemas)

  return {
    UserModel:
      (mongoose.models[names.user] as Model<User>) ?? mongoose.model<User>(names.user, schemas.userSchema),
    AccountModel:
      (mongoose.models[names.account] as Model<Account>) ??
      mongoose.model<Account>(names.account, schemas.accountSchema),
    SiteModel:
      (mongoose.models[names.site] as Model<Site>) ?? mongoose.model<Site>(names.site, schemas.siteSchema),
    ContentModel:
      (mongoose.models[names.content] as Model<Content>) ??
      mongoose.model<Content>(names.content, schemas.contentSchema),
    SessionModel:
      (mongoose.models[names.session] as Model<Session>) ??
      mongoose.model<Session>(names.session, schemas.sessionSchema),
    UserGroupModel:
      (mongoose.models[names.userGroup] as Model<UserGroup>) ??
      mongoose.model<UserGroup>(names.userGroup, schemas.userGroupSchema),
    AccessKeyModel:
      (mongoose.models[names.accessKey] as Model<AccessKey>) ??
      mongoose.model<AccessKey>(names.accessKey, schemas.accessKeySchema),
    ActivityModel:
      (mongoose.models[names.activity] as Model<Activity>) ??
      mongoose.model<Activity>(names.activity, schemas.activitySchema),
  }
}
