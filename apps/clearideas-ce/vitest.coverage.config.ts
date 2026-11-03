import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src-web/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts', 'test/api/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: 'forks',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: '../../coverage/ce',
      include: [
        'src/**/*.ts',
        '../../packages/clearideas-core/src/**/*.ts',
      ],
      exclude: ['src/server.ts', 'test/**'],
    },
  },
})
