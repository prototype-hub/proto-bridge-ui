import { expect, test, type Page } from '@playwright/test'
import { pageTraceLocales } from '../../src/modules/protohub-manager-ui/locales/page-trace'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'
const base = '/api/prototype-hub/versions/v1/revisions/r-v1/page-traceability'
async function open(page: Page, language: 'zh' | 'en' = 'zh') {
  await login(page)
  await page.evaluate((l) => localStorage.setItem('proto-bridge-ui:language', l), language)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  const trigger = page.getByRole('button', {
    name: protoLocales[language].pageResources,
    exact: true,
  })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const item = page.getByRole('menuitem', {
    name: pageTraceLocales[language].traceTitle,
    exact: true,
  })
  await item.focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.trace-workspace')
  await expect(panel.locator('#trace-heading')).toBeFocused()
  await expect(panel.locator('.trace-main h2')).toHaveText('Home')
  return { panel, trigger, labels: pageTraceLocales[language] }
}
async function choose(page: Page, id: string, label: string) {
  await page.locator(`#${id}`).focus()
  await page.keyboard.press('ArrowDown')
  const popup = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${id}_list"]`) })
  await expect(popup.getByTitle(label, { exact: true })).toBeVisible()
  for (let attempts = 0; attempts < 25; attempts++) {
    const current = await popup.locator('.ant-select-item-option-active').getAttribute('title')
    if (current === label) {
      await page.keyboard.press('Enter')
      return
    }
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`Could not select ${label} with the keyboard`)
}
async function createRelation(page: Page, language: 'zh' | 'en' = 'zh') {
  const result = await open(page, language),
    { panel, labels } = result
  await panel.getByRole('button', { name: labels.traceNewRelation, exact: true }).click()
  await choose(page, 'trace-to', 'Child page')
  await panel
    .locator('#trace-label')
    .fill(language === 'zh' ? '打开客户资料' : 'Open customer details')
  await panel.locator('#trace-note').fill('<script>literal relation note</script>')
  await panel.getByRole('button', { name: labels.traceSave, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(panel.getByText(labels.traceSaved, { exact: true })).toBeVisible()
  await expect(panel.locator('.trace-records > li')).toHaveCount(1)
  return result
}
test.beforeEach(async ({ request, baseURL }) => {
  expect((await request.post(`${new URL(baseURL!).origin}/__test/reset`)).ok()).toBe(true)
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F46 relationships sources decisions keyboard ${language} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const { panel, trigger, labels } = await createRelation(page, language)
      await panel.getByRole('button', { name: labels.traceMarkEntry, exact: true }).click()
      await expect(
        panel.getByRole('button', { name: labels.traceUnmarkEntry, exact: true }),
      ).toBeVisible()
      await panel.locator('[data-trace-edge]').focus()
      await page.keyboard.press('Enter')
      await expect(panel.locator('[data-trace-row]')).toBeFocused()
      await page.screenshot({
        path: info.outputPath(`after-relations-${language}-${width}.png`),
        animations: 'disabled',
      })
      const target = panel.locator('.trace-map a').last()
      await expect(target).toHaveAttribute('href', /revisionId=r-v1.*pageId=/)
      await panel.getByRole('button', { name: labels.traceDecisions, exact: true }).click()
      await panel.getByRole('button', { name: labels.traceNewDecision, exact: true }).click()
      await panel.locator('#trace-title').fill('Keep customer details on a separate page')
      await panel.locator('#trace-decision').fill('Open the details page explicitly.')
      await panel
        .locator('#trace-rationale')
        .fill('The existing entry and permissions remain unchanged.')
      await panel.getByRole('button', { name: labels.traceSave, exact: true }).click()
      await expect(panel.locator('.trace-records > li')).toHaveCount(1)
      await page.screenshot({
        path: info.outputPath(`after-decisions-${language}-${width}.png`),
        animations: 'disabled',
      })
      await panel.getByRole('button', { name: labels.traceSources, exact: true }).click()
      await panel.getByRole('button', { name: labels.traceNewSource, exact: true }).click()
      await expect(panel.locator('#trace-source')).toBeVisible()
      await panel.getByRole('button', { name: labels.traceCancel, exact: true }).click()
      if (width === 390) {
        await panel.locator('.trace-mobile').click()
        await panel.locator('.trace-pages li button').last().click()
        await expect(panel.locator('.trace-main h2')).toHaveText('Child page')
      }
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(trigger).toBeFocused()
      expect(errors).toEqual([])
    })
  }
test('F46 preserves a dirty draft and recovers the original unknown write', async ({ page }) => {
  const { panel, labels } = await open(page)
  await panel.getByRole('button', { name: labels.traceNewRelation, exact: true }).click()
  await choose(page, 'trace-to', 'Child page')
  await panel.locator('#trace-label').fill('Unsaved relationship')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: labels.traceKeep, exact: true }).click()
  await expect(panel.locator('#trace-label')).toHaveValue('Unsaved relationship')
  const writes: unknown[] = []
  let first = true
  await page.route(`**${base}/relations`, async (route) => {
    writes.push(route.request().postDataJSON())
    if (first) {
      first = false
      await route.fetch()
      await route.abort('failed')
    } else await route.continue()
  })
  await panel.getByRole('button', { name: labels.traceSave, exact: true }).click()
  await expect(panel.getByText(labels.traceUnknown, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: labels.traceClose, exact: true }).click()
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: labels.traceRetry, exact: true }).click()
  await expect(panel.locator('.trace-records > li')).toHaveCount(1)
  expect(writes).toHaveLength(2)
  expect(writes[0]).toEqual(writes[1])
})
test('F46 keeps conflict drafts until the current record is explicitly selected', async ({
  page,
}) => {
  const { panel, labels } = await createRelation(page)
  await panel.getByRole('button', { name: labels.traceEdit, exact: true }).click()
  await panel.locator('#trace-label').fill('Local draft')
  await page.route(`**${base}/relations/*`, async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({
        status: 409,
        json: { success: false, status: 409, code: 'PROTOTYPE_HUB_PAGE_TRACE_CONFLICT' },
      })
    else await route.continue()
  })
  await panel.getByRole('button', { name: labels.traceSave, exact: true }).click()
  await expect(panel.getByText(labels.traceConflict, { exact: true })).toBeVisible()
  await expect(panel.locator('#trace-label')).toHaveValue('Local draft')
  await panel.getByRole('button', { name: labels.traceReadCurrent, exact: true }).click()
  await panel.getByRole('button', { name: labels.traceUseCurrent, exact: true }).click()
  await expect(panel.locator('#trace-label')).toHaveValue('打开客户资料')
})

