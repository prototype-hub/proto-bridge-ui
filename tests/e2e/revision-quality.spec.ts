import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { RevisionQuality } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
async function openReport(page: Page, language: 'zh' | 'en' = 'zh') {
  await login(page)
  if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.goto('prototype-hub/projects/p1')
  await page
    .getByRole('button', { name: protoLocales[language].revisionHistory, exact: true })
    .click()
  await page.getByRole('button', { name: protoLocales[language].qualityCheck, exact: true }).click()
  return page.getByRole('dialog', { name: protoLocales[language].qualityCheck, exact: true })
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

for (const language of ['zh', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${language} ${width}px keeps report, all export formats and scope usable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const outgoing: string[] = []
      page.on('request', (request) => {
        if (request.url().endsWith('/quality')) outgoing.push(request.url())
      })
      const dialog = await openReport(page, language)
      const labels = protoLocales[language]
      await expect(dialog.getByText(labels.qualityComplete, { exact: true })).toBeVisible()
      await expect
        .poll(async () => {
          const bounds = await page
            .locator('.revision-quality-drawer .ant-drawer-content-wrapper')
            .boundingBox()
          return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= width
        })
        .toBe(true)
      const reportContent = dialog.locator('.quality-content')
      const footer = dialog.locator('.quality-footer')
      for (const label of [
        labels.qualityDownload,
        labels.qualityDownloadXlsx,
        labels.qualityDownloadDocx,
      ]) {
        const button = dialog.getByRole('button', { name: label, exact: true })
        await expect(button).toBeVisible()
        const bounds = (await button.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(width === 390 ? 844 : 1000)
      }
      const footerBefore = await footer.boundingBox()
      await reportContent.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await dialog.getByText(labels.qualityScopeDetails, { exact: true }).click()
      await expect(dialog.getByText(labels.qualityScope, { exact: true })).toBeVisible()
      const footerAfter = await footer.boundingBox()
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(footerAfter![key]).toBeCloseTo(footerBefore![key], 2)
      await dialog.getByText(labels.qualityScopeDetails, { exact: true }).click()
      await reportContent.evaluate((element) => {
        element.scrollTop = 0
      })
      await page.screenshot({
        path: testInfo.outputPath(`after-${language}-${width}.png`),
        animations: 'disabled',
        fullPage: false,
      })
      for (const [format, label] of [
        ['json', labels.qualityDownload],
        ['xlsx', labels.qualityDownloadXlsx],
        ['docx', labels.qualityDownloadDocx],
      ] as const) {
        const waiting = page.waitForEvent('download')
        await dialog.getByRole('button', { name: label, exact: true }).click()
        const saved = await waiting
        expect(saved.suggestedFilename()).toBe(`prototype-quality-v1-r-v1.${format}`)
        const bytes = await readFile((await saved.path())!)
        if (format === 'json') {
          const report = JSON.parse(bytes.toString('utf8')) as RevisionQuality
          expect(report.revisionId).toBe('r-v1')
          expect(report.findings).toHaveLength(52)
        } else {
          const entries = unzipSync(new Uint8Array(bytes))
          expect(entries['[Content_Types].xml']).toBeDefined()
          expect(entries[format === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml']).toBeDefined()
          const content = Object.entries(entries)
            .filter(([name]) => name.endsWith('.xml'))
            .map(([, value]) => strFromU8(value))
            .join('\n')
          expect(content).toContain('r-v1')
          expect(content).toContain('images/missing-50.png')
          expect(content).toContain('页面/首页.html')
          expect(content).toContain(language === 'zh' ? '未收录问题数' : 'Omitted findings')
        }
      }
      expect(outgoing).toHaveLength(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
  }
}

test('keyboard exports all three formats then Escape returns focus to the same history action', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: protoLocales.zh.revisionHistory, exact: true }).click()
  const history = page.getByRole('dialog', { name: protoLocales.zh.revisionHistory, exact: true })
  const trigger = history.getByRole('button', { name: protoLocales.zh.qualityCheck, exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: protoLocales.zh.qualityCheck, exact: true })
  for (const [format, label] of [
    ['json', protoLocales.zh.qualityDownload],
    ['xlsx', protoLocales.zh.qualityDownloadXlsx],
    ['docx', protoLocales.zh.qualityDownloadDocx],
  ] as const) {
    const button = dialog.getByRole('button', { name: label, exact: true })
    await button.focus()
    await expect(button).toBeFocused()
    const downloading = page.waitForEvent('download')
    await page.keyboard.press('Enter')
    const saved = await downloading
    expect(saved.suggestedFilename()).toBe(`prototype-quality-v1-r-v1.${format}`)
    await saved.path()
    await expect(button).toBeEnabled()
    await expect(button).toBeFocused()
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(history).toBeVisible()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByText(protoLocales.zh.qualityComplete, { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
})

test('export permission denial clears the cached report instead of offering a stale download', async ({
  page,
}) => {
  const dialog = await openReport(page)
  await expect(dialog.getByText(protoLocales.zh.qualityComplete, { exact: true })).toBeVisible()
  await page.route('**/api/prototype-hub/versions/v1/revisions/r-v1', (route) =>
    route.fulfill({
      status: 403,
      json: { success: false, status: 403, message: 'Revoked' },
    }),
  )
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await dialog
    .getByRole('button', { name: protoLocales.zh.qualityDownloadDocx, exact: true })
    .click()
  await expect(
    dialog.getByText(protoLocales.zh.qualityAccessChanged, { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: protoLocales.zh.qualityDownload, exact: true }),
  ).toHaveCount(0)
  await expect(dialog.locator('.quality-findings')).toHaveCount(0)
  expect(downloads).toEqual([])
})

test('closing during export authorization cancels the busy download and ignores its late success', async ({
  page,
}) => {
  const dialog = await openReport(page)
  await expect(dialog.getByText(protoLocales.zh.qualityComplete, { exact: true })).toBeVisible()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  let authorizations = 0
  await page.route('**/api/prototype-hub/versions/v1/revisions/r-v1', async (route) => {
    authorizations++
    entered()
    await gate
    await route.continue().catch(() => {})
  })
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  const json = dialog.getByRole('button', { name: protoLocales.zh.qualityDownload, exact: true })
  await json.focus()
  await page.keyboard.press('Enter')
  await waiting
  await expect(dialog.getByRole('status')).toHaveText(protoLocales.zh.qualityExporting)
  await expect(dialog.locator('.quality-export')).toHaveAttribute('aria-busy', 'true')
  await expect(json).toHaveAttribute('aria-disabled', 'true')
  await expect(json).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  const excel = dialog.getByRole('button', {
    name: protoLocales.zh.qualityDownloadXlsx,
    exact: true,
  })
  await expect(excel).toBeFocused()
  await expect(excel).toBeDisabled()
  await page.keyboard.press('Enter')
  expect(authorizations).toBe(1)
  await page.keyboard.press('Escape')
  release()
  await expect(dialog).toHaveCount(0)
  expect(downloads).toEqual([])
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
