import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
if (!process.env.PROTOTYPE_HUB_TEST_INSPECTOR_PATH)
  throw new Error(
    'Set PROTOTYPE_HUB_TEST_INSPECTOR_PATH to the real backend inspector.js resource.',
  )
export default defineConfig({
  testDir: './runtime',
  testMatch: 'inspect-tools.spec.ts',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5194/tools/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command:
      'node node_modules/vite/bin/vite.js --host 127.0.0.1 --mode mock --port 5194 --strictPort --base /tools/',
    env: { PROTOTYPE_HUB_TEST_INSPECT_TOOLS: '1' },
    url: 'http://127.0.0.1:5194/tools/',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
