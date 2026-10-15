import { test, expect } from '@playwright/test'
import { login } from './system-helpers'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
test('three-level menus, direct refresh, collapse and mobile navigation', async ({ page }) => {
  await login(page)
  await page.getByRole('menuitem', { name: '系统管理', exact: true }).click()
  await expect(page.locator('.pro-sider')).toBeVisible()
  await expect(page.locator('.pro-layout')).not.toHaveClass(/pro-layout-collapsed/)
  await expect.poll(async () => (await page.locator('.pro-sider').boundingBox())?.width).toBe(208)
  await expect(
    page.locator('.pro-sider .ant-menu-submenu-title[aria-expanded="true"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('.pro-sider').getByRole('menuitem', { name: '用户管理', exact: true }),
  ).toBeHidden()
  await page
    .locator('.pro-sider .ant-menu-submenu-title')
    .filter({ hasText: /^权限管理$/ })
    .click()
  await expect(
    page.locator('.pro-sider').getByRole('menuitem', { name: '用户管理', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.pro-sider .anticon-user')).toBeVisible()
  await expect(
    page.locator('.pro-sider .ant-menu-submenu-title').filter({ hasText: /^组织与职位$/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  const primary = page.getByRole('navigation', { name: '一级菜单' })
  await primary.getByRole('menuitem', { name: '原型管理', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub$/)
  const prototypeSidebar = page.getByRole('complementary', { name: '二三级菜单' })
  await expect(prototypeSidebar).toBeVisible()
  await expect(
    prototypeSidebar.getByRole('menuitem', { name: '原型项目', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await prototypeSidebar.getByRole('menuitem', { name: '原型项目', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub$/)
  await primary.getByRole('menuitem', { name: '系统管理', exact: true }).click()
  await expect(
    page.locator('.pro-sider .ant-menu-submenu-title[aria-expanded="true"]'),
  ).toHaveCount(0)
  await page.goto('system/positions')
  await page.reload()
  await expect(page.getByRole('heading', { name: '职位管理', exact: true })).toBeVisible()
  await expect(page.locator('.pro-breadcrumb')).toHaveText('系统管理/组织与职位/职位管理/')
  await expect(page.locator('.pro-layout')).not.toHaveClass(/pro-layout-collapsed/)
  await expect(
    page.locator('.pro-sider .ant-menu-submenu-title[aria-expanded="true"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('.pro-sider').getByRole('menuitem', { name: '职位管理', exact: true }),
  ).toBeHidden()
  await page
    .locator('.pro-sider .ant-menu-submenu-title')
    .filter({ hasText: /^组织与职位$/ })
    .click()
  await expect(
    page.locator('.pro-sider').getByRole('menuitem', { name: '职位管理', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('.pro-sider .ant-menu-submenu-title').filter({ hasText: /^权限管理$/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({
    path: test.info().outputPath('pro-system-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '收起菜单', exact: true }).click()
  await expect(page.locator('.pro-layout')).toHaveClass(/pro-layout-collapsed/)
  await expect.poll(async () => (await page.locator('.pro-sider').boundingBox())?.width).toBe(64)
  await expect
    .poll(async () => (await page.locator('.pro-sider .ant-menu-root').boundingBox())?.width)
    .toBe(64)
  await page.screenshot({
    path: test.info().outputPath('pro-system-collapsed.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: '职位管理', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const mobileGroup = page
    .locator('.ant-drawer-body .ant-menu-submenu-title')
    .filter({ hasText: /^组织与职位$/ })
  await expect(mobileGroup).toHaveAttribute('aria-expanded', 'false')
  await expect(
    page.locator('.ant-drawer-body').getByRole('menuitem', { name: '职位管理', exact: true }),
  ).toBeHidden()
  await mobileGroup.click()
  await expect(
    page.locator('.ant-drawer-body').getByRole('menuitem', { name: '职位管理', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('pro-system-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await expect
    .poll(async () => (await page.locator('.ant-drawer-content-wrapper').boundingBox())?.x)
    .toBe(0)
  await expect(page.locator('.ant-menu-submenu-popup:visible')).toHaveCount(0)
  await page
    .locator('.ant-drawer-body')
    .getByRole('menuitem', { name: '组织管理', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '组织管理', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
})
test('all retained system pages resolve and query their legacy endpoints', async ({ page }) => {
  await login(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [path, title] of [
    ['system/user', '用户管理'],
    ['system/Role', '角色管理'],
    ['system/Menu', '菜单管理'],
    ['system/Permission', '权限资源'],
    ['logger/access', '访问日志'],
    ['system/Basis', '基础配置'],
    ['system/Dictionary', '数据字典'],
    ['system/Department', '组织管理'],
    ['system/positions', '职位管理'],
    ['system/Log/System', '系统日志'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible()
    await expect(page.getByText('Unknown fixture endpoint')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
test('dictionary creation, item editing and duplicate validation', async ({ page }) => {
  await login(page)
  await page.goto('system/Dictionary')
  await page.locator('.dictionary-left').getByRole('button', { name: '新增', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('标识', { exact: true }).fill('severity')
  await modal.getByLabel('名称', { exact: true }).fill('严重程度')
  const save = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/dictionary'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await save).postDataJSON()).toMatchObject({ id: 'severity', name: '严重程度', status: 1 })
  await page.getByRole('button', { name: '严重程度', exact: true }).click()
  await expect(page.locator('.dictionary-summary')).toContainText('severity')
  await page
    .locator('.dictionary-workspace section')
    .getByRole('button', { name: '新增', exact: true })
    .click()
  await modal.getByLabel('名称（name）', { exact: true }).fill('high')
  await modal.getByLabel('值（value）', { exact: true }).fill('high')
  await modal.getByLabel('文本（text）', { exact: true }).fill('High')
  const item = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/dictionary-item'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await item).postDataJSON()).toMatchObject({
    dictId: 'severity',
    searchCode: 'high:high:High',
    ordinal: 1,
  })
  await expect(page.getByRole('cell', { name: 'High', exact: true })).toBeVisible()
})
test('organization retains position and user management with array member payloads', async ({
  page,
}) => {
  await login(page)
  await page.goto('system/Department')
  await page.locator('.ant-tree-title').getByText('研发部', { exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(page.getByRole('tab', { name: '职位管理', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('tab', { name: '产品资产', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '设备资产', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '用户', exact: true }).click()
  const candidates = page.waitForResponse(
    (response) =>
      response.url().endsWith('/user/detail/_query') &&
      JSON.stringify(response.request().postDataJSON()).includes('id$in-dimension$org$not'),
  )
  await page.getByRole('button', { name: '绑定用户', exact: true }).click()
  expect((await (await candidates).json()).result.data).toContainEqual(
    expect.objectContaining({ id: 'u2', username: 'operator' }),
  )
  const modal = page.getByRole('dialog')
  await modal.getByRole('row').filter({ hasText: 'operator' }).getByRole('checkbox').check()
  const binding = page.waitForRequest((request) =>
    request.url().endsWith('/organization/org1/users/_bind'),
  )
  await modal.getByRole('button', { name: '确定', exact: true }).click()
  expect((await binding).postDataJSON()).toEqual(['u2'])
})
test('role groups and permission resources retain management operations', async ({ page }) => {
  test.setTimeout(90000)
  await login(page)
  await page.goto('system/Role')
  const sidebar = page.locator('.role-sidebar')
  await sidebar.getByRole('button', { name: '新增分组', exact: true }).click()
  let modal = page.getByRole('dialog')
  await modal.getByLabel('名称', { exact: true }).fill('测试分组')
  const groupSaved = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/role/group'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  const groupId = (await groupSaved).postDataJSON().id as string
  await expect(sidebar.getByText('测试分组', { exact: true })).toBeVisible()
  await sidebar.getByText('测试分组', { exact: true }).click()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await expect(modal.getByText('测试分组', { exact: true })).toBeVisible()
  await modal.getByLabel('名称', { exact: true }).fill('分组角色')
  const roleSaved = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/role'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await roleSaved).postDataJSON()).toMatchObject({ name: '分组角色', groupId })
  await page.goto('system/Permission')
  await page.getByRole('button', { name: '新增', exact: true }).click()
  modal = page.getByRole('dialog')
  await modal.getByLabel('标识', { exact: true }).fill('custom-resource')
  await modal.getByLabel('名称', { exact: true }).fill('自定义资源')
  await expect(modal.locator('tbody tr.ant-table-row')).toHaveCount(3)
  await modal.locator('tbody tr.ant-table-row').first().locator('input').nth(1).fill('查询资源')
  const resourceSaved = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/permission'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await resourceSaved).postDataJSON().actions).toContainEqual({
    action: 'query',
    name: '查询资源',
    describe: '查询',
  })
  await expect(page.getByRole('cell', { name: 'custom-resource', exact: true })).toBeVisible()
})
