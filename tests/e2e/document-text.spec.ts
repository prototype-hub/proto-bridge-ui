import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { login } from './system-helpers'
import { revisionMaterialLocales } from '../../src/modules/protohub-manager-ui/locales/revision-material'
import { searchLocales } from '../../src/modules/protohub-manager-ui/locales/search'
const admin = { 'X-Access-Token': 'mock-admin' }
const root = '/api/prototype-hub/versions/v1/revisions/r-v1/materials'
const body =
  '客户门户需求说明\n\nBodyNeedle is searchable only after extraction.\n<script>window.__documentExecuted=true</script>\n\n' +
  'A long requirement remains readable and wraps on narrow screens. '.repeat(100)
async function upload(
  request: APIRequestContext,
  name = '客户门户需求与验收说明.txt',
  content = body,
) {
  const response = await request.post(root, {
    headers: { ...admin, 'Idempotency-Key': randomUUID() },
    multipart: {
      file: { name, mimeType: 'text/plain', buffer: Buffer.from(content) },
      sourceTool: 'Word',
      sourceName: 'Customer portal requirements',
      sourceNotes: 'Approved requirements; retain source details for traceability.',
    },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()).result.id as string
}
async function open(page: Page, language: 'zh' | 'en') {
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('prototype-hub/projects/p1')
  await page
    .getByRole('button', { name: language === 'zh' ? '历史修订' : 'Revision history', exact: true })
    .first()
    .click()
  await page
    .getByRole('button', { name: language === 'zh' ? '页面资料' : 'Page resources', exact: true })
    .first()
    .click()
  await page
    .getByRole('menuitem', { name: revisionMaterialLocales[language].materials, exact: true })
    .click()
  return page.locator('.revision-materials')
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`document extraction, reading and exact search source ${language} ${width}`, async ({
      page,
      request,
    }, info) => {
      test.setTimeout(90000)
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await login(page)
      const id = await upload(request)
      const labels = revisionMaterialLocales[language]
      const panel = await open(page, language)
      await expect(panel.locator('.materials-list li')).toHaveCount(1)
      await page.screenshot({ path: info.outputPath('ui-after-list.png'), animations: 'disabled' })
      await panel
        .getByRole('button', {
          name: `${labels.materialView}: 客户门户需求与验收说明.txt`,
          exact: true,
        })
        .focus()
      await page.keyboard.press('Enter')
      await expect(panel.locator('.material-editor h3')).toBeFocused()
      await expect(
        panel.getByText(labels.materialTextStatus_NOT_EXTRACTED, { exact: true }).last(),
      ).toBeVisible()
      await panel.getByRole('button', { name: labels.materialTextPrepare, exact: true }).focus()
      await page.keyboard.press('Enter')
      const reader = panel.locator('.material-text-content')
      await expect(reader).toContainText('BodyNeedle')
      await expect(reader).toBeFocused()
      const before = await reader.evaluate((element) => element.scrollTop)
      await page.keyboard.press('PageDown')
      await expect
        .poll(() => reader.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(before)
      await reader.evaluate((element) => {
        element.scrollTop = 0
      })
      await page.screenshot({
        path: info.outputPath('ui-after-reader.png'),
        animations: 'disabled',
      })
      expect(await page.evaluate(() => Reflect.get(window, '__documentExecuted'))).toBeUndefined()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      // Put the matching document outside the first list page before following its search result.
      for (let index = 0; index < 21; index++)
        await upload(request, `other-${index}.txt`, 'Unrelated body')
      const first = (
        await (
          await request.post(`${root}/_query`, {
            headers: admin,
            data: { pageIndex: 0, pageSize: 20 },
          })
        ).json()
      ).result
      expect(first.data.some((row: { id: string }) => row.id === id)).toBe(false)
      await panel.getByRole('button', { name: labels.materialBack, exact: true }).click()
      await page.goto('prototype-hub/search')
      const search = searchLocales[language]
      await page.getByText(search.searchMATERIAL, { exact: true }).click()
      await page.getByLabel(search.searchKeyword, { exact: true }).fill('BodyNeedle')
      await page.getByLabel(search.searchKeyword, { exact: true }).press('Enter')
      await expect(page.locator('.search-result-list > li')).toHaveCount(1)
      await expect(page.getByText(search.searchField_textContent, { exact: true })).toBeVisible()
      await page.screenshot({
        path: info.outputPath('search-document-body.png'),
        animations: 'disabled',
      })
      expect(page.url()).not.toContain('BodyNeedle')
      expect(
        await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
      ).not.toContain('BodyNeedle')
      const popupPromise = page.waitForEvent('popup')
      await page.locator('.search-result-actions a').first().focus()
      await page.keyboard.press('Enter')
      const popup = await popupPromise
      await popup.setViewportSize(page.viewportSize()!)
      await expect(popup.locator('.material-text-content')).toContainText('BodyNeedle')
      await expect(popup.locator('.material-editor h3')).toBeFocused()
      expect(new URL(popup.url()).searchParams.get('materialId')).toBe(id)
      expect(new URL(popup.url()).searchParams.get('revisionId')).toBe('r-v1')
      await popup.screenshot({
        path: info.outputPath('exact-material-source.png'),
        animations: 'disabled',
      })
      await popup.close()
    })
  }
test('body read error can recover; non-ready statuses never render response content', async ({
  page,
  request,
}) => {
  await login(page)
  const id = await upload(request)
  const labels = revisionMaterialLocales.en
  let status = 'EMPTY',
    failing = true
  await page.route(`**/materials/${id}/text`, async (route) => {
    if (failing)
      return route.fulfill({
        status: 503,
        json: { success: false, status: 503, message: 'Controlled read failure' },
      })
    return route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          id,
          status,
          content: 'must never appear',
          characterCount: 0,
          extractedAt: 1,
          extractorVersion: 'material-text-v1',
        },
      },
    })
  })
  const panel = await open(page, 'en')
  await panel
    .getByRole('button', {
      name: `${labels.materialView}: 客户门户需求与验收说明.txt`,
      exact: true,
    })
    .click()
  await expect(panel.getByRole('alert')).toContainText('Controlled read failure')
  failing = false
  await panel.getByRole('button', { name: labels.materialTextReload, exact: true }).click()
  for (status of ['EMPTY', 'UNSUPPORTED', 'ENCRYPTED', 'LIMIT_EXCEEDED', 'FAILED']) {
    if (status !== 'EMPTY') {
      await panel.getByRole('button', { name: labels.materialBackToList, exact: true }).click()
      await panel
        .getByRole('button', {
          name: `${labels.materialView}: 客户门户需求与验收说明.txt`,
          exact: true,
        })
        .click()
    }
    await expect(panel.locator('.material-text-heading')).toContainText(
      labels[`materialTextStatus_${status}` as keyof typeof labels],
    )
    await expect(panel.locator('.material-text-content')).toHaveCount(0)
    await expect(panel.getByText('must never appear', { exact: true })).toHaveCount(0)
  }
})
test('extraction error recovery and empty result keep keyboard focus in the current document', async ({
  page,
  request,
}, info) => {
  await login(page)
  const id = await upload(request)
  const labels = revisionMaterialLocales.en
  let failing = true
  await page.route(`**/materials/${id}/text/_extract`, (route) =>
    failing
      ? route.fulfill({
          status: 503,
          json: { success: false, status: 503, message: 'Controlled extraction failure' },
        })
      : route.fulfill({
          json: {
            success: true,
            status: 200,
            result: {
              id,
              status: 'EMPTY',
              content: 'must not render',
              characterCount: 0,
              extractedAt: 1,
              extractorVersion: 'material-text-v1',
            },
          },
        }),
  )
  const panel = await open(page, 'en')
  await panel
    .getByRole('button', {
      name: `${labels.materialView}: 客户门户需求与验收说明.txt`,
      exact: true,
    })
    .click()
  await panel.getByRole('button', { name: labels.materialTextPrepare, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('alert')).toContainText('Controlled extraction failure')
  await expect(panel.locator('.material-text-heading h4')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    panel.getByRole('button', { name: labels.materialTextReload, exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel.locator('.material-text-heading h4')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    panel.getByRole('button', { name: labels.materialTextPrepare, exact: true }),
  ).toBeFocused()
  failing = false
  await page.keyboard.press('Enter')
  await expect(panel.locator('.material-text-heading')).toContainText(
    labels.materialTextStatus_EMPTY,
  )
  await expect(panel.locator('.material-text-heading h4')).toBeFocused()
  await expect(panel.locator('.material-text-content')).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath('extraction-empty-keyboard.png'),
    animations: 'disabled',
  })
})
