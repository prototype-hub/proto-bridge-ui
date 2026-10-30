import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
  await request.post('http://127.0.0.1:5187/__test/clock', {
    data: { now: Date.UTC(2026, 9, 31, 4) },
  })
})
for (const language of ['zh', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${language} ${width}: overview values, daily data, period and share drill-down are usable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      await page.goto('prototype-hub/statistics')
      await expect(
        page.getByRole('heading', {
          name: language === 'zh' ? '统计概览' : 'Overview',
          exact: true,
        }),
      ).toBeVisible()
      await expect(page.locator('dd')).toHaveText(['1', '1', '2', '18'])
      await expect(
        page.getByRole('img', { name: language === 'zh' ? '分享访问趋势' : 'Share open trend' }),
      ).toBeVisible()
      const daily = page.locator('.visit-trend summary')
      await daily.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.visit-trend tbody tr')).toHaveCount(7)
      await expect(page.locator('.visit-trend tbody tr').first()).toContainText(
        language === 'zh' ? '未采集' : 'Not collected',
      )
      const period = page.getByRole('radio', {
        name: language === 'zh' ? '近 30 天' : 'Last 30 days',
        exact: true,
      })
      await period.focus()
      await page.keyboard.press('Space')
      await expect(page).toHaveURL(/days=30/)
      await expect(page.locator('.visit-trend tbody tr')).toHaveCount(30)
      await expect(page.locator('.visit-trend table')).toBeHidden()
      await daily.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.visit-trend table')).toBeVisible()
      await daily.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.visit-trend table')).toBeHidden()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`statistics-${language}-${width}.png`),
        fullPage: true,
      })
      const shares = page.getByRole('link', {
        name: language === 'zh' ? '管理分享' : 'Manage shares',
        exact: true,
      })
      await shares.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/projects\/p1\?focus=shares/)
      const share = page
        .getByRole('button', {
          name: language === 'zh' ? '分享管理' : 'Manage shares',
          exact: true,
        })
        .first()
      await expect(share).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect
        .poll(() =>
          page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
        )
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(share).toBeFocused()
      expect(errors).toEqual([])
    })
  }
}

test('share drill-down skips failed and migration-required versions before focusing an available share action', async ({
  page,
}) => {
  await login(page)
  await page.route('**/api/prototype-hub/versions/_query?*', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    const ready = json.result.data[0]
    json.result.data = [
      { ...ready, id: 'failed', versionName: 'Failed version', status: 'failed' },
      { ...ready, id: 'migration', versionName: 'Legacy version', migrationRequired: true },
      ready,
    ]
    json.result.total = 3
    return route.fulfill({ response, json })
  })
  await page.goto('prototype-hub/projects/p1?focus=shares')
  const failed = page.getByRole('row').filter({ hasText: 'Failed version' })
  const migration = page.getByRole('row').filter({ hasText: 'Legacy version' })
  const ready = page.getByRole('row').filter({ hasText: 'V1' })
  await expect(failed.locator('details')).not.toHaveAttribute('open')
  await expect(migration.locator('details')).not.toHaveAttribute('open')
  await expect(ready.getByRole('button', { name: '分享管理', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '分享管理', exact: true })).toBeVisible()
})

test('null permission metrics, empty scope, service error and zero collection remain distinct', async ({
  page,
}) => {
  await login(page)
  let state: 'restricted' | 'empty' | 'error' | 'zero' = 'restricted'
  await page.route('**/api/prototype-hub/statistics?*', async (route) => {
    if (state === 'error')
      return route.fulfill({
        status: 503,
        json: { success: false, status: 503, message: 'Statistics temporarily unavailable' },
      })
    const response = await route.fetch()
    const json = await response.json()
    if (state === 'restricted')
      Object.assign(json.result, {
        versionCount: null,
        shareCount: null,
        visits: null,
        trend: null,
        ranking: null,
      })
    if (state === 'empty')
      Object.assign(json.result, {
        projectCount: 0,
        versionCount: 0,
        shareCount: 0,
        visits: 0,
        trend: [],
        ranking: [],
      })
    if (state === 'zero')
      Object.assign(json.result, {
        visits: 0,
        ranking: [],
        trend: json.result.trend.map((point: { date: string; visits: number | null }) => ({
          ...point,
          visits: point.visits === null ? null : 0,
        })),
      })
    return route.fulfill({ response, json })
  })
  await page.goto('prototype-hub/statistics')
  await expect(page.locator('dd')).toHaveText(['1', '未授权', '未授权', '未授权'])
  state = 'empty'
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '当前没有可访问的项目', exact: true }),
  ).toBeVisible()
  state = 'error'
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('统计暂不可用', { exact: true })).toBeVisible()
  await expect(page.locator('dd')).toHaveCount(0)
  state = 'zero'
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('dd')).toHaveText(['1', '1', '2', '0'])
  await expect(
    page.getByText('当前周期未记录分享访问，日数据中的 0 表示已开始采集。', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.visit-trend svg')).toHaveCount(0)
})

test('only an authorized root runtime handshake records a share open, once until reload', async ({
  page,
}) => {
  const visits: unknown[] = []
  page.on('request', (request) => {
    if (/\/visits$/.test(request.url())) visits.push(request.postDataJSON())
  })
  await page.goto('share/open')
  await expect.poll(() => visits.length).toBe(1)
  expect(visits[0]).toEqual({ ticket: expect.any(String) })
  await page.getByText('Child page', { exact: true }).click()
  await expect(page.locator('iframe')).toHaveAttribute('src', /child\.html$/)
  await expect(page.locator('.frame-spinner')).toHaveCount(0)
  expect(visits).toHaveLength(1)
  await page.reload()
  await expect.poll(() => visits.length).toBe(2)
  expect(visits[1]).not.toEqual(visits[0])
})

test('password forms, rejected passwords, runtime error documents and internal preview do not count', async ({
  page,
}) => {
  const visits: string[] = []
  page.on('request', (request) => {
    if (/\/visits$/.test(request.url())) visits.push(request.url())
  })
  await page.goto('share/locked')
  await expect(page.getByRole('button', { name: '打开原型', exact: true })).toBeVisible()
  expect(visits).toHaveLength(0)
  await page.getByLabel('分享密码', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: '打开原型', exact: true }).click()
  await expect(page.getByText('Invalid share password', { exact: true })).toBeVisible()
  expect(visits).toHaveLength(0)
  await page.getByLabel('分享密码', { exact: true }).fill('test-share-password')
  await page.getByRole('button', { name: '打开原型', exact: true }).click()
  await expect.poll(() => visits.length).toBe(1)
  await page.route('**/api/prototype-hub/public/shares/**/runtime/**', (route) =>
    route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Runtime unavailable</h1>' }),
  )
  await page.goto('share/open')
  await expect(page.locator('iframe')).toBeVisible()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Runtime unavailable', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.frame-spinner')).toHaveCount(0)
  expect(visits).toHaveLength(1)
  await login(page)
  await page.goto('preview/p1/v1')
  await expect(page.locator('iframe')).toBeVisible()
  expect(visits).toHaveLength(1)
})
