import { expect, test, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { revisionMaterialLocales } from '../../src/modules/protohub-manager-ui/locales/revision-material'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
)
async function open(page: Page, language: 'zh' | 'en') {
  await login(page)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('prototype-hub/projects/p1')
  const history = page
    .getByRole('button', { name: language === 'zh' ? '历史修订' : 'Revision history', exact: true })
    .first()
  await history.click()
  const trigger = page
    .getByRole('button', { name: language === 'zh' ? '页面资料' : 'Page resources', exact: true })
    .first()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const labels = revisionMaterialLocales[language]
  await page.getByRole('menuitem', { name: labels.materials, exact: true }).focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.revision-materials')
  await expect(panel.locator('h2')).toBeFocused()
  return { labels, panel, trigger }
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
test('ZIP import binds the optional source to its newly created immutable revision', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: '上传版本', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('版本名称', { exact: true }).fill('Source-bound version')
  await dialog
    .locator('input[type=file]')
    .setInputFiles({
      name: 'source.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('controlled package fixture'),
    })
  await dialog
    .locator('details')
    .filter({ has: page.getByText('补充来源（可选）', { exact: true }) })
    .locator('summary')
    .click()
  await dialog.getByLabel('来源工具', { exact: true }).fill('Axure')
  await dialog.getByLabel('来源名称', { exact: true }).fill('Source-bound design')
  const response = page.waitForResponse(
    (value) => value.request().method() === 'POST' && value.url().endsWith('/projects/p1/versions'),
  )
  await dialog.getByRole('button', { name: '导入版本', exact: true }).click()
  const created = (await (await response).json()).result
  const target = page
    .getByRole('row')
    .filter({
      has: page.locator('.version-name').getByText('Source-bound version', { exact: true }),
    })
  await target.getByRole('button', { name: '历史修订', exact: true }).click()
  await page.getByRole('button', { name: '页面资料', exact: true }).click()
  await page.getByRole('menuitem', { name: '修订资料', exact: true }).click()
  const panel = page.locator('.revision-materials')
  await expect(panel.locator('.materials-fixed')).toContainText(created.currentRevisionId)
  await expect(panel.locator('.materials-prototype')).toContainText('Source-bound design')
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390])
    test(`materials complete fixed-revision journey ${language} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const { labels, panel, trigger } = await open(page, language)
      await expect(panel.getByText(labels.materialSourceMissing, { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: labels.materialSourceAdd, exact: true }).click()
      await panel.getByLabel(labels.materialTool, { exact: true }).fill('Axure')
      await panel
        .getByLabel(labels.materialName, { exact: true })
        .fill(language === 'zh' ? '客户门户原型' : 'Customer portal prototype')
      await panel.getByLabel(labels.materialUrl, { exact: true }).fill('https://example.com/design')
      await panel.getByRole('button', { name: labels.materialSourceSave, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(panel.getByText(labels.materialSaved, { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: labels.materialUpload, exact: true }).click()
      const editor = panel.locator('.material-editor')
      await editor
        .getByLabel(labels.materialChoose, { exact: true })
        .setInputFiles({ name: '门户布局与长名称设计稿.png', mimeType: 'image/png', buffer: png })
      await editor
        .getByLabel(labels.materialName, { exact: true })
        .fill(language === 'zh' ? '门户首页布局' : 'Portal home layout')
      await editor
        .getByLabel(labels.materialNotes, { exact: true })
        .fill('<script>window.__materialExecuted=true</script>Plain source notes')
      await editor.getByRole('button', { name: labels.materialUpload, exact: true }).click()
      await expect(panel.locator('.materials-list li')).toHaveCount(2)
      await expect(panel.getByText(labels.materialSaved, { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('materials-list.png'), animations: 'disabled' })
      const row = panel
        .locator('.materials-list li')
        .filter({ hasText: '门户布局与长名称设计稿.png' })
      await row
        .getByRole('button', {
          name: `${labels.materialView}: 门户布局与长名称设计稿.png`,
          exact: true,
        })
        .click()
      await editor.getByRole('button', { name: labels.materialPreview, exact: true }).click()
      await expect(editor.locator('img')).toBeVisible()
      expect(await page.evaluate(() => Reflect.get(window, '__materialExecuted'))).toBeUndefined()
      await page.screenshot({
        path: info.outputPath('materials-image.png'),
        animations: 'disabled',
      })
      await editor.getByRole('button', { name: labels.materialSourceEdit, exact: true }).click()
      await editor.getByLabel(labels.materialNotes, { exact: true }).fill('Revised source notes')
      await editor.getByRole('button', { name: labels.materialSourceSave, exact: true }).click()
      await row
        .getByRole('button', {
          name: `${labels.materialView}: 门户布局与长名称设计稿.png`,
          exact: true,
        })
        .click()
      await expect(editor.getByText('Revised source notes', { exact: true })).toBeVisible()
      const downloading = page.waitForEvent('download')
      await editor.getByRole('button', { name: labels.materialDownload, exact: true }).click()
      expect((await downloading).suggestedFilename()).toBe('门户布局与长名称设计稿.png')
      await editor.getByRole('button', { name: labels.materialDelete, exact: true }).click()
      await page
        .locator('.ant-modal-confirm')
        .getByRole('button', { name: language === 'zh' ? /删\s*除/ : 'Delete', exact: true })
        .click()
      await expect(panel.locator('.materials-list li')).toHaveCount(1)
      await panel.getByRole('button', { name: labels.materialBack, exact: true }).click()
      await expect(panel).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await page.keyboard.press('Escape')
      await page
        .getByRole('button', {
          name: language === 'zh' ? '上传版本' : 'Upload version',
          exact: true,
        })
        .click()
      const dialog = page.getByRole('dialog')
      const submit = dialog.getByRole('button', { name: labels.importSave, exact: true })
      await expect(submit).toBeInViewport()
      await page.screenshot({ path: info.outputPath('import-form.png'), animations: 'disabled' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
    })
test('unknown upload retains the exact request and blocks leaving until same-request retry', async ({
  page,
}) => {
  const { labels, panel } = await open(page, 'zh')
  await panel.getByRole('button', { name: labels.materialUpload, exact: true }).click()
  const editor = panel.locator('.material-editor')
  await editor
    .getByLabel(labels.materialChoose, { exact: true })
    .setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png })
  await editor.getByLabel(labels.materialName, { exact: true }).fill('same source')
  const bodies: Buffer[] = [],
    keys: (string | undefined)[] = []
  await page.route('**/materials', async (route) => {
    bodies.push(route.request().postDataBuffer()!)
    keys.push(route.request().headers()['idempotency-key'])
    if (bodies.length > 1) return route.continue()
    await route.fetch({ postData: route.request().postDataBuffer()! })
    await route.fulfill({
      status: 503,
      json: { success: false, status: 503, message: 'Response lost' },
    })
  })
  await editor.getByRole('button', { name: labels.materialUpload, exact: true }).click()
  await expect(panel.getByText(labels.materialUnknown, { exact: true })).toBeVisible()
  await expect(editor.getByLabel(labels.materialName, { exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: labels.materialRetry, exact: true }).click()
  await expect(panel.locator('.materials-list li')).toHaveCount(1)
  expect(keys[1]).toBe(keys[0])
  const parse = async (bytes: Buffer) =>
    new Request('https://fixture.invalid', {
      method: 'POST',
      headers: {
        'content-type': bytes.toString().includes('WebKit')
          ? 'multipart/form-data; boundary=' + bytes.toString().split('\r\n')[0]!.slice(2)
          : '',
      },
      body: new Uint8Array(bytes),
    }).formData()
  const first = await parse(bodies[0]!),
    second = await parse(bodies[1]!)
  expect(second.get('sourceName')).toBe(first.get('sourceName'))
  expect(await (second.get('file') as File).text()).toBe(await (first.get('file') as File).text())
})
