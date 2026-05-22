import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  root: path.resolve(__dirname, 'src-web'),
  plugins: [
    vue({
      script: { defineModel: true },
    }),
    vuetify({ autoImport: true, styles: { configFile: 'src/styles/vuetify/variables.scss' } }),
  ],
  resolve: {
    dedupe: ['vue', 'vuetify'],
    alias: {
      '@clearideas/contracts-core': path.resolve(
        __dirname,
        '../../packages/clearideas-contracts-core/src/index.ts',
      ),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, '../../packages/clearideas-contracts-core')],
    },
    proxy: {
      '/api': 'http://127.0.0.1:4100',
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'web'),
    emptyOutDir: true,
    cssMinify: 'esbuild',
  },
})
