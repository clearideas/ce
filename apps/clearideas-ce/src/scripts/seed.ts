import {
  createCoreAccessKeyService,
  registerCoreModels,
  createDefaultUserAttributes,
} from '@clearideas/core'
import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { emailOTP } from 'better-auth/plugins/email-otp'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { config } from '../config/index.js'
import { buildMongoConfigFromEnv, loadCeEnv } from './env.js'

loadCeEnv()

const email = firstDefined('FIRST_USER_EMAIL', 'ADMIN_EMAIL', 'CE_SEED_EMAIL')?.trim().toLowerCase() ?? 'admin@clearideas.local'
const displayName = firstDefined('FIRST_USER_NAME', 'ADMIN_NAME', 'CE_SEED_NAME')?.trim() ?? 'Clear Ideas Admin'
const demoSiteName = process.env.DEMO_SITE_NAME?.trim() || 'CE Demo Site'
const welcomeFileKey = 'seed-welcome.txt'
const welcomeFileBody = Buffer.from('Welcome to Clear Ideas Community Edition.\n')

const mongo = await buildMongoConfigFromEnv()
await mongoose.connect(mongo.uri, mongo.options)

const models = registerCoreModels(mongoose)
const accessKeyService = createCoreAccessKeyService({
  AccessKeyModel: models.AccessKeyModel,
})
const mongoClient = mongoose.connection.getClient()
const db = mongoClient.db(mongoose.connection.name)
const auth = betterAuth({
  database: mongodbAdapter(db as any, { client: mongoClient as any, transaction: false }),
  baseURL: process.env.BETTER_AUTH_URL ?? `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 4100}`,
  secret: config.tokens.authSecret(),
  emailAndPassword: { enabled: false },
  plugins: [
    emailOTP({
      sendVerificationOTP: async () => {},
      storeOTP: 'hashed',
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
    deferSessionRefresh: true,
  },
})

try {
  const otp = await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  })
  await auth.api.signInEmailOTP({
    body: { email, otp, name: displayName },
  })
} catch (error: any) {
  const message = String(error?.message ?? '')
  if (!/already|exist|duplicate/i.test(message)) {
    throw error
  }
}

const user = await models.UserModel.findOneAndUpdate(
  { email },
  {
    $setOnInsert: {
      email,
      displayName,
      roles: config.user.firstUserRoles,
      attributes: createDefaultUserAttributes(),
    },
  },
  { upsert: true, returnDocument: 'after' },
)

const account = await models.AccountModel.findOneAndUpdate(
  { owner: user._id },
  {
    $setOnInsert: {
      name: `${displayName}'s Workspace`,
      owner: user._id,
      attributes: {},
    },
  },
  { upsert: true, returnDocument: 'after' },
)

const site = await models.SiteModel.findOneAndUpdate(
  { owner: account._id, name: demoSiteName },
  {
    $set: {
      'attributes.mcp.enabled': true,
      'attributes.ai.chatEnabled': true,
      'attributes.ai.mcpEnabled': true,
    },
    $setOnInsert: {
      name: demoSiteName,
      owner: account._id,
      members: [{ user: user._id, role: config.site.role.owner }],
    },
  },
  { upsert: true, returnDocument: 'after' },
)

const folder = await models.ContentModel.findOneAndUpdate(
  { site: site._id, name: 'Demo Folder', kind: 'Folder' },
  {
    $setOnInsert: {
      name: 'Demo Folder',
      owner: account._id,
      site: site._id,
      parent: site._id,
      parentType: 'Site',
      kind: 'Folder',
      status: config.content.status.active,
      visibility: config.site.visibility.public,
      attributes: {},
    },
  },
  { upsert: true, returnDocument: 'after' },
)

await models.ContentModel.findOneAndUpdate(
  { site: site._id, key: welcomeFileKey, kind: 'File' },
  {
    $set: {
      size: welcomeFileBody.length,
    },
    $setOnInsert: {
      name: 'welcome.txt',
      key: welcomeFileKey,
      contentType: 'text/plain',
      extension: 'txt',
      uploadedBy: user._id,
      uploadedAt: new Date(),
      owner: account._id,
      site: site._id,
      parent: folder._id,
      parentType: 'Content',
      kind: 'File',
      status: config.content.status.active,
      visibility: config.site.visibility.public,
      attributes: {},
    },
  },
  { upsert: true, returnDocument: 'after' },
)
await writeSeedStorageObject(welcomeFileKey, welcomeFileBody)

await models.ActivityModel.create({
  user: user._id,
  action: 'viewed',
  target: site._id,
  onModel: 'Site',
  parent: site._id,
  parentOnModel: 'Site',
  attributes: { source: 'ce-seed' },
})

const existingAccessKey = await models.AccessKeyModel.findOne({
  accountId: account._id,
  name: 'CE Demo MCP Key',
})

let accessKeyValue = '<existing key hidden>'
if (!existingAccessKey) {
  const { key } = await accessKeyService.create({
    accountId: account._id,
    name: 'CE Demo MCP Key',
    keyType: 'mcp',
    scopes: ['mcp:read'],
    metadata: { source: 'ce-seed' },
  })
  accessKeyValue = key
}

console.log(
  JSON.stringify(
    {
      user: { id: String(user._id), email },
      account: { id: String(account._id), name: account.name },
      site: { id: String(site._id), name: site.name },
      accessKey: accessKeyValue,
    },
    null,
    2,
  ),
)

await mongoose.disconnect()

function firstDefined(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && value.trim() !== '') return value
  }
  return undefined
}

async function writeSeedStorageObject(key: string, body: Buffer) {
  const storageRoot = resolveStorageRoot(process.env.STORAGE_ROOT ?? 'data/storage')
  await fs.mkdir(storageRoot, { recursive: true })
  await fs.writeFile(path.join(storageRoot, key), body)
}

function resolveStorageRoot(value: string) {
  const normalized = value.trim() || 'data/storage'
  if (path.isAbsolute(normalized)) return normalized
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const repoRoot = path.resolve(appRoot, '../..')
  if (normalized.startsWith('apps/') || normalized.startsWith('packages/')) return path.resolve(repoRoot, normalized)
  return path.resolve(appRoot, normalized)
}
