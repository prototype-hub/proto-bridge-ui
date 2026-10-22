import { expect, test } from '@playwright/test'
import { brandingUploadImages } from '../fixtures/images'
import { login } from './system-helpers'
import { expectDefaultBrandingAsset } from './branding-helpers'
import type { Share } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('HTTP share dialog copies via the real legacy command with its modal focus boundary', async ({
  page,
  context,
}) => {
  const insecure = 'http://clipboard.test'
  // Forward this non-loopback HTTP origin locally; it remains an insecure context in Chrome.
  await page.route(`${insecure}/**`, async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.addInitScript(() => {
    const nativeCopy = document.execCommand.bind(document)
    document.execCommand = (command, showUI, value) => {
      const selected = document.activeElement
      const result = nativeCopy(command, showUI, value)
      if (command === 'copy')
        Reflect.set(window, '__legacyCopy', {
          result,
          inDialog: !!selected?.closest('[role="dialog"]'),
          text: selected instanceof HTMLTextAreaElement ? selected.value : '',
        })
      return result
    }
  })
  await page.goto(`${insecure}/tools/login`)
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
  expect(await page.evaluate(() => typeof navigator.clipboard)).toBe('undefined')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await page.goto(`${insecure}/tools/protohub/projects/p1`)
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const row = dialog.locator('tbody tr.ant-table-row').first()
  const url = (await row.locator('.share-url').innerText()).trim()
  expect(url).toBe(`${insecure}/tools/share/open`)
  const button = row.getByRole('button', { name: '复制', exact: true })
  await button.click()
  await expect(page.getByText('已复制', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__legacyCopy'))).toEqual({
    result: true,
    inDialog: true,
    text: `Contract project-V1：${url}`,
  })
  await expect(dialog.locator('textarea[readonly]')).toHaveCount(0)
  await expect(button).toBeFocused()

  await context.grantPermissions(['clipboard-read'], { origin })
  const reader = await context.newPage()
  await reader.goto(`${origin}/tools/login`)
  expect(await reader.evaluate(() => navigator.clipboard.readText())).toBe(
    `Contract project-V1：${url}`,
  )
  await reader.close()
})

test('share rows distinguish permanent, temporary, expired and disabled links and update on expiry', async ({
  page,
}, testInfo) => {
  const now = new Date('2026-10-13T04:00:00Z').valueOf()
  await page.clock.install({ time: now })
  const base: Share = {
    revisionMode: 'fixed',
    revisionId: 'r-v1',
    revoked: false,
    configVersion: 1,
    id: 'permanent',
    token: 'permanent',
    projectId: 'p1',
    versionId: 'v1',
    createdAt: now,
    sharePath: '/share/permanent',
    enabled: true,
    passwordRequired: false,
  }
  const shares: Share[] = [
    { ...base, expiresAt: null },
    { ...base, id: 'temporary', token: 'temporary', expiresAt: now + 3600000 },
    { ...base, id: 'expired', token: 'expired', expiresAt: now - 1000 },
    { ...base, id: 'disabled', token: 'disabled', enabled: false },
  ]
  await page.route('**/api/prototype-hub/versions/v1/shares', (route) =>
    route.fulfill({ json: { success: true, status: 200, result: shares } }),
  )
  await login(page)
  await page.goto('protohub/projects/p1')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const row = (token: string) =>
    dialog
      .locator('tbody tr.ant-table-row')
      .filter({ has: page.locator('.share-url').filter({ hasText: `/share/${token}` }) })
  await expect(row('permanent').locator('.share-status')).toHaveText('永久有效')
  await expect(row('permanent').locator('.share-expiry-time')).toHaveText('—')
  await expect(row('permanent').locator('.share-password-state')).toHaveText('无密码')
  await expect(row('permanent').locator('.share-created-time')).toHaveText(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  )
  await expect(row('temporary').locator('.share-status')).toHaveText('短期有效')
  await expect(row('temporary').locator('.share-expiry-time')).toHaveText(/2026-10-13 \d{2}:00:00/)
  for (const token of ['expired', 'disabled'])
    await expect(row(token).locator('.share-status')).toHaveText(
      token === 'disabled' ? '已暂停' : '已过期',
    )
  await page.screenshot({
    path: testInfo.outputPath('share-validity.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await page.clock.fastForward(3600000)
  await expect(row('temporary').locator('.share-status')).toHaveText('已过期')
  await expect(row('permanent').locator('.share-status')).toHaveText('永久有效')
})

test('default assets render in login and settings, and uploaded branding wins after save and reload', async ({
  page,
}, testInfo) => {
  const paths = {
    logo: '/api/custom-logo.png',
    ico: '/api/custom-logo.ico',
    background: '/api/custom-background.png',
  }
  const assets = brandingUploadImages
  for (const kind of ['logo', 'ico', 'background'] as const)
    await page.route(`**${paths[kind]}`, (route) =>
      route.fulfill({
        contentType: kind === 'ico' ? 'image/x-icon' : 'image/png',
        body: assets[kind],
      }),
    )
  await page.route('**/api/file/upload', (route) => {
    const body = route.request().postDataBuffer()!.toString()
    const kind = body.includes('filename="custom-logo.ico"')
      ? 'ico'
      : body.includes('filename="custom-logo.png"')
        ? 'logo'
        : 'background'
    return route.fulfill({
      json: { success: true, status: 200, result: { accessUrl: paths[kind] } },
    })
  })
  await page.goto('login')
  await expectDefaultBrandingAsset(page.locator('.login-brand img'), 'logo')
  await expectDefaultBrandingAsset(page.locator('.login-visual img'), 'background')
  await expectDefaultBrandingAsset(page.locator('link[rel="icon"]'), 'ico', 'href')
  await login(page)
  await page.goto('system/Basis')
  for (const kind of ['logo', 'ico', 'background'] as const) {
    const upload = page.locator(`.branding-upload.${kind}`)
    await expectDefaultBrandingAsset(upload.locator('img'), kind)
    await expect
      .poll(() =>
        upload
          .locator('img')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true)
  }
  await page.screenshot({
    path: testInfo.outputPath('settings-default-branding.png'),
    animations: 'disabled',
    fullPage: true,
  })
  // Saving unrelated settings must leave image fields absent rather than saving bundled Vite URLs.
  const defaultSave = page.waitForRequest((request) =>
    request.url().endsWith('/system/config/scope/_save'),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const defaultDto = (await defaultSave).postDataJSON() as {
    scope: string
    properties: Record<string, unknown>
  }[]
  const front = defaultDto.find((scope) => scope.scope === 'front')!.properties
  for (const kind of ['logo', 'ico', 'background']) expect(front).not.toHaveProperty(kind)
  await expect(page.getByText('保存成功', { exact: true })).toBeVisible()
  for (const kind of ['logo', 'ico', 'background'] as const) {
    const upload = page.locator(`.branding-upload.${kind}`)
    await upload.locator('input[type="file"]').setInputFiles({
      name: paths[kind].split('/').at(-1)!,
      mimeType: kind === 'ico' ? 'image/x-icon' : 'image/png',
      buffer: assets[kind],
    })
    await expect(upload.locator('img')).toHaveAttribute('src', paths[kind])
  }
  const saved = page.waitForRequest((request) =>
    request.url().endsWith('/system/config/scope/_save'),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const dto = (await saved).postDataJSON() as {
    scope: string
    properties: Record<string, unknown>
  }[]
  expect(dto.find((scope) => scope.scope === 'front')!.properties).toMatchObject(paths)
  await expect(page.locator('.pro-logo')).toHaveAttribute('src', paths.logo)
  await page.reload()
  for (const kind of ['logo', 'ico', 'background'] as const)
    await expect(page.locator(`.branding-upload.${kind} img`)).toHaveAttribute('src', paths[kind])
  await page.goto('login')
  await expect(page.locator('.login-brand img')).toHaveAttribute('src', paths.logo)
  await expect(page.locator('.login-visual img')).toHaveAttribute('src', paths.background)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', paths.ico)
  await expect
    .poll(() =>
      page
        .locator('.login-visual img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true)
})
