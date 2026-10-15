import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const plugins = [vue()]
  if (command === 'serve' && mode === 'mock') {
    const { mockPlugin } = await import('./tests/fixtures/mock-plugin')
    plugins.push(mockPlugin())
  }
  return {
    plugins,
    base: env.VITE_PUBLIC_PATH || '/',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy:
        mode === 'mock'
          ? undefined
          : {
              '/api': {
                target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
                changeOrigin: true,
                ws: true,
              },
            },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
            http: ['axios'],
          },
        },
      },
      chunkSizeWarningLimit: 1100,
    },
    test: {
      environment: 'jsdom',
      include: [
        'tests/unit/**/*.test.ts',
        'tests/component/**/*.test.ts',
        'tests/contract/**/*.test.ts',
      ],
      clearMocks: true,
      // Each isolated jsdom fork loads the real Ant Design tree; bound memory use while keeping files parallel.
      maxWorkers: process.env.VITEST_MAX_WORKERS ? Number(process.env.VITEST_MAX_WORKERS) : 2,
    },
  }
})
