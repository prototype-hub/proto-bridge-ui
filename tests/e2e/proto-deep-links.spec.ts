import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
import type { PrototypePage } from '../../src/modules/protohub-manager-ui/types'
const pages: PrototypePage[] = [
  {
    name: '业务目录',
    folder: true,
    children: [
      { name: '总览', pageId: 'home', path: 'index.html' },
      { name: '客户详情', pageId: 'detail', path: 'nested/customer.html' },
    ],
  },
]
test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
  for (const endpoint of [
    '**/api/prototype-hub/versions/v1/revisions/r-v1/pages',
    '**/api/prototype-hub/public/shares/open/*/revisions/r-v1/pages',
  ])
    await page.route(endpoint, (route) =>
      route.fulfill({ json: { success: true, status: 200, result: pages } }),
    )
})
test('member page deep links survive refresh, Back/Forward and copy without renewing page-only grants', async ({
  page,
}, testInfo) => {
  await login(page)
  const grants: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/preview-session')) grants.push(request.url())
  })
  await page.goto('preview/p1/v1')
  const frame = page.locator('.frame-stage > iframe')
  await expect(frame).toHaveAttribute('src', /\/index.html$/)
  await expect(page).toHaveURL(/revisionId=r-v1&pageId=home$/)
  await page.locator('.workspace-nav').getByText('客户详情', { exact: true }).click()
  await expect(frame).toHaveAttribute('src', /\/nested\/customer.html$/)
  await expect(page).toHaveURL(/revisionId=r-v1&pageId=detail$/)
  await expect(page.locator('.workspace-current')).toContainText('客户详情')
  await expect(page.locator('.current-path')).toHaveText('nested/customer.html')
  await page.goBack()
  await expect(frame).toHaveAttribute('src', /\/index.html$/)
  await page.goForward()
  await expect(frame).toHaveAttribute('src', /\/nested\/customer.html$/)
  expect(grants).toHaveLength(1)
  await page.reload()
  await expect(frame).toHaveAttribute('src', /\/nested\/customer.html$/)
  expect(grants).toHaveLength(2)
  const capture = await page.evaluateHandle(() => {
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied.push(value)
        },
      },
    })
    return copied
  })
  await page.getByRole('button', { name: '复制当前页面链接', exact: true }).click()
  const copied = new URL((await capture.jsonValue())[0])
  expect(copied.pathname).toBe('/tools/preview/p1/v1')
  expect([...copied.searchParams]).toEqual([
    ['revisionId', 'r-v1'],
    ['pageId', 'detail'],
  ])
  expect(copied.href).not.toMatch(/runtime|accessKey|password/)
  await capture.dispose()
  await page
    .getByRole('searchbox', { name: '查找页面名称或路径', exact: true })
    .fill('NESTED/CUSTOMER')
  await expect(page.locator('.workspace-nav .tree-page')).toHaveText(['客户详情'])
  await page.screenshot({
    path: testInfo.outputPath('deep-link-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await page.goto('preview/p1/v1?revisionId=r-v1&pageId=not-a-page')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(
    page.getByText('目标页面或修订无效、已不存在或不可访问，请从原型入口重新打开。', {
      exact: true,
    }),
  ).toBeVisible()
})
test('anonymous mobile deep link retains search/current page and refuses a revision outside current share policy', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const headers: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) headers.push(request.headers()['x-access-token'] || '')
  })
  await page.goto('share/open?revisionId=r-v1&pageId=detail')
  const frame = page.locator('.frame-stage > iframe')
  await expect(frame).toHaveAttribute('src', /\/nested\/customer.html$/)
  await expect(page.locator('.workspace-current')).toContainText('客户详情')
  await page.getByRole('button', { name: '显示页面目录', exact: true }).click()
  const tree = page.locator('.ant-drawer-body section[role="dialog"]')
  await tree
    .getByRole('searchbox', { name: '查找页面名称或路径', exact: true })
    .fill('no-such-page')
  await expect(
    tree.getByText('没有匹配的页面，当前页面仍保留在目录中。', { exact: true }),
  ).toBeVisible()
  await expect(tree.locator('.ant-tree-node-selected .tree-page')).toHaveText('客户详情')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('deep-link-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await page.reload()
  await expect(frame).toHaveAttribute('src', /\/nested\/customer.html$/)
  await page.goto('share/open?revisionId=old-history&pageId=detail')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(
    page.getByText('此链接的修订已不符合当前分享设置，请使用原分享入口重新打开。', { exact: true }),
  ).toBeVisible()
  expect(headers.length).toBeGreaterThan(0)
  expect(headers.every((value) => !value)).toBe(true)
})
