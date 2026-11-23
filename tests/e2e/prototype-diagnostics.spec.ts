import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { login } from './system-helpers'
import { fixtureDiagnostics } from '../fixtures/diagnostics'

test.beforeEach(async ({ request, baseURL }) => {
  await request.post(new URL('/__test/reset', baseURL).href)
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`${language} ${width}: inspect diagnostics, refresh and export the same snapshot by keyboard`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      let reads = 0
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/prototype-hub/diagnostics') reads++
      })
      await page.goto('prototype-hub/diagnostics')
      const text = (zh: string, en: string) => (language === 'zh' ? zh : en)
      await expect(
        page.getByRole('heading', {
          name: text('本地运行诊断', 'Local runtime diagnostics'),
          exact: true,
        }),
      ).toBeVisible()
      await expect(page.locator('[data-check]')).toHaveCount(5)
      const refresh = page.getByRole('button', {
        name: text('采集诊断', 'Collect diagnostics'),
        exact: true,
      })
      await refresh.focus()
      await page.keyboard.press('Enter')
      await expect(refresh).not.toHaveClass(/ant-btn-loading/)
      const privacy = page.getByText(text('查看导出范围', 'Review export contents'), {
        exact: true,
      })
      await privacy.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.diagnostics-privacy details')).toHaveAttribute('open', '')
      const exportButton = page.getByRole('button', {
        name: text('下载当前快照', 'Download current snapshot'),
        exact: true,
      })
      await exportButton.focus()
      const previousReads = reads
      const pending = page.waitForEvent('download')
      await page.keyboard.press('Enter')
      const download = await pending
      const value = JSON.parse(await readFile((await download.path())!, 'utf8'))
      expect(value.schemaVersion).toBe(1)
      expect(value.complete).toBe(true)
      expect(Object.keys(value.checks)).toEqual([
        'database',
        'storage',
        'cleanup',
        'mail',
        'license',
      ])
      expect(JSON.stringify(value)).not.toMatch(
        /installationId|recipient|fingerprint|rawClaims|password|hostName/,
      )
      expect(reads).toBe(previousReads)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: info.outputPath(`diagnostics-${language}-${width}.png`),
        fullPage: true,
      })
      expect(errors).toEqual([])
    })
  }

test('partial check, transient failure, unsupported schema and permission denial have distinct recovery states', async ({
  page,
}) => {
  await login(page)
  const snapshot = fixtureDiagnostics()
  snapshot.complete = false
  snapshot.checks.storage = { status: 'timeout', code: 'TIMEOUT', data: null }
  snapshot.checks.database.data!.projects = {
    used: 9,
    limit: -1,
    remaining: -1,
    canCreate: true,
    overLimit: false,
  }
  let mode = 'partial'
  await page.route('**/api/prototype-hub/diagnostics', async (route) => {
    if (mode === 'failed')
      return route.fulfill({ status: 503, json: { status: 503, message: 'secret stack trace' } })
    if (mode === 'invalid')
      return route.fulfill({ json: { status: 200, result: { ...snapshot, schemaVersion: 2 } } })
    if (mode === 'denied')
      return route.fulfill({ status: 403, json: { status: 403, message: 'denied' } })
    return route.fulfill({ json: { status: 200, result: snapshot } })
  })
  await page.goto('prototype-hub/diagnostics')
  await expect(page.getByRole('heading', { name: '部分检查未完成', exact: true })).toBeVisible()
  await expect(page.locator('[data-check="storage"]')).toContainText('超时')
  await expect(page.locator('[data-check="database"]')).toContainText('不限')
  const refresh = page.getByRole('button', { name: '采集诊断', exact: true })
  const download = page.getByRole('button', { name: '下载当前快照', exact: true })
  mode = 'failed'
  await refresh.click()
  await expect(page.getByText('诊断采集失败', { exact: true })).toBeVisible()
  await expect(page.locator('[data-check]')).toHaveCount(5)
  await expect(download).toBeEnabled()
  await expect(page.getByText('secret stack trace')).toHaveCount(0)
  mode = 'invalid'
  await refresh.click()
  await expect(
    page.getByText('返回的诊断格式无法识别。请核对前后端版本，当前禁止导出。'),
  ).toBeVisible()
  await expect(download).toBeDisabled()
  mode = 'partial'
  await refresh.click()
  await expect(download).toBeEnabled()
  mode = 'denied'
  await refresh.click()
  await expect(page.getByText('没有诊断读取权限', { exact: true })).toBeVisible()
  await expect(page.locator('[data-check]')).toHaveCount(0)
  await expect(download).toBeDisabled()
})
