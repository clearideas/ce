import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/ce-unit',
      include: [
        'src/**/*.ts',
        '../../packages/clearideas-core/src/**/*.ts',
      ],
      exclude: ['src/server.ts', 'test/**'],
    },
  },
})
