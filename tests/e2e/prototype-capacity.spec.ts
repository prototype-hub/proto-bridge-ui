import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

for (const language of ['zh', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${language} ${width}: capacity and creation stay together across finite and unlimited states`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      let state = { used: 12, limit: -1, remaining: -1, overLimit: false, canCreate: true }
      await page.route('**/api/prototype-hub/**/_usage*', async (route) => {
        const response = await route.fetch()
        const json = await response.json()
        json.result[json.result.projects ? 'projects' : 'versions'] = state
        await route.fulfill({ response, json })
      })
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      for (const [kind, path, action] of [
        ['projects', 'prototype-hub', language === 'zh' ? '新建项目' : 'New project'],
        [
          'versions',
          'prototype-hub/projects/p1',
          language === 'zh' ? '上传版本' : 'Upload version',
        ],
      ]) {
        await page.goto(path!)
        const notice = page.locator('.capacity-notice')
        await expect(notice).toContainText(
          language === 'zh' ? '已用 12 / 不限' : 'Used 12 / Unlimited',
        )
        await expect(notice).not.toContainText('-1')
        const create = notice.getByRole('button', { name: action!, exact: true })
        await expect(create).toBeEnabled()
        await create.focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect
          .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
          .toBe(true)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(create).toBeFocused()
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-unlimited.png`),
          animations: 'disabled',
          fullPage: true,
        })
        await page.keyboard.press('Enter')
        const createdName = `${kind}-${language}-${width}`
        await dialog
          .getByLabel(
            kind === 'projects'
              ? language === 'zh'
                ? '名称'
                : 'Name'
              : language === 'zh'
                ? '版本名称'
                : 'Version name',
            { exact: true },
          )
          .fill(createdName)
        if (kind === 'versions')
          await dialog.locator('input[type=file]').setInputFiles({
            name: 'capacity.zip',
            mimeType: 'application/zip',
            buffer: Buffer.from('fixture'),
          })
        await dialog
          .getByRole('button', { name: language === 'zh' ? '保存' : 'Save', exact: true })
          .focus()
        await page.keyboard.press('Enter')
        await expect(dialog).toBeHidden()
        await expect(page.getByText(createdName, { exact: true })).toBeVisible()
        await expect(create).toBeFocused()

        state = { used: 5, limit: 5, remaining: 0, overLimit: false, canCreate: false }
        await page.reload()
        await expect(notice).toContainText(language === 'zh' ? '已达容量上限' : 'Capacity reached')
        await expect(create).toBeDisabled()
        state = { used: 7, limit: 5, remaining: 0, overLimit: true, canCreate: false }
        await page.reload()
        await expect(notice).toContainText(
          language === 'zh' ? '现有数据已超出容量上限' : 'Existing data exceeds capacity',
        )
        await expect(create).toBeDisabled()
        await expect(
          page.getByText(kind === 'projects' ? 'Contract project' : 'V1', { exact: true }).first(),
        ).toBeVisible()
        if (kind === 'versions') {
          const row = page
            .getByRole('row')
            .filter({ has: page.locator('.version-name').getByText('V1', { exact: true }) })
          await expect(
            row.getByRole('button', { name: language === 'zh' ? '预览' : 'Preview', exact: true }),
          ).toBeEnabled()
          await row
            .locator('summary')
            .filter({ hasText: language === 'zh' ? '管理版本' : 'Manage version' })
            .click()
          await expect(
            row.getByRole('button', {
              name: language === 'zh' ? '上传新修订' : 'Upload new revision',
              exact: true,
            }),
          ).toBeEnabled()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        state = { used: 12, limit: -1, remaining: -1, overLimit: false, canCreate: true }
      }
    })
  }
}

test('an unknown allowance pauses creation, preserves existing projects and retries explicitly', async ({
  page,
}) => {
  let unavailable = true
  await page.route('**/api/prototype-hub/projects/_usage', async (route) => {
    if (unavailable)
      await route.fulfill({
        status: 503,
        json: { success: false, status: 503, message: 'Usage unavailable' },
      })
    else await route.continue()
  })
  await login(page)
  const notice = page.locator('.capacity-notice')
  const create = notice.getByRole('button', { name: '新建项目', exact: true })
  await expect(notice).toContainText('暂时无法获取用量')
  await expect(create).toBeDisabled()
  await expect(page.getByText('Contract project', { exact: true })).toBeVisible()
  unavailable = false
  await notice.getByRole('button', { name: '重试', exact: true }).click()
  await expect(notice).toContainText('已用 1 / 5')
  await expect(notice).toContainText('还可新增 4 个')
  await expect(create).toBeEnabled()
})

test('editing an existing project or revision returns to its own trigger', async ({ page }) => {
  await login(page)
  const edit = page.getByRole('button', { name: '编辑', exact: true })
  await edit.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(edit).toBeFocused()
  await page.goto('prototype-hub/projects/p1')
  await page.locator('.version-management summary').click()
  const update = page.getByRole('button', { name: '上传新修订', exact: true })
  await update.focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(update).toBeFocused()
})

test('upload focus waits for the project when usage refresh completes first', async ({ page }) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  const create = page
    .locator('.capacity-notice')
    .getByRole('button', { name: '上传版本', exact: true })
  await create.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('版本名称', { exact: true }).fill('Slow list upload')
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'capacity.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('fixture'),
  })
  let release!: () => void
  let queryStarted!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const queried = new Promise<void>((resolve) => {
    queryStarted = resolve
  })
  await page.route('**/api/prototype-hub/projects/p1', async (route) => {
    const response = await route.fetch()
    queryStarted()
    await held
    await route.fulfill({ response })
  })
  const usageUpdated = page.waitForResponse((response) =>
    response.url().includes('/versions/_usage'),
  )
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await queried
  await usageUpdated
  await expect(page.locator('.capacity-notice')).toContainText('已用 2 / 5')
  await expect(dialog).toBeHidden()
  await expect(create).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '版本', level: 2, exact: true })).toHaveCount(0)
  release()
  await expect(page.getByText('Slow list upload', { exact: true })).toBeVisible()
  await expect(create).toBeFocused()
})
