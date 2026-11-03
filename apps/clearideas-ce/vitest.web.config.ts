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
    environment: 'jsdom',
    include: ['test/web/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['test/web/setup.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/ce-web',
      include: ['src-web/src/**/*.{ts,vue}'],
      exclude: ['src-web/src/main.ts'],
    },
  },
})