test('F46 links all existing source kinds, shows changed and missing, and reconnects explicitly', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { panel, labels } = await createRelation(page)
  const headers = { 'X-Access-Token': 'mock-admin' }
  const pageId = new URL(
    (await panel.locator('.trace-page-heading a').getAttribute('href'))!,
    'http://mock',
  ).searchParams.get('pageId')!
  const sourceBody = {
    revisionId: 'r-v1',
    pageId,
    title: 'Order action',
    purpose: 'Existing purpose',
    inputRules: '',
    permissionRules: '',
    navigationRules: '',
    notes: '<script>literal</script>',
    anchor: null,
  }
  const wi = await page.request.post('/api/prototype-hub/versions/v1/work-items', {
    headers,
    data: {
      revisionId: 'r-v1',
      pageId,
      url: 'https://example.com/requirement',
      note: 'Customer requirement',
      clientRequestId: 'wi-create',
    },
  })
  expect(wi.ok()).toBe(true)
  const material = await page.request.post(
    '/api/prototype-hub/versions/v1/revisions/r-v1/materials/links',
    {
      headers,
      data: {
        sourceName: 'Existing guide',
        sourceUrl: 'https://example.com/guide',
        clientRequestId: 'material-create',
      },
    },
  )
  expect(material.ok()).toBe(true)
  const description = await page.request.post(
    '/api/prototype-hub/versions/v1/element-descriptions',
    { headers, data: { ...sourceBody, clientRequestId: 'description-create' } },
  )
  expect(description.ok()).toBe(true)
  const descriptionRow = (await description.json()).result
  const checkRoot = `/api/prototype-hub/versions/v1/revisions/r-v1/pages/${pageId}/viewport-checks`
  const check = await page.request.post(checkRoot, {
    headers,
    data: {
      title: 'Normal action',
      category: 'normal',
      expected: 'Opens details',
      observed: '',
      evidence: '',
      steps: 'Click action',
      result: 'untested',
      viewportWidth: 1440,
      viewportHeight: 900,
      viewportScale: 100,
      clientRequestId: 'check-create',
    },
  })
  expect(check.ok()).toBe(true)
  const checkRow = (await check.json()).result
  await panel.getByRole('button', { name: labels.traceSources, exact: true }).click()
  for (const [kind, title] of [
    [labels.traceRequirement, 'Customer requirement'],
    [labels.traceMaterial, 'Existing guide'],
    [labels.traceDescription, 'Order action'],
    [labels.traceCheck, 'Normal action'],
  ]) {
    await panel.getByRole('button', { name: labels.traceNewSource, exact: true }).click()
    await choose(page, 'trace-kind', kind!)
    await choose(page, 'trace-source', title!)
    await panel.getByRole('button', { name: labels.traceSave, exact: true }).click()
    await expect(panel.locator('.trace-editor')).toHaveCount(0)
  }
  await expect(panel.locator('.trace-records > li')).toHaveCount(4)
  await panel
    .locator('.trace-records > li')
    .filter({ hasText: 'Normal action' })
    .getByRole('button', { name: labels.traceViewSource, exact: true })
    .click()
  await expect(panel.locator('.trace-detail')).toContainText('正常')
  await expect(panel.locator('.trace-detail')).toContainText('未测')
  await panel
    .locator('.trace-detail')
    .getByRole('button', { name: labels.traceBack, exact: true })
    .click()
  await expect(
    panel
      .locator('.trace-records > li')
      .filter({ hasText: 'Normal action' })
      .getByRole('button', { name: labels.traceViewSource, exact: true }),
  ).toBeFocused()
  const update = await page.request.put(
    `/api/prototype-hub/versions/v1/element-descriptions/${descriptionRow.id}`,
    {
      headers,
      data: {
        ...sourceBody,
        title: 'Updated order action',
        expectedVersion: 0,
        clientRequestId: 'description-update',
      },
    },
  )
  expect(update.ok()).toBe(true)
  await panel.getByRole('button', { name: labels.traceClose, exact: true }).click()
  await page.getByRole('button', { name: protoLocales.zh.pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: labels.traceTitle, exact: true }).click()
  await panel.getByRole('button', { name: labels.traceSources, exact: true }).click()
  await expect(panel.getByText(labels.traceChanged, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: labels.traceMarkEntry, exact: true }).click()
  const context = (
    await (await page.request.get(`${base}/pages/${pageId}/context`, { headers })).json()
  ).result
  expect(
    context.references.find((ref: { kind: string }) => ref.kind === 'description').expectedVersion,
  ).toBe(0)
  const desc = panel.locator('.trace-records > li').filter({ hasText: 'Updated order action' })
  await desc.getByRole('button', { name: labels.traceViewSource, exact: true }).click()
  await expect(panel.locator('.trace-detail')).toContainText('Existing purpose')
  await expect(panel.locator('.trace-detail h3')).toBeFocused()
  await expect(panel.locator('.trace-detail h3')).toBeInViewport()
  await page.screenshot({
    path: info.outputPath('after-source-changed.png'),
    animations: 'disabled',
  })
  await panel.getByRole('button', { name: labels.traceReconnect, exact: true }).click()
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: labels.traceReconnect, exact: true })
    .click()
  await expect(panel.getByText(labels.traceChanged, { exact: true })).toHaveCount(0)
  const removed = await page.request.post(`${checkRoot}/${checkRow.id}/_delete`, {
    headers,
    data: { expectedVersion: 0, clientRequestId: 'check-delete' },
  })
  expect(removed.ok()).toBe(true)
  await panel.getByRole('button', { name: labels.traceClose, exact: true }).click()
  await page.getByRole('button', { name: protoLocales.zh.pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: labels.traceTitle, exact: true }).click()
  await panel.getByRole('button', { name: labels.traceSources, exact: true }).click()
  await expect(
    panel.locator('.ant-tag').getByText(labels.traceMissing, { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: info.outputPath('after-source-missing.png'),
    animations: 'disabled',
  })
  expect(
    await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, '__traceExecuted')),
  ).toBe(false)
})
