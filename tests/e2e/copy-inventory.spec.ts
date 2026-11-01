import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'
const inventoryPath =
  /\/api\/prototype-hub\/versions\/v1\/revisions\/r-v1\/pages\/[^/]+\/copy-inventory/
async function openCopy(page: Page, language: 'zh' | 'en' = 'zh') {
  await login(page)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  const labels = protoLocales[language],
    trigger = page.getByRole('button', { name: labels.pageResources, exact: true })
  await expect(page.frameLocator('iframe').locator('#u1')).toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const item = page.getByRole('menuitem', { name: labels.copyInventory, exact: true })
  await item.focus()
  await page.keyboard.press('Enter')
  const workspace = page.getByRole('dialog', { name: labels.copyInventory, exact: true })
  await expect(
    workspace.getByRole('heading', { name: labels.copyNotExtracted, exact: true }),
  ).toBeVisible()
  return { workspace, trigger, labels }
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F47 full copy review journey ${language} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const { workspace, trigger, labels } = await openCopy(page, language)
      const common =
        language === 'zh' ? { close: '关闭', cancel: '取消' } : { close: 'Close', cancel: 'Cancel' }
      await page.screenshot({ path: info.outputPath('copy-start.png'), animations: 'disabled' })
      await workspace.getByRole('button', { name: labels.copyExtract, exact: true }).click()
      await expect(workspace.locator('.copy-row')).toHaveCount(1)
      await expect(workspace.getByText(labels.copyDynamicGap, { exact: true })).toBeVisible()
      const staticRow = workspace.locator('.copy-row').first()
      await staticRow.getByRole('button', { name: labels.copyEdit, exact: true }).click()
      await expect(workspace.locator('#copy-term')).toBeFocused()
      await expect(workspace.locator('#copy-text')).toHaveCount(0)
      await workspace
        .getByLabel(labels.copyBusinessTerm, { exact: true })
        .fill(language === 'zh' ? '主要操作' : 'Primary action')
      await workspace
        .getByLabel(labels.copyRequirementUrl, { exact: true })
        .fill('https://example.com/requirements/copy-review')
      await workspace.getByRole('button', { name: labels.copySave, exact: true }).click()
      await expect(workspace.locator('.copy-editor')).toHaveCount(0)
      await expect(staticRow.locator('.copy-metadata')).toContainText(
        language === 'zh' ? '主要操作' : 'Primary action',
      )
      await workspace.getByRole('button', { name: labels.copyAdd, exact: true }).click()
      await expect(workspace.locator('#copy-text')).toBeFocused()
      const text = '=动态文案 "quoted"\n<script>window.__copyXss = 1</script>'
      await workspace.getByLabel(labels.copyText, { exact: true }).fill(text)
      await workspace
        .getByLabel(labels.copyNote, { exact: true })
        .fill(
          language === 'zh'
            ? '错误状态由作者补充，保留完整原文。'
            : 'The author supplies error-state copy. Keep the full original text.',
        )
      await workspace
        .getByLabel(labels.copyRequirementUrl, { exact: true })
        .fill('https://user:password@example.com/task')
      await workspace.getByRole('button', { name: labels.copySave, exact: true }).click()
      await expect(workspace.getByText(labels.copyInvalidUrl, { exact: true })).toBeVisible()
      await expect(workspace.locator('#copy-url')).toBeFocused()
      await workspace
        .getByLabel(labels.copyRequirementUrl, { exact: true })
        .fill('https://example.com/tasks/dynamic-copy')
      await expect(workspace.getByText(labels.copyInvalidUrl, { exact: true })).toHaveCount(0)
      await expect(workspace.locator('#copy-url')).toHaveAttribute('aria-invalid', 'false')
      await expect(workspace.locator('#copy-url')).toBeFocused()
      await page.screenshot({ path: info.outputPath('copy-editor.png'), animations: 'disabled' })
      await workspace.getByRole('button', { name: common.close, exact: true }).click()
      const confirmation = page.locator('.ant-modal-confirm')
      await expect(confirmation.getByText(labels.copyLeaveTitle, { exact: true })).toBeVisible()
      await confirmation.getByRole('button', { name: common.cancel, exact: true }).click()
      await expect(workspace.getByLabel(labels.copyText, { exact: true })).toHaveValue(text)
      await workspace.getByRole('button', { name: labels.copySave, exact: true }).click()
      await expect(workspace.locator('.copy-row')).toHaveCount(2)
      expect(await page.evaluate(() => Reflect.get(window, '__copyXss'))).toBeUndefined()
      await workspace.locator('.copy-context').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('copy-list.png'), animations: 'disabled' })
      await workspace.getByLabel(labels.copySearch, { exact: true }).fill('动态文案')
      await workspace.getByRole('button', { name: labels.copyFilter, exact: true }).click()
      await expect(workspace.locator('.copy-row')).toHaveCount(1)
      for (const format of ['json', 'csv'] as const) {
        await workspace.getByRole('button', { name: labels.copyExport, exact: true }).click()
        const filePromise = page.waitForEvent('download')
        await page
          .getByRole('menuitem', {
            name: format === 'json' ? labels.copyExportJson : labels.copyExportCsv,
            exact: true,
          })
          .click()
        const file = await filePromise,
          bytes = await readFile((await file.path())!)
        if (format === 'json') {
          const output = JSON.parse(bytes.toString('utf8'))
          expect(output.entries).toHaveLength(2)
          expect(output.snapshot.revisionId).toBe('r-v1')
          expect(output.entries.find((row: { kind: string }) => row.kind === 'MANUAL').text).toBe(
            text,
          )
        } else {
          expect(bytes.subarray(0, 3).toString('hex')).toBe('efbbbf')
          expect(bytes.toString('utf8')).toContain("'=动态文案")
          expect(bytes.toString('utf8')).toContain('SNAPSHOT')
        }
      }
      await workspace.getByRole('button', { name: labels.copyClearFilter, exact: true }).click()
      await expect(workspace.locator('.copy-row')).toHaveCount(2)
      await page.keyboard.press('Escape')
      await expect(workspace).toHaveCount(0)
      await expect(trigger).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      await page.screenshot({ path: info.outputPath('preview-after.png'), animations: 'disabled' })
      await page.goto('prototype-hub/projects/p1')
      await page.getByRole('button', { name: labels.revisionHistory, exact: true }).click()
      const history = page.getByRole('dialog', { name: labels.revisionHistory, exact: true })
      await history.getByRole('button', { name: labels.pageResources, exact: true }).click()
      await page.getByRole('menuitem', { name: labels.copyInventory, exact: true }).click()
      await expect(workspace.locator('.copy-row')).toHaveCount(2)
      await expect(workspace.locator('.copy-context')).toContainText('r-v1')
      await workspace.getByRole('button', { name: common.close, exact: true }).click()
      await expect(
        page.getByRole('button', { name: labels.revisionHistory, exact: true }),
      ).toBeFocused()
    })
  }
