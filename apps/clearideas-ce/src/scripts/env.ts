import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { config as loadDotEnv } from 'dotenv'
import type mongoose from 'mongoose'

export function loadCeEnv() {
  const cwd = process.cwd()
  const ceRoot = cwd.endsWith('apps/clearideas-ce') ? cwd : path.resolve(cwd, 'apps/clearideas-ce')
  const repoRoot = cwd.endsWith('apps/clearideas-ce') ? path.resolve(cwd, '../..') : cwd
  loadDotEnv({ path: path.resolve(repoRoot, '.env.ce.local') })
  loadDotEnv({ path: path.resolve(repoRoot, '.env.ce') })
  loadDotEnv({ path: path.resolve(ceRoot, '.env.ce.local') })
  loadDotEnv({ path: path.resolve(ceRoot, '.env.ce') })
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
