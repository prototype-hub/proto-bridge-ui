import { expect, test, type Page } from '@playwright/test'
import { codeMappingLocales } from '../../src/modules/protohub-manager-ui/locales/code-mapping'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'

async function open(page: Page, language: 'zh' | 'en' = 'zh') {
  await login(page)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  const trigger = page.getByRole('button', {
    name: protoLocales[language].pageResources,
    exact: true,
  })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const item = page.getByRole('menuitem', {
    name: codeMappingLocales[language].codeMappings,
    exact: true,
  })
  await item.focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.code-workspace')
  await expect(panel.locator('#code-heading')).toBeFocused()
  return { panel, trigger, labels: codeMappingLocales[language] }
}
test.beforeEach(async ({ request, baseURL }) => {
  expect((await request.post(`${new URL(baseURL!).origin}/__test/reset`)).ok()).toBe(true)
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F32 complete code card and additive JSON journey ${language} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const { panel, trigger, labels } = await open(page, language)
      await expect(panel.getByText(labels.codeEmpty, { exact: true })).toBeVisible()
      if (width === 390)
        await panel.getByRole('button', { name: labels.codePages, exact: true }).click()
      await panel.getByRole('button', { name: labels.codeNew, exact: true }).first().click()
      await expect(panel.locator('#code-alias')).toBeVisible()
      const alias = language === 'zh' ? '客户资料卡' : 'CustomerProfile'
      const snippet =
        '  <script>window.f32Executed = true</script>\n\tconst customer = "<private>"\n' +
        'long_line_'.repeat(45)
      await panel.locator('#code-alias').fill(alias)
      await panel.locator('#code-repositoryPath').fill('src/components/CustomerProfile.vue')
      await panel.locator('#code-repositoryUrl').fill('https://example.test/private-repository')
      await panel
        .locator('#code-documentationUrl')
        .fill('https://example.test/docs/components/customer')
      await panel.locator('#code-framework').fill('Vue')
      await panel.locator('#code-frameworkVersion').fill('3.5')
      await panel.locator('#code-snippet').fill(snippet)
      await panel.getByRole('button', { name: labels.codeSave, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(panel.getByText(labels.codeSaved, { exact: true })).toBeVisible()
      await expect(panel.locator('.code-detail pre')).toHaveText(snippet)
      expect(
        await page.evaluate(() => (window as unknown as Record<string, unknown>).f32Executed),
      ).toBeUndefined()
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: info.outputPath(`after-card-${language}-${width}.png`),
        animations: 'disabled',
      })
      if (width === 390)
        await panel.getByRole('button', { name: labels.codeBack, exact: true }).click()
      await panel
        .getByRole('checkbox', { name: labels.codeChoose.replace('{alias}', alias), exact: true })
        .check()
      await panel
        .getByRole('button', { name: labels.codeExport.replace('{count}', '1'), exact: true })
        .click()
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: labels.codeExportDownload, exact: true }).click()
      const downloaded = await downloading
      expect(downloaded.suggestedFilename()).toBe('code-mapping-cards.json')
      const path = await downloaded.path()
      expect(path).toBeTruthy()
      if (width === 390)
        await panel.getByRole('button', { name: labels.codePages, exact: true }).click()
      await panel.getByRole('button', { name: labels.codeImport, exact: true }).click()
      await expect(panel.locator('#code-import-text')).toBeVisible()
      await panel.locator('input[type="file"]').setInputFiles(path!)
      await expect(panel.locator('.code-import-preview > li')).toHaveCount(1)
      await expect(panel.locator('.code-import-preview code')).toHaveText(
        'src/components/CustomerProfile.vue',
      )
      await panel
        .getByRole('button', {
          name: labels.codeImportConfirm.replace('{count}', '1'),
          exact: true,
        })
        .focus()
      await page.keyboard.press('Enter')
      await expect(panel.locator('.code-import-results > li')).toHaveCount(1)
      await panel.getByRole('button', { name: labels.codeImportDone, exact: true }).click()
      if (width === 390)
        await panel.getByRole('button', { name: labels.codeBack, exact: true }).click()
      await expect(panel.locator('.code-rows > li')).toHaveCount(2)
      await panel.locator('.code-row-open').first().click()
      await expect(panel.locator('.code-detail pre')).toHaveText(snippet)
      await page.screenshot({
        path: info.outputPath(`after-import-${language}-${width}.png`),
        animations: 'disabled',
      })
      await panel.getByRole('button', { name: labels.codeEdit, exact: true }).click()
      await panel.locator('#code-alias').fill(`${alias} draft`)
      await panel.getByRole('button', { name: labels.codeCancel, exact: true }).click()
      await page.getByRole('button', { name: labels.codeKeep, exact: true }).click()
      await expect(panel.locator('#code-alias')).toHaveValue(`${alias} draft`)
      await panel.getByRole('button', { name: labels.codeCancel, exact: true }).click()
      await page.getByRole('button', { name: labels.codeLeave, exact: true }).click()
      await panel.getByRole('button', { name: labels.codeClose, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(panel).toHaveCount(0)
      await expect(trigger).toBeFocused()
      expect(errors).toEqual([])
    })
  }

