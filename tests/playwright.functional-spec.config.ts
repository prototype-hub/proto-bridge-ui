import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import base from '../playwright.config'
if (!process.env.PROTOTYPE_HUB_TEST_INSPECTOR_PATH)
  throw new Error('Supply the real backend inspector.js for region acceptance.')
export default defineConfig({
  ...base,
  testDir: './e2e',
  testMatch: 'functional-spec.spec.ts',
  outputDir: '../../frontend-functional-spec-results',
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5303/tools/' },
  webServer: {
    command:
      'pnpm --config.package-manager-strict=false dev:mock --port 5303 --strictPort --base /tools/',
    url: 'http://127.0.0.1:5303/tools/',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    reuseExistingServer: true,
    timeout: 60000,
  },
})
