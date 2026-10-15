import { test, expect, type Page, type Locator } from '@playwright/test'
import { login, select } from './system-helpers'
import type { ServerMenu } from '../../src/shared/auth/types'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
async function expandPermissionMenus(page: Page) {
  for (const name of ['系统管理', '权限管理']) {
    const parent = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name, exact: true }) })
    await parent.getByRole('button', { name: '展开行', exact: true }).click()
    await expect(parent.getByRole('button', { name: '关闭行', exact: true })).toBeVisible()
  }
}
async function icon(page: Page) {
  await page.getByRole('button', { name: '点击选择图标', exact: true }).click()
  await page
    .locator('.ant-modal:visible')
    .getByRole('button', { name: 'SettingOutlined', exact: true })
    .click()
}
async function queryField(page: Page, label: string) {
  await page.locator('.query-row[data-query-row="0.0"] .query-field .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .filter({ hasText: label })
    .click()
}
function projectQuery(page: Page, scope: Locator) {
  return scope
    .locator('.permission-row')
    .filter({ has: page.getByRole('checkbox', { name: 'Prototype project', exact: true }) })
    .getByRole('checkbox', { name: 'Query', exact: true })
}
function calendarDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
function allMenus(rows: ServerMenu[]): ServerMenu[] {
  return rows.flatMap((row) => [row, ...allMenus(row.children || [])])
}
function expectMenuHierarchy(rows: ServerMenu[], level = 1, parentId?: string) {
  for (const row of rows) {
    expect(level).toBeLessThanOrEqual(3)
    expect(row.owner).toBe('iot')
    expect(row.parentId).toBe(parentId)
    expectMenuHierarchy(row.children || [], level + 1, row.id)
  }
}
test('menu details preserve owner, data permissions and button CRUD', async ({ page }) => {
  test.setTimeout(60000)
  await login(page)
  await page.goto('system/Menu')
  await expect(page.getByRole('cell', { name: '用户管理', exact: true })).toHaveCount(0)
  await expandPermissionMenus(page)
  await page.getByRole('button', { name: '新增', exact: true }).first().click()
  const drawer = page.locator('.ant-drawer-body')
  await drawer.getByRole('tab', { name: '按钮管理', exact: true }).click()
  await expect(drawer.getByRole('button', { name: '新增', exact: true })).toBeDisabled()
  await expect(drawer.getByText('请先保存菜单基本信息', { exact: true })).toBeVisible()
  await drawer.getByRole('tab', { name: '基本信息', exact: true }).click()
  await drawer.getByLabel('名称', { exact: true }).fill('权限配置测试')
  await drawer.getByLabel('编码', { exact: true }).fill('parity-menu')
  await drawer.getByLabel('页面地址', { exact: true }).fill('/parity-test')
  await icon(page)
  await drawer.getByRole('radio', { name: '支持', exact: true }).check()
  await select(page, '资产类型', '产品')
  await projectQuery(page, drawer).check()
  let saved = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/menu'),
  )
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).postDataJSON()).toMatchObject({
    code: 'parity-menu',
    url: '/parity-test',
    icon: 'SettingOutlined',
    owner: 'iot',
    accessSupport: { value: 'support', label: '支持' },
    assetType: 'product',
    permissions: [{ permission: 'prototype-hub-project', actions: ['query'] }],
  })
  await expect(page.getByRole('cell', { name: '权限配置测试', exact: true })).toBeVisible()
  await drawer.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: test.info().outputPath('pro-menu-detail.png'),
    fullPage: false,
    animations: 'disabled',
  })
  await drawer.getByRole('tab', { name: '按钮管理', exact: true }).click()
  await drawer.getByRole('button', { name: '新增', exact: true }).click()
  let modal = page.locator('.ant-modal:visible')
  await modal.getByLabel('动作标识', { exact: true }).fill('inspect')
  await modal.getByLabel('动作名称', { exact: true }).fill('查看详情')
  await projectQuery(page, modal).check()
  await modal.getByLabel('说明', { exact: true }).fill('查看菜单详细信息')
  saved = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/menu'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).postDataJSON().buttons).toContainEqual({
    id: 'inspect',
    name: '查看详情',
    description: '查看菜单详细信息',
    permissions: [{ permission: 'prototype-hub-project', actions: ['query'] }],
  })
  await expect(modal).toHaveCount(0)
  const row = drawer.getByRole('row').filter({ hasText: '查看详情' })
  await row.getByRole('button', { name: '详情', exact: true }).click()
  modal = page.locator('.ant-modal:visible')
  await expect(modal.getByLabel('动作标识', { exact: true })).toBeDisabled()
  await expect(modal.getByLabel('动作标识', { exact: true })).toHaveValue('inspect')
  await expect(modal.getByLabel('动作名称', { exact: true })).toBeDisabled()
  await expect(modal.getByLabel('动作名称', { exact: true })).toHaveValue('查看详情')
  await expect(projectQuery(page, modal)).toBeDisabled()
  await expect(projectQuery(page, modal)).toBeChecked()
  await expect(modal.getByLabel('说明', { exact: true })).toBeDisabled()
  await expect(modal.getByLabel('说明', { exact: true })).toHaveValue('查看菜单详细信息')
  await modal.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await page.screenshot({
    path: test.info().outputPath('pro-menu-buttons.png'),
    fullPage: false,
    animations: 'disabled',
  })
  saved = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/menu'),
  )
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .locator('.ant-popover:visible')
    .getByRole('button', { name: '确定', exact: true })
    .click()
  expect((await saved).postDataJSON().buttons).toEqual([])
  await expect(row).toHaveCount(0)
})
test('third-level menus cannot add children and configuration saves omit initialization', async ({
  page,
}) => {
  test.setTimeout(60000)
  await login(page)
  await page.goto('system/Menu')
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '用户管理', exact: true }) })
  await expect(row).toHaveCount(0)
  await expandPermissionMenus(page)
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: '添加子菜单', exact: true })).toBeDisabled()
  const loaded = page.waitForResponse((response) => response.url().endsWith('/menu/_all/tree'))
  await page.getByRole('button', { name: '菜单配置', exact: true }).click()
  const baseline = ((await (await loaded).json()) as { result: ServerMenu[] }).result
  const modal = page.locator('.ant-modal:visible')
  await expect(modal.locator('.ant-tree')).toBeVisible()
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  const synchronized = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/menu/iot/_all'),
  )
  await modal.getByRole('button', { name: '同步系统菜单权限', exact: true }).click()
  await page
    .locator('.ant-popover:visible')
    .getByRole('button', { name: '确定', exact: true })
    .click()
  const synced = (await synchronized).postDataJSON() as ServerMenu[]
  expectMenuHierarchy(synced)
  expect(synced.map((menu) => menu.code)).toEqual(baseline.map((menu) => menu.code))
  const codes = allMenus(synced).map((menu) => menu.code)
  expect(new Set(codes).size).toBe(codes.length)
  expect(codes).toEqual(expect.arrayContaining(allMenus(baseline).map((menu) => menu.code)))
  const menu = allMenus(synced).find((item) => item.code === 'system/Menu')!
  expect(menu.parentId).toBe('identity')
  expect(menu.buttons?.find((button) => button.id === 'view')?.permissions).toEqual(
    expect.arrayContaining([{ permission: 'menu', actions: ['query'] }]),
  )
  await expect(modal).toBeVisible()
  await expect(
    modal.getByRole('button', { name: '同步系统菜单权限', exact: true }),
  ).not.toHaveClass(/ant-btn-loading/)
  await modal
    .locator('.ant-tree-treenode')
    .filter({ hasText: '运维管理' })
    .locator('.ant-tree-checkbox')
    .click()
  const saved = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/menu/iot/_all'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await page
    .locator('.ant-popover:visible')
    .getByRole('button', { name: '确定', exact: true })
    .click()
  const data = (await saved).postDataJSON()
  expect(Array.isArray(data)).toBe(true)
  expect(data.find((menu: { code: string }) => menu.code === 'system')).toMatchObject({
    owner: 'iot',
    options: { show: true },
  })
  await expect(modal).toHaveCount(0)
  expect(requests.some((url) => url.endsWith('/user/settings/init'))).toBe(false)
})
test('log queries retain typed method/date terms and structured exception details', async ({
  page,
}) => {
  test.setTimeout(60000)
  await login(page)
  let fetched = page.waitForRequest((request) => request.url().endsWith('/logger/access/_query'))
  await page.goto('logger/access')
  expect((await fetched).postDataJSON().sorts).toEqual([{ name: 'responseTime', order: 'desc' }])
  await expect(page.getByRole('cell', { name: '127.0.0.1', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Admin', exact: true })).toBeVisible()
  await queryField(page, '请求方法')
  await page.locator('.query-row[data-query-row="0.0"] .query-value.ant-select').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByTitle('GET', { exact: true })
    .click()
  fetched = page.waitForRequest((request) => request.url().endsWith('/logger/access/_query'))
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  expect((await fetched).postDataJSON().terms).toEqual([
    { column: 'httpMethod', termType: 'eq', value: 'GET' },
  ])
  await page.getByRole('button', { name: '详情', exact: true }).click()
  const modal = page.locator('.ant-modal:visible')
  await expect(modal.getByText('ExampleController', { exact: true })).toBeVisible()
  await expect(modal.getByText('Example access error', { exact: true })).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('pro-access-log.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await modal.locator('.ant-modal-close').click()
  await queryField(page, '请求时间')
  const dates = page.locator('.query-row[data-query-row="0.0"] .ant-picker-input input')
  const start = new Date()
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  const calendar = page.locator('.ant-picker-dropdown:visible')
  await dates.nth(0).click()
  await calendar.locator(`.ant-picker-cell-in-view[title="${calendarDay(start)}"]`).click()
  await calendar.locator('.ant-picker-footer .ant-picker-ok button').click()
  await dates.nth(1).click()
  const endCell = calendar.locator(`.ant-picker-cell-in-view[title="${calendarDay(end)}"]`)
  if (!(await endCell.count())) await calendar.locator('.ant-picker-header-next-btn').click()
  await endCell.click()
  await calendar.locator('.ant-picker-footer .ant-picker-ok button').click()
  await expect(dates.nth(0)).not.toHaveValue('')
  await expect(dates.nth(1)).not.toHaveValue('')
  fetched = page.waitForRequest((request) => request.url().endsWith('/logger/access/_query'))
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  const term = (await fetched).postDataJSON().terms[0]
  expect(term).toMatchObject({
    column: 'requestTime',
    termType: 'btw',
    value: [expect.any(Number), expect.any(Number)],
  })
  fetched = page.waitForRequest((request) => request.url().endsWith('/logger/system/_query'))
  await page.goto('system/Log/System')
  expect((await fetched).postDataJSON().sorts).toEqual([{ name: 'createTime', order: 'desc' }])
  await expect(page.getByRole('cell', { name: 'node1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page.getByRole('dialog').locator('.log-stack')).toContainText('ExampleException')
  await expect(page.getByRole('dialog').locator('.log-meta')).toContainText('reactor-http')
  await page.screenshot({
    path: test.info().outputPath('pro-system-log.png'),
    fullPage: true,
    animations: 'disabled',
  })
})
