import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('a saved URL-only menu opens its real index page after reload while legacy system menus remain usable', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  await login(page)
  await page.goto('system/Menu')
  await page.getByRole('button', { name: '新增', exact: true }).first().click()
  const drawer = page.locator('.ant-drawer-body')
  await expect(drawer.getByLabel('组件编码', { exact: true })).toHaveCount(0)
  await drawer.getByLabel('名称', { exact: true }).fill('自动关联日志页')
  await drawer.getByLabel('编码', { exact: true }).fill('url-only-access')
  await drawer.getByLabel('页面地址', { exact: true }).fill('/system/log/access')
  await drawer.getByRole('button', { name: '点击选择图标', exact: true }).click()
  await page
    .locator('.ant-modal:visible')
    .getByRole('button', { name: 'SettingOutlined', exact: true })
    .click()
  const saving = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/menu',
  )
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  const response = await saving
  const payload = response.request().postDataJSON()
  expect(payload).toMatchObject({
    code: 'url-only-access',
    url: '/system/log/access',
    owner: 'iot',
  })
  expect(payload).not.toHaveProperty('componentCode')
  expect(payload.options?.meta || {}).not.toHaveProperty('componentCode')
  const stored = (await response.json()).result
  expect(stored.id).toEqual(expect.any(String))
  const detail = await page.request.get(`/api/menu/${stored.id}`, {
    headers: { 'X-Access-Token': response.request().headers()['x-access-token']! },
  })
  expect(detail.ok()).toBe(true)
  const persisted = (await detail.json()).result
  expect(persisted).toMatchObject({
    id: stored.id,
    code: 'url-only-access',
    url: '/system/log/access',
  })
  expect(persisted.options?.meta || {}).not.toHaveProperty('componentCode')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.goto('system/user')
  await page
    .getByRole('navigation', { name: '一级菜单' })
    .getByRole('menuitem', { name: '系统管理', exact: true })
    .click()
  const sidebar = page.getByRole('complementary', { name: '二三级菜单' })
  await sidebar
    .locator('.ant-menu-submenu-title')
    .filter({ hasText: /^权限管理$/ })
    .click()
  await sidebar.getByRole('menuitem', { name: /自动关联日志页$/ }).click()
  await expect(page).toHaveURL(/\/system\/log\/access$/)
  await expect(page.getByRole('heading', { name: '访问日志', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '访问日志', exact: true })).toBeVisible()
  await page.goto('system/Role')
  await page.reload()
  await expect(page.getByRole('heading', { name: '角色管理', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('canonical and legacy prototype menus use the new API and keep detail, standalone preview and anonymous share boundaries', async ({
  page,
  context,
}) => {
  test.setTimeout(60000)
  const calls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) calls.push(new URL(request.url()).pathname)
  })
  await login(page)
  await expect(page).toHaveURL(/\/tools\/prototype-hub$/)
  expect(calls).toContain('/api/prototype-hub/projects/_query')
  for (const url of ['protohub', 'protohub/projects', 'PrototypeHub', 'prototype-hub/projects']) {
    await page.goto(url)
    await page.reload()
    await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
    await expect(page.getByText('Contract project', { exact: true })).toBeVisible()
  }
  await page.goto('prototype-hub?filter=kept&page=2')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1\?filter=kept&page=2$/)
  await expect(page.getByRole('heading', { name: 'Contract project', exact: true })).toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  const previewSession = context.waitForEvent(
    'response',
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        '/api/prototype-hub/versions/v1/revisions/r-v1/preview-session',
  )
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/\/tools\/preview\/p1\/v1$/)
  const sessionResponse = await previewSession
  expect(sessionResponse.status()).toBe(200)
  const { previewUrl } = (await sessionResponse.json()).result as { previewUrl: string }
  expect(previewUrl).toMatch(/^\/api\/prototype-hub\/runtime\/v1\/[^/]+\/index\.html$/)
  await expect(popup.locator('iframe')).toHaveAttribute(
    'src',
    new URL(previewUrl, popup.url()).href,
  )
  await expect(popup.locator('.pro-header')).toHaveCount(0)
  await popup.close()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/prototype-hub\?filter=kept&page=2$/)
  await page.goto('protohub/projects/p1')
  await expect(page.getByRole('heading', { name: 'Contract project', exact: true })).toBeVisible()
  expect(calls.some((path) => path.startsWith('/api/protohub/'))).toBe(false)

  const anonymous = await context.browser()!.newContext()
  const publicPage = await anonymous.newPage()
  const publicRequests: { path: string; token?: string }[] = []
  publicPage.on('request', (request) => {
    if (request.url().includes('/api/'))
      publicRequests.push({
        path: new URL(request.url()).pathname,
        token: request.headers()['x-access-token'],
      })
  })
  try {
    await publicPage.goto(
      new URL('prototype-hub/share/open', page.url().split('/tools/')[0] + '/tools/').href,
    )
    await expect(publicPage.locator('iframe')).toBeVisible()
    expect(
      publicRequests.some((request) =>
        request.path.startsWith('/api/prototype-hub/public/shares/open'),
      ),
    ).toBe(true)
    expect(publicRequests.every((request) => !request.token)).toBe(true)
    expect(
      publicRequests.some((request) =>
        /\/menu\/|\/user\/detail|\/authorize\/me/.test(request.path),
      ),
    ).toBe(false)
    await expect(publicPage.locator('.pro-header')).toHaveCount(0)
  } finally {
    await anonymous.close()
  }
})

test('legacy resource permissions do not authorize canonical detail or preview routes', async ({
  page,
}) => {
  await page.route('**/api/authorize/me', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          permissions: ['protohub-project', 'protohub-version', 'protohub-share'].map((id) => ({
            id,
            actions: ['query', 'save', 'delete'],
          })),
        },
      },
    }),
  )
  await login(page)
  await expect(page.getByRole('button', { name: '新建项目', exact: true })).toHaveCount(0)
  for (const url of [
    'prototype-hub/projects/p1',
    'protohub/projects/p1',
    'preview/p1/v1',
    'protohub/projects/p1/versions/v1',
  ]) {
    await page.goto(url)
    await expect(page).toHaveURL(/\/tools\/403$/)
    await expect(page.locator('iframe')).toHaveCount(0)
  }
})
