import { registerCoreModels } from '@clearideas/core/models'
import { BadRequestError } from '@clearideas/core/errors'
import {
  getCoreProviders,
  registerCoreProviders,
  type CoreProviders,
  type EmailProvider,
  type StorageProvider,
} from '@clearideas/core/providers'
import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { emailOTP } from 'better-auth/plugins/email-otp'
import express from 'express'
import rateLimit from 'express-rate-limit'
import fs from 'fs/promises'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import path from 'path'
import { errorHandler, notFoundRoute } from './middleware/error-handler.js'
import { createCeEmailProvider } from './providers/email.js'
import { buildAccessKeyRoutes } from './routes/access-key/access-key.routes.js'
import { buildActivityRoutes } from './routes/activity/activity.routes.js'
import { buildAnalyticsRoutes } from './routes/analytics/analytics.routes.js'
import { buildAuthRoutes } from './routes/auth/auth.routes.js'
import { buildSiteChatRoutes } from './routes/chat/site-chat.routes.js'
import { buildAgentRoutes } from './routes/agent/agent.routes.js'
import { buildCoreRoutes } from './routes/core/core.routes.js'
import { buildMcpRoutes } from './routes/mcp/mcp.routes.js'
import { buildNotificationRoutes } from './routes/notification/notification.routes.js'
import { buildMongoConfigFromEnv, loadCeEnv } from './scripts/env.js'
import { createSiteSearchIndexManager } from './services/search-index.js'
import {
  startNotificationWorker,
  type NotificationWorkerHandle,
} from './workers/notification-worker.js'
import { config } from './config/index.js'
import { registerCeAgentModels, type CeAgentModels } from './models/agent.js'
import { AgentHostService } from './services/agent/agent-host.js'
import type { ModelAdapter } from '@clearideas/agent-runtime'
import {
  startAgentTaskWorker,
  type AgentTaskWorkerHandle,
} from './workers/agent-task-worker.js'

const currentFile = fileURLToPath(import.meta.url)
export const ceAppRoot = path.resolve(path.dirname(currentFile), '..')
export const repoRoot = path.resolve(ceAppRoot, '../..')

function resolveTrustProxy(): boolean | number {
  const raw = process.env.CLEARIDEAS_TRUST_PROXY?.trim().toLowerCase()
  if (raw === 'true') return 1
  if (raw === 'false') return false
  if (raw != null && raw !== '') {
    const value = Number(raw)
    if (Number.isInteger(value) && value >= 0) return value
  }

  return process.env.NODE_ENV === 'production' ? 1 : false
}

export interface CeRuntimeOptions {
  loadEnv?: boolean
  mongoUri?: string
  mongoOptions?: mongoose.ConnectOptions
  appUrl?: string
  baseUrl?: string
  webRoot?: string
  templateRoot?: string
  storageRoot?: string
  searchRoot?: string
  emailProvider?: EmailProvider
  httpsRequired?: boolean
  startWorkers?: boolean
  agentModelAdapter?: ModelAdapter
}

export interface CeRuntime {
  app: express.Express
  auth: any
  models: ReturnType<typeof registerCoreModels> & CeAgentModels
  providers: CoreProviders
  search: ReturnType<typeof createSiteSearchIndexManager>
  agentHost: AgentHostService
  storageRoot: string
  searchRoot: string
  close: () => Promise<void>
}

