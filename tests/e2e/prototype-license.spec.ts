import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
import { fixtureLicense, fixtureAcceptedLicense, fixtureLicenseDocument } from '../fixtures/license'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ request, baseURL }) => {
  await request.post(new URL('/__test/reset', baseURL).href)
})

for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`${language} ${width}: installation request, credential import and declarations work by keyboard`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      await page.goto('prototype-hub/license')
      const text = (zh: string, en: string) => (language === 'zh' ? zh : en)
      await expect(
        page.getByRole('heading', { name: text('免费基础版', 'Free basic edition'), exact: true }),
      ).toBeVisible()
      const download = page.getByRole('button', {
        name: text('下载安装请求', 'Download installation request'),
        exact: true,
      })
      await download.focus()
      const pending = page.waitForEvent('download')
      await page.keyboard.press('Enter')
      const file = await pending
      const request = JSON.parse(await readFile((await file.path())!, 'utf8'))
      expect(request).toEqual({
        schemaVersion: 1,
        installationId: fixtureLicense().installationId,
        algorithm: 'Ed25519',
        purpose: 'prototype-hub-license-request',
      })
      await page.screenshot({
        path: info.outputPath(`license-free-${language}-${width}.png`),
        fullPage: true,
      })
      await page.locator('input[type=file]').setInputFiles({
        name: '凭证.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(fixtureLicenseDocument)),
      })
      await expect(
        page.getByLabel(text('凭证内容', 'Credential contents'), { exact: true }),
      ).toHaveValue(JSON.stringify(fixtureLicenseDocument))
      const submit = page.getByRole('button', {
        name: text('验证并导入', 'Verify & import'),
        exact: true,
      })
      await submit.focus()
      await page.keyboard.press('Enter')
      await expect(
        page.getByText(text('凭证已验证并保存', 'Credential verified and saved'), { exact: true }),
      ).toBeVisible()
      await expect(page.locator('.license-result')).toBeFocused()
      await expect(page.locator('.license-capacity dd')).toHaveText(['5', '5'])
      const details = page.locator('.license-record summary')
      await details.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.license-claims')).toContainText('10')
      await expect(page.locator('.license-claims')).toContainText('Example customer')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: info.outputPath(`license-imported-${language}-${width}.png`),
        fullPage: true,
      })
      expect(errors).toEqual([])
    })
  }

test('validation errors retain input and focus, unknown results check the accepted record without resubmitting', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/license')
  const contents = page.getByLabel('凭证内容', { exact: true })
  const submit = page.getByRole('button', { name: '验证并导入', exact: true })
  await submit.click()
  await expect(contents).toBeFocused()
  await expect(page.getByRole('alert').getByText('请选择凭证文件或粘贴完整内容。')).toBeVisible()
  await contents.fill('{broken')
  await submit.click()
  await expect(contents).toHaveValue('{broken')
  await expect(contents).toBeFocused()
  await contents.fill(JSON.stringify(fixtureLicenseDocument))
  let count = 0
  await page.route('**/api/prototype-hub/license/_import', async (route) => {
    count++
    await route.abort('failed')
  })
  await submit.click()
  await expect(page.getByText('导入结果尚未确认', { exact: true })).toBeVisible()
  await expect(contents).toBeDisabled()
  await expect(page.getByRole('button', { name: '重试同一凭证', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '核对接受记录', exact: true }).click()
  await expect(
    page.getByText(
      '当前接受记录尚未匹配所选内容，不能据此判断本次导入失败。你可以再次核对，或重试同一凭证。',
      { exact: true },
    ),
  ).toBeVisible()
  expect(count).toBe(1)
  await expect(page.getByRole('button', { name: '重试同一凭证', exact: true })).toBeEnabled()
  await page.unroute('**/api/prototype-hub/license/_import')
  await page.getByRole('button', { name: '重试同一凭证', exact: true }).click()
  await expect(page.getByText('凭证已验证并保存', { exact: true })).toBeVisible()
})

