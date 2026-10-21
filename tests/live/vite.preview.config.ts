import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { liveEnvironment } from './environment'

// Keep private .env.local files out of the production-dist preview and its API proxy.
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  envDir: false,
  base: '/',
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: { '/api': { target: liveEnvironment().apiOrigin, changeOrigin: true } },
  },
})
