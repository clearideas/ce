import { existsSync } from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as loadDotEnv } from 'dotenv'
import type mongoose from 'mongoose'

/**
 * The env files the CE server reads, in precedence order (dotenv never overrides a value that is
 * already set): repo root `.env.ce.local`, `.env.ce`, then the same two in `apps/clearideas-ce`.
 *
 * Located from this module (`src/scripts` or `dist/scripts`), not from `process.cwd()`: the old
 * `cwd.endsWith('apps/clearideas-ce')` test never matched a Windows path (`…\apps\clearideas-ce`),
 * so `npm run dev:ce` on Windows (cwd = the app folder) skipped the repo-root `.env.ce` — settings such
 * as `AI_AGENT_MODEL` were silently missing.
 */
export function ceEnvFiles(
  moduleDir = path.dirname(fileURLToPath(import.meta.url)),
  paths: Pick<typeof path, 'resolve' | 'join'> = path,
) {
  const ceRoot = paths.resolve(moduleDir, '..', '..')
  const repoRoot = paths.resolve(ceRoot, '..', '..')
  return [
    paths.join(repoRoot, '.env.ce.local'),
    paths.join(repoRoot, '.env.ce'),
    paths.join(ceRoot, '.env.ce.local'),
    paths.join(ceRoot, '.env.ce'),
  ]
}

/** Load the CE env files that exist; returns the ones read (the server logs them at startup). */
export function loadCeEnv() {
  const loaded = ceEnvFiles().filter(file => existsSync(file))
  for (const file of loaded) loadDotEnv({ path: file, quiet: true })
  return loaded
}

export async function buildMongoConfigFromEnv(): Promise<{
  uri: string
  options?: mongoose.ConnectOptions
}> {
  if (process.env.MONGODB_URI) return { uri: process.env.MONGODB_URI }

  if (process.env.MONGODB_HOST && process.env.MONGODB_USERNAME) {
    const dbHost = process.env.MONGODB_HOST
    const database = process.env.MONGODB_DATABASE_NAME ?? 'clearideas_ce'
    const authMechanism = process.env.MONGODB_AUTH_MECHANISM ?? 'MONGODB-X509'

    if (authMechanism === 'MONGODB-X509') {
      const certBase64 = process.env.MONGODB_CERTIFICATE_BASE64
      if (!certBase64) throw new Error('MONGODB_CERTIFICATE_BASE64 is required for MONGODB-X509')
      const certPem = Buffer.from(certBase64, 'base64').toString('utf-8')
      const certPath = path.join(os.tmpdir(), 'clearideas-ce-mongodb-cert.pem')
      await fs.writeFile(certPath, certPem, { mode: 0o600 })

      return {
        uri: `mongodb+srv://${encodeURIComponent(process.env.MONGODB_USERNAME)}@${dbHost}/${database}`,
        options: {
          authMechanism: 'MONGODB-X509',
          authSource: '$external',
          tls: true,
          tlsCertificateKeyFile: certPath,
        },
      }
    }

    const username = encodeURIComponent(process.env.MONGODB_USERNAME)
    const password = encodeURIComponent(process.env.MONGODB_PASSWORD ?? '')
    if (!password) throw new Error('MONGODB_PASSWORD is required for SCRAM-SHA-256')
    return {
      uri: `mongodb+srv://${username}:${password}@${dbHost}/${database}`,
      options: { authMechanism: 'SCRAM-SHA-256' },
    }
  }

  return { uri: 'mongodb://127.0.0.1:27017/clearideas_ce' }
}
