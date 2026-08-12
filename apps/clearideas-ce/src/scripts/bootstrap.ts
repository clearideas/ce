import { registerCoreModels } from '@clearideas/core'
import { createDefaultUserAttributes } from '@clearideas/core'
import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { emailOTP } from 'better-auth/plugins/email-otp'
import mongoose from 'mongoose'
import { config } from '../config/index.js'
import { buildMongoConfigFromEnv, loadCeEnv } from './env.js'

loadCeEnv()

const email = firstDefined('FIRST_USER_EMAIL', 'ADMIN_EMAIL')?.trim().toLowerCase()
const displayName = firstDefined('FIRST_USER_NAME', 'ADMIN_NAME')?.trim() || email?.split('@')[0] || 'Clear Ideas Admin'

if (!email) {
  throw new Error('FIRST_USER_EMAIL is required to bootstrap the first Clear Ideas Community Edition owner.')
}

const mongo = await buildMongoConfigFromEnv()
await mongoose.connect(mongo.uri, mongo.options)

const models = registerCoreModels(mongoose)
const mongoClient = mongoose.connection.getClient()
const db = mongoClient.db(mongoose.connection.name)
const auth = betterAuth({
  database: mongodbAdapter(db as any, { client: mongoClient as any, transaction: false }),
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 4100}`,
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
  if (!/already|exist|duplicate/i.test(message)) throw error
}

const user = await models.UserModel.findOneAndUpdate(
  { email },
  {
    $set: {
      displayName,
      status: config.user.activeStatus,
    },
    $addToSet: {
      roles: config.site.role.owner,
    },
    $setOnInsert: {
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

console.log(
  JSON.stringify(
    {
      user: {
        id: String(user._id),
        email: user.email,
        name: user.displayName,
        roles: user.roles,
      },
      account: {
        id: String(account._id),
        name: account.name,
      },
      next: 'Start the app, sign in with this email address, and use the emailed/logged code.',
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
