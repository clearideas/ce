import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src-web/src', import.meta.url)),
      // Same as vite.config.ts: resolve the contracts package from source so the web suite does not
      // require `npm run build:contracts:core` first.
      '@clearideas/contracts-core': fileURLToPath(
        new URL('../../packages/clearideas-contracts-core/src/index.ts', import.meta.url),
      ),
      '@clearideas/pdf-viewer': fileURLToPath(
        new URL('../../packages/clearideas-pdf-viewer/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/web/**/*.test.ts'],
    css: false,
    // One file at a time, each in its own child process. Files must stay isolated: they
    // `vi.mock` the API client and mount into document.body, which leaks across a shared
    // worker. `forks` rather than `threads` because a worker thread's start handshake runs on
    // the main event loop; on slower machines (Windows + synced folders) it has exceeded Vitest's
    // 60 s start timeout ("Timeout waiting for worker to respond") and silently dropped a file.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['test/web/setup.ts'],
    server: {
      deps: {
        // Vuetify (and friends) ship ESM that imports `.css` files; Node cannot load those, so
        // they must be transformed by Vite rather than externalised.
        inline: [
          /[\\/]node_modules[\\/]vuetify[\\/]/,
          /[\\/]node_modules[\\/]vue-tippy[\\/]/,
          /[\\/]node_modules[\\/]@fortawesome[\\/]/,
        ],
      },
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: '../../coverage/ce-web',
      include: ['src-web/src/**/*.{ts,vue}'],
      exclude: ['src-web/src/main.ts', 'src-web/src/env.d.ts'],
      // Plan item 4.4: CI fails below these (run with `npm run test:ce:web:coverage`). Measured when
      // introduced: components 79.9 % lines / 65.0 % branches, views 92.0 % / 79.5 %. The vendored PDF
      // viewer lives in packages/ and is outside `include`.
      thresholds: {
        'src-web/src/components/**': { lines: 70, branches: 60 },
        'src-web/src/views/**': { lines: 70, branches: 60 },
      },
    },
  },
})
