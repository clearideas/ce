import { createCeRuntime } from './app.js'
import { loadCeEnv } from './scripts/env.js'

loadCeEnv()

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
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
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
