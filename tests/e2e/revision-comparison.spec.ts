import { expect, test, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
const origin = 'http://127.0.0.1:5187'
const comparePath =
  'prototype-hub/compare/p1/v1?leftRevisionId=compare-left&rightRevisionId=compare-right'
async function choose(page: Page, id: string) {
  await page
    .getByRole('checkbox', { name: `选择修订 ${id}`, exact: true })
    .locator('..')
    .click()
}
async function frames(page: Page) {
  await expect(
    page
      .locator('[data-pane=left]')
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Left revision', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .locator('[data-pane=right]')
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Right revision', exact: true }),
  ).toBeVisible()
  for (const side of ['left', 'right']) {
    await expect(page.locator(`[data-pane=${side}] iframe`)).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms',
    )
    await expect(page.locator(`[data-pane=${side}] iframe`)).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    )
  }
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
  await request.post(`${origin}/__test/comparison`)
})
test('history selection survives cursor paging and opens two immutable, independent previews', async ({
  page,
  context,
}, testInfo) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: '历史修订', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '历史修订', exact: true })
  await choose(page, 'history-51')
  await dialog.getByRole('button', { name: '加载更多修订', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: '选择修订 history-51', exact: true }),
  ).toBeChecked()
  await choose(page, 'history-51')
  await choose(page, 'compare-left')
  await expect(dialog.getByRole('button', { name: '比较修订', exact: true })).toBeDisabled()
  await choose(page, 'compare-right')
  const popup = page.waitForEvent('popup')
  const outgoing: string[] = []
  context.on('request', (request) => outgoing.push(request.url()))
  await dialog.getByRole('button', { name: '比较修订', exact: true }).click()
  const comparison = await popup
  await frames(comparison)
  expect(outgoing.some((url) => url.includes('/current-revision'))).toBe(false)
  const query = new URL(comparison.url()).searchParams
  expect([...query.keys()]).toEqual([
    'leftRevisionId',
    'rightRevisionId',
    'leftPageId',
    'rightPageId',
  ])
  expect(query.get('leftRevisionId')).toBe('compare-left')
  expect(query.get('rightRevisionId')).toBe('compare-right')
  const left = comparison.locator('[data-pane=left]')
  await left.getByRole('button', { name: '显示页面目录', exact: true }).click()
  const tree = comparison.locator('.ant-drawer-body section[role="dialog"]')
  await tree.getByText('Removed page', { exact: true }).click()
  await expect(comparison).toHaveURL(
    (url) =>
      url.searchParams.get('leftPageId') === 'left-only' &&
      url.searchParams.get('rightPageId') === 'right-home',
  )
  await comparison.goBack()
  await expect(comparison).toHaveURL((url) => url.searchParams.get('leftPageId') === 'left-home')
  await comparison.goForward()
  await expect(comparison).toHaveURL((url) => url.searchParams.get('leftPageId') === 'left-only')
  await expect(
    comparison
      .locator('[data-pane=right]')
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Right revision', exact: true }),
  ).toBeVisible()
  await comparison.screenshot({
    path: testInfo.outputPath('revision-comparison-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await comparison.close()
})
test('diff rows preserve absent and legacy sides and paginate both complete filtered lists', async ({
  page,
}) => {
  await login(page)
  await page.goto(comparePath)
  await frames(page)
  const pages = page.getByRole('region', { name: '页面差异', exact: true })
  await expect(pages.locator('.comparison-summary')).toHaveText(
    '新增 1 · 删除 1 · 变化 1 · 未变化 56',
  )
  const added = pages
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'new.html', exact: true }) })
  await added.getByRole('button', { name: '对比此页', exact: true }).click()
  await expect(page.locator('[data-pane=left]')).toContainText(protoLocales.zh.compareMissingPage)
  await expect(page.locator('[data-pane=left] iframe')).toHaveCount(0)
  await expect(page).toHaveURL(
    (url) =>
      !url.searchParams.has('leftPageId') && url.searchParams.get('rightPageId') === 'right-only',
  )
  await page.getByText('显示未变化项', { exact: true }).click()
  const legacy = pages
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'legacy.html', exact: true }) })
  await legacy.getByRole('button', { name: '对比此页', exact: true }).click()
  for (const side of ['left', 'right']) {
    await expect(page.locator(`[data-pane=${side}]`)).toContainText(
      protoLocales.zh.compareLegacyPage,
    )
    await expect(page.locator(`[data-pane=${side}] iframe`)).toHaveCount(0)
  }
  const nextPages = page.waitForResponse(
    (response) => new URL(response.url()).searchParams.get('pagesPageIndex') === '1',
  )
  await pages.getByTitle('2', { exact: true }).click()
  expect((await (await nextPages).json()).result.pages.total).toBe(59)
  await page.getByRole('tab', { name: '文件差异', exact: true }).click()
  const files = page.getByRole('region', { name: '文件差异', exact: true })
  await expect(files.locator('.comparison-summary')).toHaveText(
    '新增 1 · 删除 1 · 变化 2 · 未变化 124',
  )
  const nextFiles = page.waitForResponse(
    (response) => new URL(response.url()).searchParams.get('filesPageIndex') === '1',
  )
  await files.getByTitle('2', { exact: true }).click()
  const result = (await (await nextFiles).json()).result
  expect(result.files.total).toBe(128)
  expect(result.pages.pageIndex).toBe(1)
  await expect(files.locator('.comparison-hash').first()).toHaveText(/^[a-f0-9]{64}$/)
})
test('390px comparison keeps fixed identities, visible controls and both preview panes usable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto(comparePath)
  await frames(page)
  await expect(page.getByRole('button', { name: '复制比较链接', exact: true })).toBeVisible()
  for (const side of ['left', 'right']) {
    const pane = page.locator(`[data-pane=${side}]`)
    const box = await pane.boundingBox()
    expect(box!.width).toBeGreaterThan(300)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    const copy = pane.getByRole('button', { name: protoLocales.zh.copyPageLink, exact: true })
    await expect(copy).toBeEnabled()
    await expect(copy).toHaveText(protoLocales.zh.copyPageLink)
    for (const element of [copy, copy.locator('span')]) {
      const bounds = await element.boundingBox()
      expect(bounds!.width).toBeGreaterThan(0)
      expect(bounds!.x).toBeGreaterThanOrEqual(box!.x)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(box!.x + box!.width)
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('revision-comparison-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
})
test('invalid or mismatched revision targets fail without silently loading current content', async ({
  page,
}) => {
  await login(page)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto(
    'prototype-hub/compare/p1/v1?leftRevisionId=compare-left&leftRevisionId=compare-right&rightRevisionId=compare-right',
  )
  await expect(page.getByText(protoLocales.zh.compareInvalidPair, { exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(
    requests.some(
      (url) => url.includes('/revisions/_compare') || url.includes('/current-revision'),
    ),
  ).toBe(false)
  await page.goto(
    'prototype-hub/compare/p1/v1?leftRevisionId=missing&rightRevisionId=compare-right',
  )
  await expect(page.getByText('Revision unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})
