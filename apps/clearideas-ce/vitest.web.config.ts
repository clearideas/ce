import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': new URL('./src-web/src', import.meta.url).pathname,
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