export async function createCeRuntime(options: CeRuntimeOptions = {}): Promise<CeRuntime> {
  if (options.loadEnv !== false) loadCeEnv()

  const port = Number(process.env.PORT ?? 4100)
  const host = process.env.HOST ?? '127.0.0.1'
  const appUrl = options.appUrl ?? process.env.APP_URL ?? `http://${host}:${port}`
  const baseUrl = options.baseUrl ?? process.env.BETTER_AUTH_URL ?? appUrl
  const webRoot = options.webRoot ?? path.join(ceAppRoot, 'web')
  const templateRoot = options.templateRoot ?? path.join(ceAppRoot, 'templates/email')
  const storageRoot = resolveAppPath(
    options.storageRoot ?? process.env.STORAGE_ROOT ?? 'data/storage',
  )
  const searchRoot = resolveAppPath(
    options.searchRoot ?? process.env.SEARCH_INDEX_ROOT ?? 'data/search',
  )

  await fs.mkdir(storageRoot, { recursive: true })
  await fs.mkdir(searchRoot, { recursive: true })

  const mongo = options.mongoUri
    ? { uri: options.mongoUri, options: options.mongoOptions }
    : await buildMongoConfigFromEnv()
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
  await mongoose.connect(mongo.uri, mongo.options)

  const models = { ...registerCoreModels(mongoose), ...registerCeAgentModels(mongoose) }
  const mongoClient = mongoose.connection.getClient()
  const db = mongoClient.db(mongoose.connection.name)
  const emailProvider = options.emailProvider ?? (await createCeEmailProvider({ templateRoot }))

  const auth = betterAuth({
    database: mongodbAdapter(db as any, { client: mongoClient as any, transaction: false }),
    baseURL: baseUrl,
    secret: config.tokens.authSecret(),
    emailAndPassword: {
      enabled: false,
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user }) => {
        await emailProvider.sendTemplate({
          to: user.email,
          templateAlias: 'email-verification',
          templateModel: {
            name: user.name || user.email,
            action_url: appUrl,
          },
        })
      },
    },
    socialProviders: buildSocialProviders(),
    plugins: [
      emailOTP({
        otpLength: Number(process.env.AUTH_CODE_LENGTH ?? 6),
        expiresIn: Number(process.env.AUTH_CODE_EXPIRES_IN ?? 10 * 60),
        storeOTP: 'hashed',
        resendStrategy: 'rotate',
        allowedAttempts: Number(process.env.AUTH_CODE_ALLOWED_ATTEMPTS ?? 5),
        sendVerificationOTP: async ({ email, otp, type }) => {
          await emailProvider.sendTemplate({
            to: email,
            templateAlias: 'sign-in-code',
            templateModel: {
              name: email,
              code: otp,
              action_url: appUrl,
              code_type: type,
            },
          })
        },
        disableSignUp: false,
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60 * 24,
      deferSessionRefresh: true,
    },
  })

  const storageProvider = createLocalStorageProvider(storageRoot)
  const providers: CoreProviders = {
    storage: storageProvider,
    email: emailProvider,
    cache: {
      async get() {
        return null
      },
      async set() {},
      async del() {},
    },
  }
  registerCoreProviders(providers)
  const search = createSiteSearchIndexManager({ root: searchRoot, storage: storageProvider })
  const agentContext = {
    auth,
    models,
    providers: getCoreProviders(),
    search,
  }
  const agentHost = new AgentHostService(agentContext, options.agentModelAdapter)
  const app = createCeApp({
    auth,
    models,
    providers: getCoreProviders(),
    search,
    webRoot,
    httpsRequired: options.httpsRequired,
    agentHost,
  })

  let notificationWorker: NotificationWorkerHandle | undefined
  let agentTaskWorker: AgentTaskWorkerHandle | undefined
  if (options.startWorkers !== false) {
    notificationWorker = startNotificationWorker({
      models,
      providers: getCoreProviders(),
      appBaseUrl: appUrl,
    })
    agentTaskWorker = startAgentTaskWorker({ models, agentHost })
  }

  return {
    app,
    auth,
    models,
    providers,
    search,
    agentHost,
    storageRoot,
    searchRoot,
    close: async () => {
      notificationWorker?.stop()
      agentTaskWorker?.stop()
      await mongoose.disconnect()
    },
  }
}

