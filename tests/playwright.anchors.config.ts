import { defineConfig } from '@playwright/test'
import base from '../playwright.config'
if (!process.env.PROTOTYPE_HUB_TEST_INSPECTOR_PATH)
  throw new Error(
    'Set PROTOTYPE_HUB_TEST_INSPECTOR_PATH to the real backend inspector.js resource for root-anchor browser acceptance.',
  )
export default defineConfig(base, { testDir: './runtime' })
