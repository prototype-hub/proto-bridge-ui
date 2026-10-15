import { test, expect } from '@playwright/test'
import { login } from './system-helpers'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
test('system dictionaries remain read only and new items follow the existing ordinal', async ({
  page,
}) => {
  await login(page)
  await page.goto('system/Dictionary')
  const system = page
    .locator('.dictionary-row')
    .filter({ has: page.getByRole('button', { name: '系统字典', exact: true }) })
  await expect(system.getByRole('switch')).toBeDisabled()
  await expect(system.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
  await expect(system.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '颜色字典', exact: true }).click()
  await page
    .locator('.dictionary-workspace section')
    .getByRole('button', { name: '新增', exact: true })
    .click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('名称（name）', { exact: true }).fill('orange')
  await modal.getByLabel('值（value）', { exact: true }).fill('orange')
  await modal.getByLabel('文本（text）', { exact: true }).fill('Orange')
  const save = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/dictionary-item'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await save).postDataJSON()).toMatchObject({
    name: 'orange',
    ordinal: 6,
    dictId: 'colors',
  })
  const blue = page
    .locator('.dictionary-workspace section')
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Blue', exact: true }) })
  await blue.getByRole('button', { name: '编辑', exact: true }).click()
  await modal.getByLabel('值（value）', { exact: true }).fill('green')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('字典项的值已存在')
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
  await page.screenshot({
    path: test.info().outputPath('pro-dictionary-parity.png'),
    fullPage: true,
    animations: 'disabled',
  })
})
test('position detail consumes the real result array and keeps organization immutable', async ({
  page,
}) => {
  await login(page)
  await page.goto('system/positions')
  const detail = page.waitForResponse(
    (response) =>
      response.url().endsWith('/position/_query/detail/no-paging') &&
      response.request().postDataJSON()?.terms?.[0]?.value === 'position1',
  )
  await page
    .getByRole('row')
    .filter({ hasText: '工程师' })
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  expect(Array.isArray((await (await detail).json()).result)).toBe(true)
  const drawer = page.locator('.ant-drawer-body')
  await expect(drawer.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible()
  await expect(drawer.getByLabel('名称', { exact: true })).toHaveValue('工程师')
  await expect(
    drawer
      .locator('.ant-form-item')
      .filter({ has: page.getByText('所属组织', { exact: true }) })
      .locator('.ant-select'),
  ).toHaveClass(/ant-select-disabled/)
  await drawer.getByRole('tab', { name: '用户管理', exact: true }).click()
  await expect(drawer.getByRole('button', { name: '绑定用户', exact: true })).toBeVisible()
})
