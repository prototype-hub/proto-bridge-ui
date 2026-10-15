import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('menus start collapsed, preserve explicit expansion on refresh and save English metadata for immediate navigation', async ({
  page,
}) => {
  test.setTimeout(60000)
  const child = {
    id: 'editable-menu',
    code: 'system/Menu',
    name: '原菜单名称',
    url: '/system/menu',
    icon: 'AppstoreOutlined',
    sortIndex: 1,
    parentId: 'system',
    i18nMessages: {
      name: { zh_CN: '原菜单名称', en: 'Legacy menus', fr: 'Menus français' },
      describe: { fr: 'Description française' },
    },
    buttons: ['view', 'add', 'update', 'delete'].map((id) => ({ id, name: id, granted: true })),
    permissions: [],
    granted: true,
  }
  const root = { id: 'system', code: 'system', name: '系统管理', url: '/system', children: [child] }
  const envelope = (result: unknown) => ({ success: true, status: 200, result })
  await page.route('**/api/menu/_all/tree', (route) => route.fulfill({ json: envelope([root]) }))
  await page.route('**/api/menu/user-own/tree', (route) =>
    route.fulfill({
      json: envelope([
        { id: 'proto', code: 'protohub/Project', name: '原型项目', url: '/protohub/projects' },
        root,
      ]),
    }),
  )
  await page.route('**/api/menu/editable-menu', (route) => route.fulfill({ json: envelope(child) }))
  await page.route('**/api/menu', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    Object.assign(child, route.request().postDataJSON())
    await route.fulfill({ json: envelope(child) })
  })
  await login(page)
  await page.goto('system/menu')
  await expect(page.locator('.pro-layout')).not.toHaveClass(/pro-layout-collapsed/)
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '原菜单名称', exact: true }) })
  await expect(row).toHaveCount(0)
  await page.locator('tbody .ant-table-row-expand-icon').first().click()
  await expect(row).toBeVisible()
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const drawer = page.locator('.ant-drawer-body')
  await expect(drawer.getByLabel('组件编码', { exact: true })).toHaveCount(0)
  await expect(
    drawer.getByText('页面地址需对应已实现的页面，目录可包含子菜单', { exact: true }),
  ).toBeVisible()
  await expect(drawer.getByLabel('英文名称', { exact: true })).toHaveValue('Legacy menus')
  await drawer.getByLabel('名称', { exact: true }).fill('新菜单名称')
  await drawer.getByLabel('英文名称', { exact: true }).fill('Custom menus')
  const saving = page.waitForRequest(
    (request) => request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/menu',
  )
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saving).postDataJSON()).toMatchObject({
    name: '新菜单名称',
    i18nMessages: {
      name: {
        zh_CN: '新菜单名称',
        en_US: 'Custom menus',
        en: 'Custom menus',
        fr: 'Menus français',
      },
      describe: { fr: 'Description française' },
    },
  })
  await expect(
    page
      .getByRole('complementary', { name: '二三级菜单' })
      .getByText('新菜单名称', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Secondary navigation' })
      .getByText('Custom menus', { exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Custom menus', exact: true }) }),
  ).toBeVisible()
})

test('nullable menu and button permissions open and save without a page render error', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  let menu: Record<string, unknown> = {
    id: 'nullable-menu',
    code: 'system/Nullable',
    name: 'Nullable menu',
    url: '/system/nullable',
    icon: 'AppstoreOutlined',
    sortIndex: 1,
    accessSupport: { value: 'unsupported', text: '不支持' },
    permissions: null,
    indirectMenus: null,
    options: null,
    children: null,
    buttons: [{ id: 'view', name: 'Nullable button', permissions: null, description: null }],
    extraSettings: { preserved: true },
  }
  const envelope = (result: unknown) => ({ success: true, status: 200, result })
  await page.route('**/api/menu/_all/tree', (route) => route.fulfill({ json: envelope([menu]) }))
  await page.route('**/api/menu/nullable-menu', (route) => route.fulfill({ json: envelope(menu) }))
  await page.route('**/api/permission/_query/no-paging', (route) =>
    route.fulfill({
      json: envelope([
        { id: 'menu', name: 'Menu resource', actions: [{ action: 'query', name: 'Query' }] },
      ]),
    }),
  )
  await page.route('**/api/menu', (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    menu = { ...menu, ...route.request().postDataJSON() }
    return route.fulfill({ json: envelope(menu) })
  })
  await login(page)
  await page.goto('system/menu')
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Nullable menu', exact: true }) })
  await expect(row).toBeVisible()
  expect(errors.map((error) => error.message)).toEqual([])
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const drawer = page.locator('.ant-drawer-body')
  await expect(drawer.getByLabel('名称', { exact: true })).toHaveValue('Nullable menu')
  await expect(drawer.locator('.permission-picker')).toContainText('Menu resource')
  await expect(drawer.getByRole('checkbox', { name: 'Query', exact: true })).not.toBeChecked()
  expect(errors.map((error) => error.message)).toEqual([])
  await page.screenshot({
    path: test.info().outputPath('bugfix-menu-editor.png'),
    animations: 'disabled',
  })

  await drawer.getByRole('tab', { name: '按钮管理', exact: true }).click()
  const button = drawer
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Nullable button', exact: true }) })
  await button.getByRole('button', { name: '编辑', exact: true }).click()
  const modal = page.locator('.ant-modal:visible')
  await expect(modal.getByLabel('动作名称', { exact: true })).toHaveValue('Nullable button')
  await expect(modal.locator('.permission-picker')).toContainText('Menu resource')
  await expect(modal.getByRole('checkbox', { name: 'Query', exact: true })).not.toBeChecked()
  expect(errors.map((error) => error.message)).toEqual([])
  await modal.getByRole('checkbox', { name: 'Query', exact: true }).check()
  const saved = page.waitForRequest(
    (request) => request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/menu',
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).postDataJSON()).toMatchObject({
    id: 'nullable-menu',
    accessSupport: { value: 'unsupported', text: '不支持' },
    permissions: [],
    buttons: [
      {
        id: 'view',
        name: 'Nullable button',
        permissions: [{ permission: 'menu', actions: ['query'] }],
      },
    ],
    extraSettings: { preserved: true },
  })
  await expect(modal).not.toBeVisible()
  expect(errors.map((error) => error.message)).toEqual([])
})
