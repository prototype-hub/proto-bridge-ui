import { expect, test, type Page } from '@playwright/test'
import { deliveryDocumentLocales } from '../../src/modules/protohub-manager-ui/locales/delivery-document'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'
async function open(page: Page, language: 'zh' | 'en') {
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
    name: deliveryDocumentLocales[language].deliveryDocument,
    exact: true,
  })
  await item.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', {
    name: deliveryDocumentLocales[language].deliveryDocument,
    exact: true,
  })
  await expect(panel.locator('#delivery-document-title')).toBeFocused()
  return { panel, labels: deliveryDocumentLocales[language], trigger }
}
test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:5313/__test/reset')).ok()).toBe(true)
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F31 session document ${language} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      const { panel, labels, trigger } = await open(page, language)
      await panel.getByLabel('Homeindex.html', { exact: false }).check()
      const descriptions = panel
        .locator('fieldset')
        .filter({ has: page.getByText(labels.documentDescriptions, { exact: true }) })
      await expect(descriptions.getByRole('checkbox', { name: /^Description 20 / })).toBeVisible()
      await descriptions.locator('.ant-pagination-item-2').click()
      await descriptions.getByLabel('Description 21').check()
      await panel.getByLabel('Delivery notes.txt').check()
      await panel.getByLabel(labels.documentIncludeText).check()
      const images = panel
        .locator('fieldset')
        .filter({ has: page.getByText(labels.documentImages, { exact: true }) })
      await images.getByLabel('Screen.png', { exact: true }).check()
      await images
        .getByLabel(labels.documentCaption)
        .fill('Customer supplied screenshot / 用户配图')
      await panel.getByLabel('Keyboard interaction').check()
      await panel.screenshot({ path: info.outputPath(`sources-${language}-${width}.png`) })
      await panel.getByRole('button', { name: labels.documentAssemble, exact: true }).click()
      await expect(panel.locator('#document-body')).toBeVisible()
      await panel
        .locator('#document-title')
        .fill(language === 'zh' ? '客户交付说明书' : 'Customer delivery document')
      await panel.locator('#document-introduction').fill('Fixed revision delivery.\n固定修订交付。')
      const manual =
        '<script>literal user content</script>\nManual body / 人工正文 stays with Home.'
      await panel.locator('#document-body').fill(manual)
      await panel.screenshot({ path: info.outputPath(`edit-${language}-${width}.png`) })
      await panel.getByRole('button', { name: labels.documentNext, exact: true }).click()
      await expect(panel.locator('.document-reader')).toContainText(manual)
      await expect(panel.locator('.document-reader img')).toBeVisible()
      expect(await panel.locator('script').count()).toBe(0)
      const overflow = await panel.evaluate(
        (element) => element.scrollWidth > element.clientWidth + 1,
      )
      expect(overflow).toBe(false)
      await panel.screenshot({ path: info.outputPath(`preview-${language}-${width}.png`) })
      for (const [name, filename] of [
        [labels.documentMarkdown, 'delivery-document.zip'],
        [labels.documentHtml, 'delivery-document.html'],
      ]) {
        const downloading = page.waitForEvent('download')
        await panel.getByRole('button', { name, exact: true }).click()
        const download = await downloading
        expect(download.suggestedFilename()).toBe(filename)
        await download.saveAs(info.outputPath(filename!))
      }
      await page.request.post(
        'http://127.0.0.1:5313/api/prototype-hub/versions/v1/revisions/r-v1/delivery-document/_test/change',
        { headers: { 'X-Access-Token': 'mock-admin' } },
      )
      await panel.getByRole('button', { name: labels.documentHtml, exact: true }).click()
      await expect(panel.getByText(labels.documentConflict, { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: labels.documentReassemble, exact: true }).click()
      await expect(page.locator('.ant-modal-confirm:not(.ant-zoom-enter-active)')).toBeVisible()
      await page.getByRole('button', { name: labels.documentKeep, exact: true }).click()
      await expect(page.locator('.ant-modal-confirm')).toBeHidden()
      await panel.locator('.document-steps button').nth(1).click()
      await expect(panel.locator('#document-body')).toHaveValue(manual)
      await panel.getByRole('button', { name: labels.documentClose, exact: true }).click()
      await expect(page.locator('.ant-modal-confirm:not(.ant-zoom-enter-active)')).toBeVisible()
      await page.getByRole('button', { name: labels.documentKeep, exact: true }).click()
      await expect(page.locator('.ant-modal-confirm')).toBeHidden()
      await panel.locator('#document-title').focus()
      await page.keyboard.press('Shift+Tab')
      expect(
        await page.evaluate(() => !!document.activeElement?.closest('.delivery-document')),
      ).toBe(true)
      await panel.getByRole('button', { name: labels.documentClose, exact: true }).click()
      await page.getByRole('button', { name: labels.documentDiscard, exact: true }).click()
      await expect(panel).toBeHidden()
      await expect(trigger).toBeFocused()
    })
  }