export function createCeApp(input: {
  auth: any
  models: any
  providers: CoreProviders
  search: ReturnType<typeof createSiteSearchIndexManager>
  webRoot: string
  httpsRequired?: boolean
  agentHost: AgentHostService
}) {
  const app = express()
  app.set('trust proxy', resolveTrustProxy())
  const apiRateLimit = rateLimit({
    windowMs: Number(process.env.CLEARIDEAS_API_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    limit: Number(process.env.CLEARIDEAS_API_RATE_LIMIT_LIMIT ?? 600),
    standardHeaders: true,
    legacyHeaders: false,
  })
  const authRateLimit = rateLimit({
    windowMs: Number(process.env.CLEARIDEAS_AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    limit: Number(process.env.CLEARIDEAS_AUTH_RATE_LIMIT_LIMIT ?? 60),
    standardHeaders: true,
    legacyHeaders: false,
  })
  const spaRateLimit = rateLimit({
    windowMs: Number(process.env.CLEARIDEAS_SPA_RATE_LIMIT_WINDOW_MS ?? 5 * 60 * 1000),
    limit: Number(process.env.CLEARIDEAS_SPA_RATE_LIMIT_LIMIT ?? 300),
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.use('/api/auth', authRateLimit)
  app.use('/api', apiRateLimit)
  app.use(createCookieCsrfProtection())
  app.use(createRequireHttpsMiddleware(input.httpsRequired))

  const jsonBodyParser = express.json({ limit: '30mb' })
  const urlencodedBodyParser = express.urlencoded({ extended: true })
  app.use((req, res, next) => {
    if (isRawUploadRequest(req)) return next()
    return jsonBodyParser(req, res, next)
  })
  app.use((req, res, next) => {
    if (isRawUploadRequest(req)) return next()
    return urlencodedBodyParser(req, res, next)
  })

  const ctx = {
    auth: input.auth,
    models: input.models,
    providers: input.providers,
    search: input.search,
    agentHost: input.agentHost,
  }
  app.use('/api/auth', buildAuthRoutes(ctx))
  app.use('/api', buildCoreRoutes(ctx))
  app.use('/api', buildAccessKeyRoutes(ctx))
  app.use('/api', buildActivityRoutes(ctx))
  app.use('/api', buildAnalyticsRoutes(ctx))
  app.use('/api', buildNotificationRoutes(ctx))
  app.use('/api', buildSiteChatRoutes(ctx))
  app.use('/api', buildAgentRoutes(ctx, input.agentHost))
  app.use('/api', buildMcpRoutes(ctx))
  app.get('/api/app-config', (_req, res) => {
    res.json({ docsEnabled: config.app.docsEnabled() })
  })

  app.use('/api', notFoundRoute)
  if (!config.app.docsEnabled()) {
    app.use('/docs', (_req, res) => {
      res.status(404).send('Documentation is not available.')
    })
  }

  app.use(
    express.static(input.webRoot, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('cache-control', 'no-store')
        }
      },
    }),
  )
  app.get('/{*any}', spaRateLimit, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.setHeader('cache-control', 'no-store')
    res.sendFile(path.join(input.webRoot, 'index.html'))
  })

  app.use(errorHandler)
  return app
}

export function createLocalStorageProvider(storageRoot: string): StorageProvider {
  const root = path.resolve(storageRoot)
  return {
    async createUploadTarget({ fileName }) {
      const safe = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      return { method: 'PUT', url: `/api/files/upload/${safe}`, fileKey: safe }
    },
    async writeObject({ key, body }) {
      const filePath = safeStoragePath(root, key)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, body)
    },
    async readObject({ key }) {
      return fs.readFile(safeStoragePath(root, key))
    },
    async deleteObjects({ keys }) {
      await Promise.all(keys.map(key => fs.rm(safeStoragePath(root, key), { force: true })))
    },
  }
}

function safeStoragePath(root: string, key: string): string {
  const normalizedKey = String(key ?? '').trim()
  if (!isSafeStorageKey(normalizedKey)) throw new BadRequestError('Invalid storage key')
  const resolved = path.resolve(root, normalizedKey)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))
    throw new BadRequestError('Invalid storage path')
  return resolved
}

function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith('/') || key.includes('\\')) return false
  return key
    .split('/')
    .every(
      segment =>
        segment && segment !== '.' && segment !== '..' && /^[a-zA-Z0-9._-]+$/.test(segment),
    )
}

function resolveAppPath(value: string): string {
  if (path.isAbsolute(value)) return value
  if (value.startsWith('apps/') || value.startsWith('packages/'))
    return path.resolve(repoRoot, value)
  return path.resolve(ceAppRoot, value)
}

function isRawUploadRequest(req: express.Request): boolean {
  return req.method === 'PUT' && req.path.startsWith('/api/files/upload/')
}

function createCookieCsrfProtection() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()

    const origin = req.headers.origin
    if (!origin) return next()

    const host = req.headers.host
    if (!host) {
      res.status(403).json({ error: 'Invalid request origin.' })
      return
    }

    try {
      const expectedOrigin = `${req.protocol}://${host}`
      if (new URL(origin).origin === expectedOrigin) return next()
    } catch {
      res.status(403).json({ error: 'Invalid request origin.' })
      return
    }

    res.status(403).json({ error: 'Invalid request origin.' })
  }
}

function createRequireHttpsMiddleware(httpsRequired?: boolean) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const required =
      httpsRequired ??
      String(
        process.env.HTTPS_REQUIRED ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false'),
      ).toLowerCase() === 'true'
    if (!required) return next()
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next()
    if (req.path.startsWith('/api/')) {
      res.status(426).json({ error: 'HTTPS is required.' })
      return
    }
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
  }
}

function buildSocialProviders() {
  const providers: Record<string, unknown> = {}
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }
  }
  return providers
}
