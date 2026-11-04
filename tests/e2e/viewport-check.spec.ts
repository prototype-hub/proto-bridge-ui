import { expect, test, type Page } from '@playwright/test'
import { viewportCheckLocales } from '../../src/modules/protohub-manager-ui/locales/viewport-check'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'

async function openChecks(page: Page, language: 'zh' | 'en' = 'zh') {
  await login(page)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  const labels = viewportCheckLocales[language],
    trigger = page.getByRole('button', { name: protoLocales[language].pageResources, exact: true })
  await expect(page.frameLocator('iframe').locator('#u1')).toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const item = page.getByRole('menuitem', { name: labels.viewportChecks, exact: true })
  await item.focus()
  await page.keyboard.press('Enter')
  const workspace = page.getByRole('dialog', { name: labels.viewportChecks, exact: true })
  await expect(workspace.locator('#viewport-title')).toBeAttached()
  return { workspace, labels, trigger }
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F48 manual viewport journey ${language} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const { workspace, labels, trigger } = await openChecks(page, language)
      await workspace.getByRole('button', { name: labels.viewportMobile, exact: true }).click()
      await workspace.locator('#viewport-scale').fill('75')
      const frame = workspace.locator('iframe')
      expect(
        await frame.evaluate((e) => ({
          width: getComputedStyle(e).width,
          height: getComputedStyle(e).height,
          transform: getComputedStyle(e).transform,
        })),
      ).toEqual({ width: '390px', height: '844px', transform: 'matrix(0.75, 0, 0, 0.75, 0, 0)' })
      await expect(workspace.frameLocator('iframe').locator('#u1')).toBeVisible()
      await workspace.frameLocator('iframe').locator('#u1').click()
      await page.screenshot({
        path: info.outputPath('viewport-preview.png'),
        animations: 'disabled',
      })
      if (width === 390)
        await workspace.getByRole('button', { name: labels.viewportRecords, exact: true }).click()
      await workspace
        .locator('#viewport-title')
        .fill(language === 'zh' ? '手机竖屏提交表单' : 'Submit form in phone portrait')
      await workspace.locator('#viewport-category').selectOption('boundary')
      await workspace
        .locator('#viewport-expected')
        .fill(
          language === 'zh'
            ? '主操作在手机竖屏下可见，提交后显示成功状态。'
            : 'The primary action remains visible in phone portrait. Submitting shows success.',
        )
      await workspace.locator('#viewport-result').selectOption('passed')
      await workspace.getByRole('button', { name: labels.viewportSave, exact: true }).click()
      await expect(workspace.locator('#viewport-observed')).toBeFocused()
      await expect(
        workspace.getByText(labels.viewportObservedRequired, { exact: true }),
      ).toBeVisible()
      await workspace
        .locator('#viewport-observed')
        .fill(
          language === 'zh'
            ? '已实际点击主操作，按钮与反馈均正常。'
            : 'Clicked the primary action. The button and response remained usable.',
        )
      await workspace.locator('.viewport-evidence summary').click()
      await workspace
        .locator('#viewport-steps')
        .fill('1. Open the fixed page\n2. Click the primary action')
      const evidence =
        '<script>window.__viewportXss = true</script> Local evidence: phone-portrait.png'
      await workspace.locator('#viewport-evidence').fill(evidence)
      await workspace.getByRole('button', { name: labels.viewportSave, exact: true }).click()
      await expect(workspace.getByText(labels.viewportSaved, { exact: true })).toBeVisible()
      await expect(workspace.locator('.viewport-record')).toHaveCount(1)
      expect(await page.evaluate(() => Reflect.get(window, '__viewportXss'))).toBeUndefined()
      await workspace.locator('.viewport-record-heading').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: info.outputPath('viewport-saved-record.png'),
        animations: 'disabled',
      })
      await page.keyboard.press('Escape')
      await expect(workspace).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await trigger.click()
      await page.getByRole('menuitem', { name: labels.viewportChecks, exact: true }).click()
      if (width === 390)
        await workspace.getByRole('button', { name: labels.viewportRecords, exact: true }).click()
      await workspace.locator('.viewport-record').focus()
      await page.keyboard.press('Enter')
      await expect(workspace.locator('#viewport-title')).toBeFocused()
      await expect(workspace.locator('#viewport-title')).toHaveValue(
        language === 'zh' ? '手机竖屏提交表单' : 'Submit form in phone portrait',
      )
      await expect(workspace.locator('#viewport-evidence')).toHaveValue(evidence)
      if (width === 390)
        await workspace.getByRole('button', { name: labels.viewportPreview, exact: true }).click()
      await expect(workspace.locator('#viewport-width')).toHaveValue('390')
      await expect(workspace.locator('#viewport-height')).toHaveValue('844')
      await expect(workspace.locator('#viewport-scale')).toHaveValue('75')
      await workspace.getByRole('button', { name: labels.viewportRotate, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(workspace.locator('#viewport-width')).toHaveValue('844')
      await expect(workspace.locator('#viewport-height')).toHaveValue('390')
      await page.keyboard.press('Escape')
      const confirm = page.locator('.ant-modal-confirm')
      await expect(confirm.getByText(labels.viewportLeaveTitle, { exact: true })).toBeVisible()
      await confirm
        .getByRole('button', { name: language === 'zh' ? '取消' : 'Cancel', exact: true })
        .click()
      await expect(workspace).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      await page
        .locator('.viewport-check-drawer')
        .getByRole('button', { name: language === 'zh' ? '关闭' : 'Close', exact: true })
        .click()
      await confirm.getByRole('button', { name: labels.viewportLeave, exact: true }).click()
      await expect(workspace).toHaveCount(0)
    })
  }
