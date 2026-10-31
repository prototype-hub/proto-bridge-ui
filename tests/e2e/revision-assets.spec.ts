import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'

const endpoint = /\/api\/prototype-hub\/versions\/v1\/revisions\/r-v1\/assets(?:\?.*)?$/
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
async function openHistory(page: Page) {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: '历史修订', exact: true }).click()
  return page.getByRole('dialog', { name: '历史修订', exact: true })
}
async function openAssets(page: Page) {
  const history = await openHistory(page)
  await history.getByRole('button', { name: '原始资产', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '原始资产', exact: true })
  await expect(panel.getByRole('heading', { name: 'Contract project V1' })).toBeVisible()
  return panel
}
test('fixed-revision selections survive server paging/search, ZIP and JSON match, and Back restores comparison selection/focus', async ({
  page,
}) => {
  const history = await openHistory(page)
  const revision = history.getByRole('checkbox')
  await revision.check()
  const trigger = history.getByRole('button', { name: '原始资产', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: '原始资产', exact: true })
  await expect(panel.locator('h2')).toBeFocused()
  await panel.getByRole('checkbox', { name: '选择 images/icon-01.svg', exact: true }).check()
  await panel.getByTitle('2', { exact: true }).click()
  await expect(
    panel.getByRole('checkbox', { name: '选择 images/首页 图标.svg', exact: true }),
  ).toBeVisible()
  await panel.getByRole('checkbox', { name: '选择 images/首页 图标.svg', exact: true }).check()
  let searches = 0
  page.on('request', (req) => {
    if (
      req.url().includes('/assets?') &&
      new URL(req.url()).searchParams.get('search') === 'icon-02'
    )
      searches++
  })
  await panel.getByRole('textbox', { name: '搜索原始文件路径', exact: true }).fill('icon-02')
  await page.keyboard.press('Enter')
  await expect(panel.locator('.asset-row')).toHaveCount(1)
  expect(searches).toBe(1)
  await expect(panel.locator('.assets-selected')).toContainText('已选择 2 项')
  const selected = ['images/icon-01.svg', 'images/首页 图标.svg']
  const zipEvent = page.waitForEvent('download')
  await panel.getByRole('button', { name: '下载所选 ZIP', exact: true }).click()
  const zip = await zipEvent
  const files = unzipSync(await readFile((await zip.path())!))
  expect(Object.keys(files).sort()).toEqual(['META-INF/prototype-assets.json', ...selected].sort())
  const manifestEvent = page.waitForEvent('download')
  await panel.getByRole('button', { name: '所选路径清单', exact: true }).click()
  const manifest = JSON.parse(await readFile((await (await manifestEvent).path())!, 'utf8'))
  expect(manifest.files.map((asset: { path: string }) => asset.path)).toEqual(selected)
  expect(manifest.total).toBe(2)
  expect(JSON.parse(new TextDecoder().decode(files['META-INF/prototype-assets.json']))).toEqual(
    manifest,
  )
  await panel.getByText('整个修订与导出说明', { exact: true }).click()
  await expect(panel.getByText(protoLocales.zh.assetsAllScope, { exact: true })).toBeVisible()
  const allEvent = page.waitForEvent('download')
  await panel.getByRole('button', { name: '全部路径清单', exact: true }).click()
  const all = JSON.parse(await readFile((await (await allEvent).path())!, 'utf8'))
  expect(all.files).toHaveLength(53)
  await panel.getByRole('button', { name: '返回历史修订', exact: true }).click()
  await expect(history).toBeVisible()
  await expect(revision).toBeChecked()
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('dialog', { name: '原始资产', exact: true })).toHaveCount(0)
})
test('single original download retains Unicode filename and public shares expose no asset entry', async ({
  page,
}) => {
  const panel = await openAssets(page)
  await panel.getByTitle('2', { exact: true }).click()
  const event = page.waitForEvent('download')
  await panel.getByRole('button', { name: '下载原文件 images/首页 图标.svg', exact: true }).click()
  const file = await event
  expect(file.suggestedFilename()).toBe('首页 图标.svg')
  expect(await readFile((await file.path())!, 'utf8')).toContain('<svg')
  await page.goto('share/open')
  await expect(page.locator('.frame-stage > iframe')).toBeVisible()
  await expect(page.getByRole('button', { name: '原始资产', exact: true })).toHaveCount(0)
})
test('denied list clears results, refresh shows an empty revision, and mismatched identity is not displayed', async ({
  page,
}) => {
  let attempts = 0
  await page.route(endpoint, async (route) => {
    if (++attempts === 1)
      return route.fulfill({
        status: 403,
        json: { success: false, status: 403, message: 'Denied' },
      })
    const response = await route.fetch(),
      body = await response.json()
    Object.assign(body.result, { data: [], total: 0, totalBytes: 0, assetCount: 0, assetBytes: 0 })
    await route.fulfill({ response, json: body })
  })
  const panel = await openAssets(page)
  await expect(panel.getByText(protoLocales.zh.assetsUnavailable, { exact: true })).toBeVisible()
  await expect(panel.locator('.asset-row')).toHaveCount(0)
  await panel.getByRole('button', { name: '重试', exact: true }).click()
  await expect(panel.getByText(protoLocales.zh.assetsEmpty, { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '下载所选 ZIP', exact: true })).toBeDisabled()
  await page.unroute(endpoint)
  await page.route(endpoint, async (route) => {
    const response = await route.fetch(),
      body = await response.json()
    body.result.projectId = 'other-project'
    await route.fulfill({ response, json: body })
  })
  await panel.getByRole('button', { name: '返回历史修订', exact: true }).click()
  await page
    .getByRole('dialog', { name: '历史修订', exact: true })
    .getByRole('button', { name: '原始资产', exact: true })
    .click()
  await expect(panel.getByText(protoLocales.zh.assetsUnavailable, { exact: true })).toBeVisible()
  await expect(panel.locator('.asset-row')).toHaveCount(0)
})
test('export limits remain actionable, denial clears selected paths, and no failed export auto-retries', async ({
  page,
}) => {
  const panel = await openAssets(page)
  await panel.getByRole('checkbox', { name: '选择 images/icon-01.svg', exact: true }).check()
  let requests = 0
  await page.route('**/assets/_zip', (route) => {
    requests++
    const status = requests === 1 ? 413 : requests === 2 ? 429 : 403
    return route.fulfill({ status, json: { success: false, status, message: 'Export failed' } })
  })
  const save = panel.getByRole('button', { name: '下载所选 ZIP', exact: true })
  await save.click()
  await expect(panel.getByRole('alert')).toContainText(protoLocales.zh.assetsTooLarge)
  await save.click()
  await expect(panel.getByRole('alert')).toContainText(protoLocales.zh.assetsBusy)
  await save.click()
  await expect(panel.getByRole('alert')).toContainText(protoLocales.zh.assetsUnavailable)
  await expect(panel.locator('.asset-row')).toHaveCount(0)
  await expect(panel.locator('.assets-selected')).toContainText('已选择 0 项')
  expect(requests).toBe(3)
})
test('closing during preparation aborts and prevents a late binary from being saved', async ({
  page,
}) => {
  const panel = await openAssets(page)
  await panel.getByRole('checkbox', { name: '选择 images/icon-01.svg', exact: true }).check()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let arrived!: () => void
  const pending = new Promise<void>((resolve) => {
    arrived = resolve
  })
  await page.route('**/assets/_zip', async (route) => {
    const response = await route.fetch()
    arrived()
    await gate
    await route.fulfill({ response }).catch(() => {})
  })
  const downloads: string[] = []
  page.on('download', (file) => downloads.push(file.suggestedFilename()))
  await panel.getByRole('button', { name: '下载所选 ZIP', exact: true }).click()
  await pending
  await expect(panel.getByText(protoLocales.zh.assetsPreparing, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  release()
  await expect(page.getByRole('dialog', { name: '历史修订', exact: true })).toBeVisible()
  await page
    .getByRole('dialog', { name: '历史修订', exact: true })
    .getByRole('button', { name: '原始资产', exact: true })
    .click()
  await expect(panel.locator('.assets-selected')).toContainText('已选择 0 项')
  expect(downloads).toEqual([])
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`${language} ${width}px history, asset workspace, preview and Inspector preserve hierarchy and keyboard access`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await login(page)
      if (language === 'en')
        await page.evaluate(() => localStorage.setItem('proto-bridge-ui:language', 'en'))
      const copy = protoLocales[language]
      await page.goto('prototype-hub/projects/p1')
      await page.getByRole('button', { name: copy.revisionHistory, exact: true }).click()
      const history = page.getByRole('dialog', { name: copy.revisionHistory, exact: true })
      await expect(history.getByText('r-v1', { exact: true })).toBeVisible()
      await page.screenshot({
        path: info.outputPath(`after-${language}-${width}-history.png`),
        animations: 'disabled',
        fullPage: true,
      })
      const trigger = history.getByRole('button', { name: copy.originalAssets, exact: true })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const panel = page.getByRole('dialog', { name: copy.originalAssets, exact: true })
      await expect(panel.locator('h2')).toBeFocused()
      await expect(panel.locator('.asset-row')).toHaveCount(50)
      await page.screenshot({
        path: info.outputPath(`after-${language}-${width}-assets-top.png`),
        animations: 'disabled',
        fullPage: true,
      })
      await page.keyboard.press('Tab')
      await expect(
        panel.getByRole('textbox', { name: copy.assetsSearch, exact: true }),
      ).toBeFocused()
      const first = panel.getByRole('checkbox', {
        name: copy.assetsSelect.replace('{path}', 'images/icon-01.svg'),
        exact: true,
      })
      await first.focus()
      await page.keyboard.press('Space')
      await expect(first).toBeChecked()
      const primary = panel.getByRole('button', { name: copy.assetsDownloadSelected, exact: true })
      let reached = false
      for (let step = 0; step < 120; step++) {
        await page.keyboard.press('Tab')
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement
          const footer = document.querySelector('.assets-footer')!.getBoundingClientRect()
          const bounds = element.getBoundingClientRect()
          return {
            asset: !!element.closest('.asset-row'),
            visible: bounds.top >= 56 && bounds.bottom <= footer.top,
          }
        })
        if (focused.asset) expect(focused.visible).toBe(true)
        if (await primary.evaluate((element) => element === document.activeElement)) {
          reached = true
          break
        }
      }
      expect(reached).toBe(true)
      await expect(primary).toBeInViewport()
      const bounds = await primary.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: info.outputPath(`after-${language}-${width}-assets.png`),
        animations: 'disabled',
        fullPage: true,
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await page.goto('preview/p1/v1')
      const iframe = page.frameLocator('.frame-stage > iframe')
      await expect(iframe.locator('#u1')).toBeVisible()
      await page.screenshot({
        path: info.outputPath(`after-${language}-${width}-preview.png`),
        animations: 'disabled',
        fullPage: true,
      })
      const previewTrigger = page.getByRole('button', { name: copy.originalAssets, exact: true })
      await previewTrigger.focus()
      await page.keyboard.press('Enter')
      await expect(panel.locator('.asset-row')).toHaveCount(50)
      await expect(panel.locator('.assets-revision')).toContainText('r-v1')
      await page.keyboard.press('Escape')
      await expect(previewTrigger).toBeFocused()
      await page
        .locator('.ant-radio-button-wrapper')
        .filter({ hasText: language === 'en' ? /^Inspect$/ : /^检查$/ })
        .click()
      await iframe.locator('#u1').click()
      await expect(page.locator('.element-title')).toHaveText('BUTTON#u1')
      await page.getByRole('tab', { name: copy.assets, exact: true }).click()
      await expect(page.getByRole('button', { name: 'SVG', exact: true })).toBeVisible()
      await page.screenshot({
        path: info.outputPath(`after-${language}-${width}-inspector.png`),
        animations: 'disabled',
        fullPage: true,
      })
    })
  }
