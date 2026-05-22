import { createCeRuntime } from './app.js'
import { loadCeEnv } from './scripts/env.js'

loadCeEnv()

const port = Number(process.env.PORT ?? 4100)
const host = process.env.HOST ?? '127.0.0.1'

const runtime = await createCeRuntime({ startWorkers: true })
runtime.app.listen(port, host, () => {
  console.log(`clearideas-ce listening on http://${host}:${port}`)
})
