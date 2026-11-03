import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['test/api/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/ce-api',
      include: [
        'src/**/*.ts',
        '../../packages/clearideas-core/src/**/*.ts',
      ],
      exclude: ['src/server.ts', 'test/**'],
    },
  },
})