test('missing trust, revoked administrator and untrusted saved credentials remain distinct', async ({
  page,
}) => {
  await login(page)
  let state = { ...fixtureLicense(), trustConfigured: false }
  await page.route('**/api/prototype-hub/license', (route) =>
    route.fulfill({ json: { success: true, result: state } }),
  )
  await page.goto('prototype-hub/license')
  await expect(page.getByText('尚未配置受信任公钥', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '验证并导入', exact: true })).toHaveCount(0)
  state = {
    ...fixtureAcceptedLicense('fingerprint'),
    status: 'untrusted',
    verifiedEntitlements: null,
  }
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('heading', { name: '凭证暂无法验证', exact: true })).toBeVisible()
  await expect(page.locator('.license-record')).toBeVisible()
  await page.route('**/api/prototype-hub/license', (route) =>
    route.fulfill({ status: 403, json: { success: false, status: 403, message: 'Access denied' } }),
  )
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('无权访问授权管理', { exact: true })).toBeVisible()
  await expect(page.locator('.license-record')).toHaveCount(0)
  await expect(page.locator('.license-identity')).toHaveCount(0)
})

test('a refused import clears credential contents and returns keyboard focus to the permission result', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/license')
  await page.getByLabel('凭证内容', { exact: true }).fill(JSON.stringify(fixtureLicenseDocument))
  await page.route('**/api/prototype-hub/license/_import', (route) =>
    route.fulfill({ status: 403, json: { success: false, status: 403, message: 'Access denied' } }),
  )
  await page.getByRole('button', { name: '验证并导入', exact: true }).click()
  await expect(page.locator('.license-denied')).toBeFocused()
  await expect(page.getByLabel('凭证内容', { exact: true })).toHaveCount(0)
  await expect(page.locator('.license-identity')).toHaveCount(0)
})

test('query-only permission keeps installation data readable and does not offer an import action', async ({
  page,
}) => {
  await page.route('**/api/authorize/me', (route) =>
    route.fulfill({
      json: {
        success: true,
        result: {
          permissions: [
            { id: 'prototype-hub-project', actions: ['query'] },
            { id: 'prototype-hub-license', actions: ['query'] },
          ],
        },
      },
    }),
  )
  await login(page)
  await page.goto('prototype-hub/license')
  await expect(
    page.getByText('当前仅有查看权限。导入凭证需要授权管理的保存权限。', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '下载安装请求', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '验证并导入', exact: true })).toHaveCount(0)
})

test('plain HTTP without WebCrypto still submits to the server and keeps draft on a cancelled navigation', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'crypto', { value: {}, configurable: true }),
  )
  await login(page)
  await page.goto('prototype-hub/license')
  const contents = page.getByLabel('凭证内容', { exact: true })
  await contents.fill(JSON.stringify(fixtureLicenseDocument))
  await page.getByRole('menuitem', { name: '原型项目', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(contents).toHaveValue(JSON.stringify(fixtureLicenseDocument))
  await page.getByRole('button', { name: '验证并导入', exact: true }).click()
  await expect(page.getByText('凭证已验证并保存', { exact: true })).toBeVisible()
})

test('zero epoch declarations and maximum-length project identifiers remain readable at 390px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.getByRole('button', { name: '语言', exact: true }).click()
  const accepted = fixtureAcceptedLicense('fingerprint')
  accepted.verifiedEntitlements = {
    ...fixtureLicenseDocument.payload,
    trialEndsAt: 0,
    maintenanceUntil: 0,
    projectVersionGrants: [{ projectId: 'p'.repeat(64), extraVersionBlocks: 1 }],
  }
  await page.route('**/api/prototype-hub/license', (route) =>
    route.fulfill({ json: { success: true, result: accepted } }),
  )
  await page.goto('prototype-hub/license')
  await page.locator('.license-record summary').click()
  for (const label of ['Declared trial end', 'Declared maintenance end']) {
    const row = page
      .locator('.license-claims > div')
      .filter({ has: page.getByText(label, { exact: true }) })
    await expect(row).toContainText('1970')
  }
  await expect(page.locator('.license-claims')).toContainText('p'.repeat(64))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: info.outputPath('license-zero-dates-long-project-en-390.png'),
    fullPage: true,
  })
})
