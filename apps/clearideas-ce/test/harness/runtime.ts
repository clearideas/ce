import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { SuperTest, Test } from 'supertest'
import supertest from 'supertest'
import { createCeRuntime, type CeRuntime } from '../../src/app.js'
import { createCapturedEmailProvider, type CapturedEmailProvider } from './email.js'
import type { ModelAdapter } from '@clearideas/agent-runtime'

export interface TestCeRuntime {
  runtime: CeRuntime
  mongo: MongoMemoryServer
  agent: SuperTest<Test>
  email: CapturedEmailProvider
  tempRoot: string
  close(): Promise<void>
}

export interface CreateTestCeRuntimeOptions {
  webRoot?: string
  appUrl?: string
  baseUrl?: string
  env?: Record<string, string>
  agentModelAdapter?: ModelAdapter
}

export async function createTestCeRuntime(options: CreateTestCeRuntimeOptions = {}): Promise<TestCeRuntime> {
  const mongo = await MongoMemoryServer.create()
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clearideas-ce-test-'))
  const webRoot = options.webRoot ?? path.join(tempRoot, 'web')
  const storageRoot = path.join(tempRoot, 'storage')
  const searchRoot = path.join(tempRoot, 'search')
  if (!options.webRoot) {
    await fs.mkdir(webRoot, { recursive: true })
    await fs.writeFile(path.join(webRoot, 'index.html'), '<!doctype html><title>Clear Ideas Community Edition</title><div id="app">CE shell</div>', 'utf8')
  }

  const email = createCapturedEmailProvider()
  const previous = snapshotEnv()
  Object.assign(process.env, {
    NODE_ENV: 'test',
    HTTPS_REQUIRED: 'false',
    NOTIFICATIONS_ENABLED: 'false',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    APP_URL: options.appUrl ?? 'http://127.0.0.1:4100',
    BETTER_AUTH_URL: options.baseUrl ?? options.appUrl ?? 'http://127.0.0.1:4100',
    SEARCH_INDEX_IDLE_MS: '10',
    SEARCH_INDEX_MAX_LOADED_SITES: '2',
    ...options.env,
  })

  const runtime = await createCeRuntime({
    loadEnv: false,
    mongoUri: mongo.getUri('clearideas_ce_test'),
    appUrl: options.appUrl ?? 'http://127.0.0.1:4100',
    baseUrl: options.baseUrl ?? options.appUrl ?? 'http://127.0.0.1:4100',
    webRoot,
    storageRoot,
    searchRoot,
    emailProvider: email,
    httpsRequired: false,
    startWorkers: false,
    agentModelAdapter: options.agentModelAdapter,
  })

  return {
    runtime,
    mongo,
    agent: supertest.agent(runtime.app),
    email,
    tempRoot,
    async close() {
      await runtime.close()
      await mongo.stop()
      await fs.rm(tempRoot, { recursive: true, force: true })
      restoreEnv(previous)
    },
  }
}

export async function signIn(input: { agent: SuperTest<Test>; email: CapturedEmailProvider; address?: string; name?: string }) {
  const address = input.address ?? 'ce-test@clearideas.local'
  await input.agent.post('/api/auth/code/send').send({ email: address }).expect(200)
  const code = input.email.lastCode(address)
  if (!code) throw new Error(`No auth code captured for ${address}`)
  const response = await input.agent.post('/api/auth/code/verify').send({ email: address, code, name: input.name ?? 'CE Test User' }).expect(200)
  return response.body.user as { id: string; email: string; name: string }
}

function snapshotEnv() {
  return { ...process.env }
}

function restoreEnv(previous: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key]
  }
  Object.assign(process.env, previous)
}
