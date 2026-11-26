import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import base from '../playwright.config'
export default defineConfig({
  ...base,
  testDir: './e2e',
  testMatch: 'delivery-document.spec.ts',
  outputDir: '/private/tmp/protohub-hky-f31-20261126/frontend-results',
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5313/tools/' },
  webServer: {
    command:
      'PROTOTYPE_HUB_TEST_DELIVERY_DOCUMENT=1 pnpm --config.package-manager-strict=false dev:mock --port 5313 --strictPort --base /tools/',
    url: 'http://127.0.0.1:5313/tools/',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    reuseExistingServer: true,
    timeout: 60000,
  },
})