test('F47 unknown create keeps original request, draft and key through refresh and retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { workspace, labels } = await openCopy(page)
  await workspace.getByRole('button', { name: labels.copyExtract, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(1)
  await workspace.getByRole('button', { name: labels.copyAdd, exact: true }).click()
  await workspace.getByLabel(labels.copyText, { exact: true }).fill('Unconfirmed dynamic copy')
  const bodies: unknown[] = []
  await page.route('**/copy-inventory/entries', async (route) => {
    bodies.push(route.request().postDataJSON())
    if (bodies.length > 1) return route.continue()
    await route.fetch()
    return route.fulfill({
      status: 503,
      json: { success: false, status: 503, message: 'Response lost after commit' },
    })
  })
  await workspace.getByRole('button', { name: labels.copySave, exact: true }).click()
  await expect(workspace.getByText(labels.copyUnknown, { exact: true })).toBeVisible()
  await expect(workspace.getByLabel(labels.copyText, { exact: true })).toBeDisabled()
  await expect(workspace.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(workspace).toBeVisible()
  await workspace.getByRole('button', { name: labels.copyCheck, exact: true }).click()
  await expect(workspace.getByText(labels.copyUnknown, { exact: true })).toBeVisible()
  await expect(workspace.getByLabel(labels.copyText, { exact: true })).toHaveValue(
    'Unconfirmed dynamic copy',
  )
  await workspace.getByRole('button', { name: labels.copyRetry, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(2)
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toEqual(bodies[0])
})
test('F47 read-only inventory and revoked/mismatched page states never expose editing or stale copy', async ({
  page,
}) => {
  await page.route('**/api/prototype-hub/projects/p1', async (route) => {
    const response = await route.fetch(),
      body = await response.json()
    body.result.role = 'viewer'
    body.result.capabilities.edit = false
    await route.fulfill({ response, json: body })
  })
  const { workspace, trigger, labels } = await openCopy(page)
  await expect(workspace.getByText(labels.copyWaitExtraction, { exact: true })).toBeVisible()
  await expect(
    workspace.getByRole('button', { name: labels.copyExtract, exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.unroute('**/api/prototype-hub/projects/p1')
  await page.reload()
  await page.getByRole('button', { name: labels.pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: labels.copyInventory, exact: true }).click()
  await workspace.getByRole('button', { name: labels.copyExtract, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(1)
  await page.route(inventoryPath, async (route) => {
    if (route.request().url().endsWith('/entries/_query'))
      return route.fulfill({
        status: 403,
        json: { success: false, status: 403, message: 'Revoked' },
      })
    return route.continue()
  })
  await workspace.getByRole('button', { name: labels.copyFilter, exact: true }).click()
  await expect(workspace.getByText(labels.copyUnavailable, { exact: true })).toBeVisible()
  await expect(workspace.locator('.copy-row')).toHaveCount(0)
  await expect(workspace.getByRole('button', { name: '重试', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(workspace).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
test('F47 fixed-page empty extraction, database pager/filter contract and manual deletion stay separate', async ({
  page,
  request,
}) => {
  let basePath = ''
  const queries: Record<string, unknown>[] = []
  page.on('request', (req) => {
    if (req.url().endsWith('/copy-inventory/entries/_query')) {
      basePath = req.url().replace('/entries/_query', '')
      queries.push(req.postDataJSON())
    }
  })
  const { workspace, labels } = await openCopy(page)
  await workspace.getByRole('button', { name: labels.copyExtract, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(1)
  for (let index = 0; index < 22; index++) {
    const response = await request.post(basePath + '/entries', {
      headers: { 'X-Access-Token': 'mock-admin' },
      data: {
        text: `Manual copy ${index}`,
        businessTerm: '',
        note: '',
        requirementUrl: index === 21 ? 'https://example.com/requirement' : '',
        clientRequestId: `seed-copy-${index}`,
      },
    })
    expect(response.ok()).toBe(true)
  }
  await workspace.getByRole('button', { name: labels.copyFilter, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(20)
  await workspace.getByTitle('2', { exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(3)
  expect(queries.at(-1)).toMatchObject({ pageIndex: 1, pageSize: 20 })
  await workspace
    .locator('.ant-form-item')
    .filter({ has: page.getByText(labels.copyRequirementFilter, { exact: true }) })
    .locator('.ant-select-selector')
    .click()
  await page.getByTitle(labels.copyHasRequirement, { exact: true }).click()
  await workspace.getByRole('button', { name: labels.copyFilter, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(1)
  expect(queries.at(-1)).toMatchObject({ pageIndex: 0, hasRequirement: true })
  await workspace.locator('.copy-page .ant-select-selector').click()
  await page.getByTitle('Child page · child.html', { exact: true }).click()
  await expect(
    workspace.getByRole('heading', { name: labels.copyNotExtracted, exact: true }),
  ).toBeVisible()
  await workspace.getByRole('button', { name: labels.copyExtract, exact: true }).click()
  await expect(workspace.getByText(labels.copyExtractionEmpty, { exact: true })).toBeVisible()
  await workspace.getByRole('button', { name: labels.copyAdd, exact: true }).click()
  await workspace.getByLabel(labels.copyText, { exact: true }).fill('Only child-page copy')
  await workspace.getByRole('button', { name: labels.copySave, exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(1)
  await workspace.locator('.copy-row').getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '删除', exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(0)
  await workspace.locator('.copy-page .ant-select-selector').click()
  await page.getByTitle('Home · index.html', { exact: true }).click()
  await expect(workspace.locator('.copy-row')).toHaveCount(20)
  await expect(workspace.locator('.copy-summary')).toContainText('人工 22 条')
})
