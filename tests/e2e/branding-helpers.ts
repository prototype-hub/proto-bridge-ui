import { expect, type Locator } from '@playwright/test'

/** Confirm bundled branding assets without depending on Vite's development or build URL prefix. */
export async function expectDefaultBrandingAsset(
  locator: Locator,
  kind: 'logo' | 'ico' | 'background',
  attribute = 'src',
) {
  const source = await locator.getAttribute(attribute)
  expect(source).toBeTruthy()
  if (source!.startsWith('data:image/svg+xml,')) {
    const svg = decodeURIComponent(source!.slice('data:image/svg+xml,'.length))
    expect(svg).toContain('Original project artwork, 2026 project contributors.')
    expect(svg).toContain('SPDX-License-Identifier: Apache-2.0')
    const dimensions = kind === 'background' ? '1440 1080' : '64 64'
    expect(svg).toMatch(new RegExp(`viewBox=["']0 0 ${dimensions}["']`))
  } else {
    const path = kind === 'background' ? 'login/login' : 'logo/logo'
    await expect(locator).toHaveAttribute(attribute, new RegExp(`/assets/${path}\\.png(?:\\?.*)?$`))
  }
}
