import { createCeRuntime } from './app.js'
import { envValue } from './lib/env.js'
import { ceEnvFiles, loadCeEnv } from './scripts/env.js'

const envFiles = loadCeEnv()
console.log(
  envFiles.length > 0
    ? `clearideas-ce env files: ${envFiles.join(', ')}`
    : `clearideas-ce env files: none found (looked for ${ceEnvFiles().join(', ')})`,
)
const agentModel = envValue('AI_AGENT_MODEL', 'AI_CHAT_MODEL')
console.log(
  agentModel
    ? `clearideas-ce agents: model ${agentModel}`
    : 'clearideas-ce agents: not configured (set AI_AGENT_MODEL, or AI_CHAT_MODEL, to provider:model)',
)

const port = Number(process.env.PORT ?? 4100)
const host = process.env.HOST ?? '127.0.0.1'

const runtime = await createCeRuntime({ startWorkers: true })
const server = runtime.app.listen(port, host, () => {
  console.log(`clearideas-ce listening on http://${host}:${port}`)
})

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`clearideas-ce received ${signal}; shutting down`)
  const forceExit = setTimeout(() => process.exit(1), 30_000)
  forceExit.unref()
  try {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
    // Persists pending search index changes before the process exits.
    await runtime.close()
    process.exit(0)
  } catch (error) {
    console.error('clearideas-ce shutdown failed', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
