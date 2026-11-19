/**
 * One real CE server per spec file, for the browser specs.
 *
 * The server listens on the same origin the runtime was configured with (APP_URL/BETTER_AUTH_URL):
 * Better Auth rejects state-changing requests from any other `Origin`, so a server on a random port
 * behind a runtime configured for :4100 failed e.g. "revoke session" with "Invalid origin".
 */
import type http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import {
  createTestCeRuntime,
  type CreateTestCeRuntimeOptions,
  type TestCeRuntime,
} from '../../harness/runtime.js'

export interface CeTestServer {
  ctx: TestCeRuntime
  baseURL: string
  close(): Promise<void>
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() =>
        address && typeof address !== 'string' ? resolve(address.port) : reject(new Error('No port')),
      )
    })
  })
}

export async function startCeServer(
  options: Omit<CreateTestCeRuntimeOptions, 'appUrl' | 'baseUrl' | 'webRoot'> = {},
): Promise<CeTestServer> {
  // One browser spec signs in dozens of times, and every page load asks /api/auth for the session:
  // the production auth limit (60 per 15 min per client) would start answering 429 mid-spec.
  process.env.CLEARIDEAS_AUTH_RATE_LIMIT_LIMIT ??= '1000'
  const port = await freePort()
  const baseURL = `http://127.0.0.1:${port}`
  const webRoot = path.resolve(import.meta.dirname, '../../../web')
  const ctx = await createTestCeRuntime({ ...options, webRoot, appUrl: baseURL })
  const server: http.Server = ctx.runtime.app.listen(port, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return {
    ctx,
    baseURL,
    async close() {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
      await ctx.close()
    },
  }
}
