import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { RevisionQuality } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
async function openReport(page: Page) {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: protoLocales.zh.revisionHistory, exact: true }).click()
  await page.getByRole('button', { name: protoLocales.zh.qualityCheck, exact: true }).click()
  return page.getByRole('dialog', { name: protoLocales.zh.qualityCheck, exact: true })
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('checks an old fixed revision once and downloads the same report after local pagination', async ({
  page,
  request,
}, testInfo) => {
  await request.post(`${origin}/__test/comparison`)
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: protoLocales.zh.revisionHistory, exact: true }).click()
  const history = page.getByRole('dialog', { name: protoLocales.zh.revisionHistory, exact: true })
  await history
    .getByRole('button', { name: protoLocales.zh.loadMoreRevisions, exact: true })
    .click()
  const old = history
    .getByRole('row')
    .filter({ has: page.getByText('compare-left', { exact: true }) })
  const outgoing: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/quality')) outgoing.push(req.url())
  })
  const fetching = page.waitForResponse((res) =>
    res.url().endsWith('/revisions/compare-left/quality'),
  )
  await old.getByRole('button', { name: protoLocales.zh.qualityCheck, exact: true }).click()
  const report = ((await (await fetching).json()) as { result: RevisionQuality }).result
  const dialog = page.getByRole('dialog', { name: protoLocales.zh.qualityCheck, exact: true })
  await expect(dialog.getByText('修订: compare-left', { exact: true })).toBeVisible()
  await expect(dialog.getByText('错误 51 · 提醒 1 · 共 52 项', { exact: true })).toBeVisible()
  await dialog.getByTitle('2', { exact: true }).click()
  await expect(
    dialog.getByRole('cell', { name: 'images/missing-50.png', exact: true }),
  ).toHaveCount(2)
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: protoLocales.zh.qualityDownload, exact: true }).click()
  const saved = await downloading
  expect(saved.suggestedFilename()).toBe('prototype-quality-v1-compare-left.json')
  expect(JSON.parse(await readFile((await saved.path())!, 'utf8'))).toEqual(report)
  expect(outgoing).toHaveLength(1)
  expect(outgoing[0]).toContain('/versions/v1/revisions/compare-left/quality')
  await page.screenshot({
    path: testInfo.outputPath('revision-quality-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(history.getByText('当前修订', { exact: true })).toBeVisible()
})

test('shows a denied report without findings and retries into an empty scoped result', async ({
  page,
}) => {
  let attempts = 0
  await page.route('**/api/prototype-hub/versions/v1/revisions/r-v1/quality', async (route) => {
    attempts++
    if (attempts === 1)
      return route.fulfill({
        status: 403,
        json: { success: false, status: 403, message: 'Quality access denied' },
      })
    const response = await route.fetch()
    const body = await response.json()
    body.result.findings = []
    Object.assign(body.result.summary, { errors: 0, warnings: 0, findingsTotal: 0 })
    await route.fulfill({ response, json: body })
  })
  const dialog = await openReport(page)
  await expect(dialog.getByText('Quality access denied', { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: protoLocales.zh.qualityDownload, exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect(dialog.getByText(protoLocales.zh.qualityNoFindings, { exact: true })).toBeVisible()
  await expect(
    dialog.getByText('未检查引用：外部 1 · 根绝对路径 2 · 页内锚点 3 · 其他协议 4', {
      exact: true,
    }),
  ).toBeVisible()
  expect(attempts).toBe(2)
})

test('keeps incomplete and omitted evidence visible and renders diagnostic paths as text', async ({
  page,
}) => {
  const hostile = '<img src=x onerror="window.qualityInjected=true">'
  await page.route('**/api/prototype-hub/versions/v1/revisions/r-v1/quality', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.result.complete = false
    Object.assign(body.result.summary, {
      omittedFindings: 42,
      skippedDocuments: 2,
      findingsTotal: 94,
    })
    body.result.findings[0].sourcePath = hostile
    await route.fulfill({ response, json: body })
  })
  const dialog = await openReport(page)
  await expect(dialog.getByText(protoLocales.zh.qualityIncomplete, { exact: true })).toBeVisible()
  await expect(
    dialog.getByText('已跳过 2 个文档，另有 42 项问题未收录；下载报告同样保留这些限制。', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(dialog.getByRole('cell', { name: hostile, exact: true })).toBeVisible()
  await expect(dialog.locator('img')).toHaveCount(0)
  expect(await page.evaluate(() => 'qualityInjected' in window)).toBe(false)
})

test('390px report keeps download and status inside the viewport with a scrollable findings table', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = await openReport(page)
  const download = dialog.getByRole('button', {
    name: protoLocales.zh.qualityDownload,
    exact: true,
  })
  await expect(download).toBeVisible()
  const wrapper = page.locator('.revision-quality-drawer .ant-drawer-content-wrapper')
  // Visible content can still be translated by the drawer's enter transition.
  await expect
    .poll(async () => {
      const bounds = await wrapper.boundingBox()
      return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390
    })
    .toBe(true)
  const bounds = await download.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  const drawer = await wrapper.boundingBox()
  expect(drawer!.x).toBeGreaterThanOrEqual(0)
  expect(drawer!.x + drawer!.width).toBeLessThanOrEqual(390)
  await expect(dialog.getByText(protoLocales.zh.qualityComplete, { exact: true })).toBeVisible()
  const table = dialog.locator('.ant-table-content')
  expect(
    await table.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      return element.scrollWidth > element.clientWidth && element.scrollLeft > 0
    }),
  ).toBe(true)
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth).toBeLessThanOrEqual(390)
  await testInfo.attach('revision-quality-mobile-layout', {
    body: JSON.stringify({
      drawer,
      download: bounds,
      documentWidth,
      table: await table.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollLeft: element.scrollLeft,
      })),
    }),
    contentType: 'application/json',
  })
  await page.screenshot({
    path: testInfo.outputPath('revision-quality-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
})
