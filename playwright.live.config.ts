import { defineConfig, devices } from '@playwright/test'
import { statSync } from 'node:fs'
import { liveEnvironment } from './tests/live/environment'

liveEnvironment()
if (!statSync('dist/index.html').isFile())
  throw new Error('Run pnpm build before live verification')

// A busy port fails explicitly; the verifier never attaches to someone else's development server.
const port = Number(process.env.PROTO_E2E_UI_PORT || 5197)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('PROTO_E2E_UI_PORT must be an unprivileged TCP port')
}
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'tests/live',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 10000 },
  reporter: 'list',
  outputDir: 'test-results/live',
  use: {
    baseURL,
    // Live contexts contain real temporary credentials; no storage state, traces or media are exported.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'live-chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: `pnpm exec vite preview --config tests/live/vite.preview.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
  },
})
