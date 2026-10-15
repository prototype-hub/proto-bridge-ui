import { test, expect } from '@playwright/test'
import { login } from './system-helpers'
import { systemLocales } from '../../src/modules/authentication-manager-ui/locale-messages'
import type { ApiResponse } from '../../src/shared/api/types'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
test('basic branding and scoped configuration survive a refresh', async ({ page }) => {
  const existingMapSettings = {
    webKey: 'fixture-existing-web-key',
    apiKey: 'fixture-existing-api-key',
    secretKey: 'fixture-existing-secret-key',
  }
  let seedMapSettings = true
  await page.route('**/api/system/config/scopes', async (route) => {
    const response = await route.fetch()
    const payload: ApiResponse<{ scope: string; properties: Record<string, unknown> }[]> =
      await response.json()
    if (seedMapSettings) {
      payload.result = payload.result.map((row) =>
        row.scope === 'amap' ? { ...row, properties: existingMapSettings } : row,
      )
      seedMapSettings = false
    }
    await route.fulfill({ response, json: payload })
  })
  await login(page)
  await page.goto('system/Basis')
  for (const label of [
    systemLocales.zh.webKey,
    systemLocales.zh.apiKey,
    systemLocales.zh.secretKey,
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0)
  const uploads = page.locator('.branding-upload')
  await expect(uploads).toHaveCount(3)
  await expect(uploads.getByRole('textbox')).toHaveCount(0)
  await expect(uploads.locator('input[type="file"]')).toHaveCount(3)
  await page.getByLabel('系统名称', { exact: true }).fill('测试管理端')
  await page.getByRole('switch', { name: '显示备案信息', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('请输入备案号', { exact: true })).toBeVisible()
  await page.getByLabel('ICP备案号', { exact: true }).fill('ICP备-test')
  const saved = page.waitForRequest((request) =>
    request.url().endsWith('/system/config/scope/_save'),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).postDataJSON()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: 'front',
        properties: expect.objectContaining({ title: '测试管理端' }),
      }),
      { scope: 'amap', properties: existingMapSettings },
    ]),
  )
  await expect(page.locator('.pro-brand')).toContainText('测试管理端')
  const reloadedScopes = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/system/config/scopes'),
  )
  await page.reload()
  await expect(page.getByLabel('系统名称', { exact: true })).toHaveValue('测试管理端')
  await expect(page.getByLabel('ICP备案号', { exact: true })).toHaveValue('ICP备-test')
  const loaded: ApiResponse<{ scope: string; properties: Record<string, unknown> }[]> = await (
    await reloadedScopes
  ).json()
  expect(loaded.result).toContainEqual({ scope: 'amap', properties: existingMapSettings })
  await expect(page.locator('.basis-columns > *')).toHaveCount(2)
  await page.screenshot({
    path: test.info().outputPath('pro-basis.png'),
    fullPage: true,
    animations: 'disabled',
  })
})
test('saved search reuses the legacy bucket without adding duplicate wildcards', async ({
  page,
}) => {
  await login(page)
  await page.goto('system/user')
  const firstRow = page.locator('.query-row[data-query-row="0.0"]')
  await firstRow.locator('.query-field .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .filter({ hasText: '用户名' })
    .click()
  await firstRow.getByPlaceholder('请输入查询内容', { exact: true }).fill('admin')
  await page.getByRole('button', { name: '保存查询', exact: true }).click()
  await page.getByRole('dialog').getByPlaceholder('名称', { exact: true }).fill('管理员查询')
  const saved = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/user/settings/system-user'),
  )
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
  const savedPayload = (await saved).postDataJSON()
  expect(savedPayload).toMatchObject({ name: '管理员查询' })
  expect(JSON.parse(savedPayload.content)).toMatchObject({ version: 1 })
  expect(savedPayload.content).toContain('"value":"admin"')
  expect(savedPayload.content).not.toContain('%admin%')
  await page.getByRole('button', { name: '搜索记录', exact: true }).click()
  const restored = page.waitForRequest((request) => request.url().endsWith('/user/detail/_query'))
  await page
    .locator('.query-history-menu')
    .getByRole('menuitem', { name: '管理员查询', exact: true })
    .click()
  const restoredTerms = (await restored).postDataJSON().terms
  const query = page.waitForRequest((request) => request.url().endsWith('/user/detail/_query'))
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  expect((await query).postDataJSON().terms).toEqual(restoredTerms)
  expect(restoredTerms).toEqual([{ column: 'username', termType: 'like', value: '%admin%' }])
})
