import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
import type { PrototypePage } from '../../src/modules/protohub-manager-ui/types'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('uploading a revision keeps old shares and short grants, and history opens its own revision', async ({
  page,
  request,
}, testInfo) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  const opening = page.waitForEvent('popup')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const current = await opening
  await expect(current.locator('.frame-stage > iframe')).toHaveAttribute('src', /\/runtime\/v1\//)
  const originalRuntime = await current.locator('.frame-stage > iframe').getAttribute('src')
  await page.locator('.version-management summary').first().click()
  await page.getByRole('button', { name: '上传新修订', exact: true }).click()
  const upload = page.getByRole('dialog')
  await expect(
    upload.getByText('固定分享继续展示原修订，跟随分享在下次打开时更新。', { exact: false }),
  ).toBeVisible()
  await upload.getByLabel('版本名称').fill('V1 revision two')
  await upload.locator('input[type=file]').setInputFiles({
    name: 'new.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('new revision'),
  })
  const updating = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().endsWith('/versions/v1'),
  )
  await upload.getByRole('button', { name: '保存', exact: true }).click()
  const updated = (await (await updating).json()).result as {
    currentRevisionId: string
    revisionCount: number
  }
  expect(updated.currentRevisionId).not.toBe('r-v1')
  expect(updated.revisionCount).toBe(2)
  await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：1 / 5')
  expect((await request.get(originalRuntime!)).status()).toBe(200)
  await current.close()
  const shared = (await (await request.get('/api/prototype-hub/public/shares/open')).json())
    .result as { revisionId: string; versionName: string }
  expect(shared).toMatchObject({ revisionId: 'r-v1', versionName: 'V1' })
  await page.getByRole('button', { name: '历史修订', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '历史修订', exact: true })
  await expect(drawer.getByText('当前修订', { exact: true })).toBeVisible()
  const historicalOpening = page.waitForEvent('popup')
  const historyRequest = page
    .context()
    .waitForEvent('request', (outgoing) =>
      outgoing.url().endsWith('/revisions/r-v1/preview-session'),
    )
  const historyPages = page
    .context()
    .waitForEvent('response', (response) => response.url().endsWith('/revisions/r-v1/pages'))
  await drawer
    .getByRole('row')
    .filter({ has: page.getByText('r-v1', { exact: true }) })
    .getByRole('button', { name: '预览', exact: true })
    .click()
  const historical = await historicalOpening
  await historyRequest
  const manifest = ((await (await historyPages).json()) as { result: PrototypePage[] }).result
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((item) => [item, ...flatten(item.children || [])])
  const firstPage = flatten(manifest).find((item) => item.folder !== true && item.path)
  expect(firstPage?.pageId).toBeTruthy()
  await expect(historical).toHaveURL(
    (url) =>
      url.pathname === '/tools/preview/p1/v1' &&
      url.searchParams.get('revisionId') === 'r-v1' &&
      url.searchParams.get('pageId') === firstPage!.pageId,
  )
  expect([...new URL(historical.url()).searchParams]).toEqual([
    ['revisionId', 'r-v1'],
    ['pageId', firstPage!.pageId],
  ])
  expect(new URL(historical.url()).hash).toBe('')
  await expect(historical.getByText('V1', { exact: true })).toBeVisible()
  await expect(historical.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
  await historical.close()
  await page.screenshot({
    path: testInfo.outputPath('revision-history.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  const latestOpening = page.waitForEvent('popup')
  const latestRequest = page
    .context()
    .waitForEvent('request', (outgoing) =>
      outgoing.url().endsWith(`/revisions/${updated.currentRevisionId}/preview-session`),
    )
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const latest = await latestOpening
  await latestRequest
  await expect(latest.getByText('V1 revision two', { exact: true })).toBeVisible()
  await latest.close()
})

test('a concurrent upload shows refresh guidance and sends no automatic retry', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  let requests = 0
  await page.route('**/api/prototype-hub/versions/v1', (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    requests++
    return route.fulfill({
      status: 409,
      json: {
        success: false,
        status: 409,
        code: 'PROTOTYPE_HUB_VERSION_CONFLICT',
        message: 'Conflict',
      },
    })
  })
  await page.locator('.version-management summary').first().click()
  await page.getByRole('button', { name: '上传新修订', exact: true }).click()
  const upload = page.getByRole('dialog')
  await upload.locator('input[type=file]').setInputFiles({
    name: 'new.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('new revision'),
  })
  await upload.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    upload.getByText('此版本已产生新的修订，请关闭窗口并刷新版本列表，确认内容后重新上传。', {
      exact: true,
    }),
  ).toBeVisible()
  expect(requests).toBe(1)
  await expect(page.locator('.version-name').filter({ hasText: /^V1$/ })).toBeVisible()
})

test('legacy rows remain visible with all revision content actions disabled', async ({ page }) => {
  await page.route('**/api/prototype-hub/versions/_query?projectId=p1', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.result.data = data.result.data.map((version: object) => ({
      ...version,
      currentRevisionId: null,
      revisionId: null,
      revisionCount: 0,
      migrationRequired: true,
    }))
    await route.fulfill({ response, json: data })
  })
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await expect(page.locator('.version-name').filter({ hasText: /^V1$/ })).toBeVisible()
  await expect(
    page.getByText('旧版本尚未完成修订迁移，请联系管理员迁移后再预览、上传新修订或创建分享。', {
      exact: true,
    }),
  ).toBeVisible()
  await page.locator('.version-management summary').first().click()
  for (const name of ['预览', '上传新修订', '分享管理', '历史修订'])
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
})
