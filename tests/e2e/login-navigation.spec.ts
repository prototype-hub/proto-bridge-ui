import { expect, test, type Page } from '@playwright/test'
import type { ServerMenu } from '../../src/shared/auth/types'

const projects: ServerMenu = {
  id: 'projects',
  code: 'protohub/Project',
  name: '原型项目',
  url: '/protohub',
  sortIndex: 20,
}
const system: ServerMenu = {
  id: 'system-navigation',
  code: 'directory',
  name: '系统导航',
  sortIndex: 10,
  children: [
    {
      id: 'first-second-level',
      code: 'system/Role',
      name: '首个二级',
      url: '/system/Role',
      sortIndex: 10,
      children: [
        {
          id: 'denied-third-level',
          code: 'system/Menu',
          name: '未授权三级',
          url: '/system/Menu',
          granted: false,
          sortIndex: 0,
        },
        {
          id: 'first-third-level',
          code: 'system/User',
          name: '首个三级用户',
          url: '/system/user',
          sortIndex: 10,
        },
      ],
    },
  ],
}

async function menuFixture(page: Page, menus: ServerMenu[]) {
  const requests: { method: string; body: unknown }[] = []
  await page.route('**/api/menu/user-own/tree', (route) => {
    requests.push({ method: route.request().method(), body: route.request().postDataJSON() })
    return route.fulfill({ json: { success: true, status: 200, result: menus } })
  })
  return requests
}

async function signIn(page: Page, url = 'login') {
  await page.goto(url)
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('login and top-menu clicks both choose the first accessible third-level page before a routable second level', async ({
  page,
}) => {
  const menus: ServerMenu[] = [
    projects,
    { ...projects, id: 'denied-root', name: '未授权顶部', granted: false, sortIndex: 0 },
    { ...projects, id: 'hidden-root', name: '隐藏顶部', options: { show: false }, sortIndex: 1 },
    { id: 'empty-root', code: 'directory', name: '空目录', sortIndex: 2, children: [] },
    system,
  ]
  const requests = await menuFixture(page, menus)
  await signIn(page)
  await expect(page).toHaveURL(/\/system\/user$/)
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
  expect(requests).toEqual([{ method: 'POST', body: { paging: false } }])
  const primary = page.getByRole('navigation', { name: '一级菜单' })
  await expect(primary.getByRole('menuitem').first()).toHaveText('系统导航')
  for (const title of ['未授权顶部', '隐藏顶部', '空目录'])
    await expect(primary.getByText(title, { exact: true })).toHaveCount(0)
  const sidebar = page.getByRole('complementary', { name: '二三级菜单' })
  await expect(sidebar).toBeVisible()
  const sidebarBox = await sidebar.boundingBox()
  expect(sidebarBox?.width).toBe(208)
  await expect(page.locator('.pro-layout')).not.toHaveClass(/pro-layout-collapsed/)
  const second = sidebar.locator('.ant-menu-submenu-title').filter({ hasText: /^首个二级$/ })
  await expect(second).toHaveAttribute('aria-expanded', 'false')
  await second.click()
  await expect(sidebar.getByRole('menuitem', { name: /首个三级用户$/ })).toBeVisible()
  await expect(sidebar.getByText('未授权三级', { exact: true })).toHaveCount(0)
  await primary.getByRole('menuitem', { name: '原型项目', exact: true }).click()
  await expect(page).toHaveURL(/\/protohub$/)
  await primary.getByRole('menuitem', { name: '系统导航', exact: true }).click()
  await expect(page).toHaveURL(/\/system\/user$/)
  await expect(second).toHaveAttribute('aria-expanded', 'false')
})

test('an explicit authorized detail redirect retains its query and hash instead of the default menu page', async ({
  page,
}) => {
  await menuFixture(page, [projects, system])
  const redirect = '/system/Role/Detail/r1?from=login#permissions'
  await signIn(page, `login?redirect=${encodeURIComponent(redirect)}`)
  await expect(page).toHaveURL(/\/system\/Role\/Detail\/r1\?from=login#permissions$/)
  await expect(page.getByRole('heading', { name: '角色管理', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '一级菜单' })).toContainText('系统导航')
})

test('login with no accessible menu falls back once to the protected personal page without synthetic navigation', async ({
  page,
}) => {
  const requests = await menuFixture(page, [
    { ...projects, granted: false },
    { id: 'empty-root', code: 'directory', name: '空目录', children: [] },
  ])
  await signIn(page)
  await expect(page).toHaveURL(/\/account\/center$/)
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  expect(requests).toEqual([{ method: 'POST', body: { paging: false } }])
  await expect(
    page.getByRole('navigation', { name: '一级菜单' }).getByRole('menuitem'),
  ).toHaveCount(0)
  await expect(page.locator('.pro-sider')).toHaveCount(0)
  await expect(page.locator('.pro-user')).toBeVisible()
})