test('F32 keeps original requests after unknown results and keeps drafts after CAS conflicts', async ({
  page,
}) => {
  const { panel, labels } = await open(page)
  let target = '',
    sent: unknown
  await page.route(
    '**/code-mappings',
    async (route) => {
      target = route.request().url()
      sent = route.request().postDataJSON()
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, status: 503, message: 'Unknown fixture write' }),
      })
    },
    { times: 1 },
  )
  await panel.getByRole('button', { name: labels.codeNew, exact: true }).first().click()
  await panel.locator('#code-alias').fill('Unknown card')
  await panel.locator('#code-repositoryPath').fill('src/Unknown.vue')
  await panel.getByRole('button', { name: labels.codeSave, exact: true }).click()
  await expect(panel.getByRole('button', { name: labels.codeRetry, exact: true })).toBeVisible()
  await expect(panel.locator('#code-alias')).toBeDisabled()
  const retry = page.waitForRequest(
    (request) => request.url() === target && request.method() === 'POST',
  )
  await panel.getByRole('button', { name: labels.codeRetry, exact: true }).click()
  expect((await retry).postDataJSON()).toEqual(sent)
  await expect(panel.getByText(labels.codeSaved, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: labels.codeEdit, exact: true }).click()
  await panel.locator('#code-snippet').fill('  my unsaved draft\n')
  await page.route(
    '**/code-mappings/*',
    async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback()
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          status: 409,
          code: 'PROTOTYPE_HUB_CODE_MAPPING_CONFLICT',
        }),
      })
    },
    { times: 1 },
  )
  await panel.getByRole('button', { name: labels.codeSave, exact: true }).click()
  await panel.getByRole('button', { name: labels.codeReadServer, exact: true }).click()
  await expect(panel.locator('.code-server')).toBeVisible()
  await expect(panel.locator('#code-snippet')).toHaveValue('  my unsaved draft\n')
  await panel.getByRole('button', { name: labels.codeKeepDraft, exact: true }).click()
  await panel.getByRole('button', { name: labels.codeSave, exact: true }).click()
  await expect(panel.locator('.code-detail pre')).toHaveText('  my unsaved draft\n')
})

test('F32 source versions require explicit confirmation before existing legal anchor handoff', async ({
  page,
}) => {
  const { panel, labels } = await open(page)
  const pageId = new URL(page.url()).searchParams.get('pageId')!
  const headers = { 'X-Access-Token': 'mock-admin' }
  await expect(
    page.frameLocator('.frame-stage > iframe').locator('[data-review-anchor-surface]'),
  ).toHaveCount(1)
  const geometry = await page
    .frameLocator('.frame-stage > iframe')
    .locator('body')
    .evaluate(() => ({
      space: 'root-document-css-px-v1',
      shape: 'point',
      x: 50,
      y: 60,
      width: 0,
      height: 0,
      documentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
        innerWidth,
      ),
      documentHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        innerHeight,
      ),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }))
  const sourceBody = {
    revisionId: 'r-v1',
    pageId,
    title: 'Source description',
    purpose: 'Current purpose',
    inputRules: '',
    permissionRules: '',
    navigationRules: '',
    notes: '<script>plain description</script>',
    anchor: geometry,
  }
  const source = await page.request.post('/api/prototype-hub/versions/v1/element-descriptions', {
    headers,
    data: { ...sourceBody, clientRequestId: 'f32-source-create' },
  })
  expect(source.ok()).toBe(true)
  const description = (await source.json()).result
  const body = {
    alias: 'Bound card',
    repositoryPath: 'src/Bound.vue',
    repositoryUrl: '',
    documentationUrl: '',
    snippet: 'literal',
    framework: '',
    frameworkVersion: '',
    description: { id: description.id, expectedVersion: 0 },
    clientRequestId: 'f32-card-create',
  }
  const base = `/api/prototype-hub/versions/v1/revisions/r-v1/pages/${pageId}/code-mappings`
  expect((await page.request.post(base, { headers, data: body })).ok()).toBe(true)
  await panel.getByRole('button', { name: labels.codeClose, exact: true }).click()
  await page.getByRole('button', { name: protoLocales.zh.pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: labels.codeMappings, exact: true }).click()
  await panel.locator('.code-row-open').click()
  const changed = await page.request.put(
    `/api/prototype-hub/versions/v1/element-descriptions/${description.id}`,
    {
      headers,
      data: {
        ...sourceBody,
        title: 'Updated source',
        expectedVersion: 0,
        clientRequestId: 'f32-source-update',
      },
    },
  )
  expect(changed.ok()).toBe(true)
  await panel.locator('.code-row-open').click()
  await expect(panel.locator('.code-association')).toContainText(labels.codeSourceChanged)
  await panel.getByRole('button', { name: labels.codeViewSource, exact: true }).click()
  await expect(panel.locator('.code-source-detail h3')).toHaveText('Updated source')
  await expect(panel.getByRole('button', { name: labels.codeLocate, exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: labels.codeUseCurrentSource, exact: true }).click()
  await panel.getByRole('button', { name: labels.codeSave, exact: true }).click()
  await expect(panel.getByText(labels.codeSaved, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: labels.codeViewSource, exact: true }).click()
  await panel.getByRole('button', { name: labels.codeLocate, exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(
    page.frameLocator('.frame-stage > iframe').locator('[data-review-anchor-marker]'),
  ).toBeVisible()
  await page.getByRole('button', { name: protoLocales.zh.pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: labels.codeMappings, exact: true }).click()
  await panel.locator('.code-row-open').click()
  expect(
    (
      await page.request.post(
        `/api/prototype-hub/versions/v1/element-descriptions/${description.id}/_delete`,
        {
          headers,
          data: {
            revisionId: 'r-v1',
            pageId,
            expectedVersion: 1,
            clientRequestId: 'f32-source-delete',
          },
        },
      )
    ).ok(),
  ).toBe(true)
  await panel.locator('.code-row-open').click()
  await expect(panel.locator('.code-association')).toContainText(labels.codeSourceMissing)
  await panel.getByRole('button', { name: labels.codeEdit, exact: true }).click()
  await panel.locator('#code-alias').fill('Card survives missing source')
  await panel.getByRole('button', { name: labels.codeSave, exact: true }).click()
  await expect(panel.locator('.code-detail-heading h3')).toHaveText('Card survives missing source')
})