test('F48 unknown save retains exact request, blocks leaving and recovers without a duplicate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { workspace, labels } = await openChecks(page)
  await workspace.getByRole('button', { name: labels.viewportRecords, exact: true }).click()
  await workspace.locator('#viewport-title').fill('Unknown manual scenario')
  await workspace.locator('#viewport-expected').fill('The record is saved once')
  const requests: unknown[] = []
  await page.route('**/viewport-checks', async (route) => {
    requests.push(route.request().postDataJSON())
    if (requests.length > 1) return route.continue()
    await route.fetch()
    return route.fulfill({
      status: 503,
      json: { success: false, status: 503, message: 'Response lost after commit' },
    })
  })
  await workspace.getByRole('button', { name: labels.viewportSave, exact: true }).click()
  await expect(workspace.getByText(labels.viewportUnknown, { exact: true })).toBeVisible()
  await expect(workspace.locator('#viewport-title')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(workspace).toBeVisible()
  await workspace.getByRole('button', { name: labels.viewportRetry, exact: true }).click()
  await expect(workspace.getByText(labels.viewportSaved, { exact: true })).toBeVisible()
  await expect(workspace.locator('.viewport-record')).toHaveCount(1)
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
})
test('F48 read-only members cannot save; revoked reads clear records and the iframe', async ({
  page,
}) => {
  await page.route('**/api/prototype-hub/projects/p1', async (route) => {
    const response = await route.fetch(),
      body = await response.json()
    body.result.role = 'viewer'
    body.result.capabilities.edit = false
    await route.fulfill({ response, json: body })
  })
  const { workspace, labels } = await openChecks(page)
  await expect(workspace.getByText(labels.viewportReadOnly, { exact: true })).toBeVisible()
  await expect(
    workspace.getByRole('button', { name: labels.viewportSave, exact: true }),
  ).toHaveCount(0)
  await page.route('**/viewport-checks/_query', (route) =>
    route.fulfill({ status: 403, json: { success: false, status: 403, message: 'Revoked' } }),
  )
  await workspace.getByRole('button', { name: labels.viewportFilter, exact: true }).click()
  await expect(workspace.getByText(labels.viewportUnavailable, { exact: true })).toBeVisible()
  await expect(workspace.locator('.viewport-record')).toHaveCount(0)
  await expect(workspace.locator('iframe')).toHaveCount(0)
})
test('F48 conflicting records preserve local edits, recover explicitly and can be removed', async ({
  page,
}) => {
  const { workspace, labels } = await openChecks(page)
  await workspace.locator('#viewport-title').fill('Manual scenario')
  await workspace.locator('#viewport-expected').fill('Expected content')
  await workspace.getByRole('button', { name: labels.viewportSave, exact: true }).click()
  await expect(workspace.locator('.viewport-record')).toHaveCount(1)
  await workspace.locator('#viewport-title').fill('Keep my conflicted changes')
  await page.route('**/viewport-checks/*', async (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 409,
          json: {
            success: false,
            status: 409,
            message: 'Changed',
            code: 'PROTOTYPE_HUB_VIEWPORT_CHECK_CONFLICT',
          },
        })
      : route.continue(),
  )
  await workspace.getByRole('button', { name: labels.viewportSave, exact: true }).click()
  await expect(workspace.getByText(labels.viewportConflict, { exact: true })).toBeVisible()
  await expect(workspace.locator('#viewport-title')).toHaveValue('Keep my conflicted changes')
  await workspace.getByRole('button', { name: labels.viewportReloadRecords, exact: true }).click()
  await expect(workspace.locator('#viewport-title')).toHaveValue('Keep my conflicted changes')
  await workspace.getByRole('button', { name: labels.viewportDiscard, exact: true }).click()
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: labels.viewportLeave, exact: true })
    .click()
  await workspace.locator('.viewport-record').click()
  await workspace.getByRole('button', { name: labels.viewportDelete, exact: true }).click()
  await page
    .locator('.ant-popconfirm')
    .getByRole('button', { name: labels.viewportDelete, exact: true })
    .click()
  await expect(workspace.locator('.viewport-record')).toHaveCount(0)
})
