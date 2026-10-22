import { expect, type Locator } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** Confirm bundled branding assets without depending on Vite's development or build URL prefix. */
export async function expectDefaultBrandingAsset(
  locator: Locator,
  kind: 'logo' | 'ico' | 'background',
  attribute = 'src',
) {
  const source = await locator.getAttribute(attribute)
  expect(source).toBeTruthy()
  const path = kind === 'background' ? 'login/login' : 'logo/logo'
  const asset = readFileSync(`src/modules/authentication-manager-ui/assets/${path}.png`)
  const response = await locator.page().request.get(new URL(source!, locator.page().url()).href)
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toMatch(/^image\/png(?:;|$)/)
  const digest = (content: Buffer) => createHash('sha256').update(content).digest('hex')
  expect(digest(await response.body())).toBe(digest(asset))
}
