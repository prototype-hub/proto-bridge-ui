import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('personal profile loads without optional settings and saves only editable information', async ({
  page,
}) => {
  const profile = {
    id: 'u1',
    username: 'admin',
    name: 'Admin',
    status: 1,
    avatar: '/avatar.png',
    telephone: '13800138000',
    email: 'admin@example.com',
    roleList: [{ id: 'r1', name: 'Account role' }],
    orgList: [{ id: 'o1', name: 'Account organization' }],
    positions: [{ id: 'p1', name: 'Account position' }],
  }
  await page.route('**/api/user/detail', async (route) => {
    if (route.request().method() === 'PUT') {
      Object.assign(profile, route.request().postDataJSON())
      await route.fulfill({ json: { success: true, status: 200, result: true } })
    } else await route.fulfill({ json: { success: true, status: 200, result: profile } })
  })
  await page.route('**/api/user/settings/view/user', (route) =>
    route.fulfill({
      status: 404,
      json: { success: false, status: 404, message: '资源不存在' },
    }),
  )
  await login(page)
  const optionalRequests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (
      /\/user\/settings\/view\/user$|\/application\/sso\/|\/notifications\/|\/notify\/channel\//.test(
        path,
      )
    )
      optionalRequests.push(path)
  })
  await page.goto('account/center')
  const menuHydration = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/menu/user-own/tree',
  )
  await page.reload()
  const hydratedMenus = await menuHydration
  expect(hydratedMenus.ok()).toBe(true)
  expect(hydratedMenus.request().postDataJSON()).toEqual({ paging: false })
  const primary = page.getByRole('navigation', { name: '一级菜单' })
  const secondary = page.getByRole('complementary', { name: '二三级菜单' })
  await expect(primary.getByRole('menuitem', { name: '系统管理', exact: true })).toBeVisible()
  await expect(primary.getByRole('menuitem', { name: '原型管理', exact: true })).toBeVisible()
  await expect(secondary).toHaveCount(0)
  await expect(page.locator('.pro-layout')).toHaveClass(/pro-layout-full/)
  await expect(page.getByRole('button', { name: '打开菜单', exact: true })).toHaveCount(0)
  for (const name of ['个人中心', '个人信息']) {
    await expect(primary.getByText(name, { exact: true })).toHaveCount(0)
    await expect(secondary.getByText(name, { exact: true })).toHaveCount(0)
  }
  await primary.getByRole('menuitem', { name: '系统管理', exact: true }).click()
  await expect(page).toHaveURL(/\/system\/user$/)
  await expect(secondary).toBeVisible()
  await expect(page.locator('.pro-layout')).not.toHaveClass(/pro-layout-collapsed/)
  const permissionGroup = secondary
    .locator('.ant-menu-submenu-title')
    .filter({ hasText: /^权限管理$/ })
  await expect(permissionGroup).toBeVisible()
  await expect(permissionGroup).toHaveAttribute('aria-expanded', 'false')
  await permissionGroup.click()
  await expect(secondary.getByRole('menuitem', { name: '用户管理', exact: true })).toBeVisible()
  await secondary.getByRole('menuitem', { name: '用户管理', exact: true }).click()
  await expect(page).toHaveURL(/\/system\/user$/)
  await page.getByRole('button', { name: '收起菜单', exact: true }).click()
  await page.locator('.pro-user').click()
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: /个人中心$/ })
    .click()
  await expect(page).toHaveURL(/\/account\/center$/)
  await expect(secondary).toHaveCount(0)
  await expect(page.locator('.pro-layout')).toHaveClass(/pro-layout-full/)
  const details = page.locator('.ant-descriptions')
  await expect(details.getByText('admin', { exact: true })).toBeVisible()
  for (const name of ['Account role', 'Account organization', 'Account position'])
    await expect(details.getByText(name, { exact: true })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  for (const name of ['站内信', '我的订阅', '第三方账号', '默认首页'])
    await expect(page.getByText(name, { exact: true })).toHaveCount(0)
  await expect(page.getByText('资源不存在', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('名称', { exact: true }).fill('Updated account')
  await modal.getByLabel('联系电话', { exact: true }).fill('13900139000')
  await modal.getByLabel('电子邮箱', { exact: true }).fill('updated@example.com')
  const saving = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/user/detail'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saving).postDataJSON()).toEqual({
    name: 'Updated account',
    avatar: '/avatar.png',
    telephone: '13900139000',
    email: 'updated@example.com',
  })
  await expect(details.getByText('Updated account', { exact: true })).toBeVisible()
  await expect(details.getByText('updated@example.com', { exact: true })).toBeVisible()
  expect(optionalRequests).toEqual([])
  await page.screenshot({
    path: test.info().outputPath('bugfix-account-profile.png'),
    fullPage: true,
  })
})

test('account binding refresh retains authorized top menus and hides desktop and mobile sidebars', async ({
  page,
}) => {
  await page.route('**/api/application/sso/bind-code/navigation-test', (route) =>
    route.fulfill({
      json: { success: true, status: 200, result: { name: 'Navigation binding' } },
    }),
  )
  await login(page)
  await page.goto('account/center/bind?code=navigation-test')
  const menuHydration = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/menu/user-own/tree',
  )
  await page.reload()
  const hydratedMenus = await menuHydration
  expect(hydratedMenus.ok()).toBe(true)
  expect(hydratedMenus.request().postDataJSON()).toEqual({ paging: false })
  await expect(page.getByRole('heading', { name: '第三方账号', exact: true })).toBeVisible()
  await expect(page.getByText('Navigation binding', { exact: true })).toBeVisible()
  const primary = page.getByRole('navigation', { name: '一级菜单' })
  await expect(primary.getByRole('menuitem', { name: '系统管理', exact: true })).toBeVisible()
  await expect(primary.getByRole('menuitem', { name: '原型管理', exact: true })).toBeVisible()
  for (const name of ['个人中心', '个人信息'])
    await expect(primary.getByText(name, { exact: true })).toHaveCount(0)
  await expect(page.locator('.pro-sider')).toHaveCount(0)
  await expect(page.locator('.pro-layout')).toHaveClass(/pro-layout-full/)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(primary.getByRole('menuitem', { name: '系统管理', exact: true })).toBeVisible()
  await expect(primary.getByRole('menuitem', { name: '原型管理', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开菜单', exact: true })).toHaveCount(0)
  await expect(page.locator('.ant-drawer')).toHaveCount(0)
  await page.screenshot({
    path: test.info().outputPath('account-binding-mobile-navigation.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.locator('.pro-user').click()
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: /个人中心$/ })
    .click()
  await expect(page).toHaveURL(/\/account\/center$/)
  await expect(page.locator('.pro-sider')).toHaveCount(0)
})

test('avatars upload without file-management permission and preserve crop pixels and the previous image on errors', async ({
  page,
}) => {
  test.setTimeout(90000)
  let currentAvatar = '/old-avatar.png'
  const originalAvatar = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const context = canvas.getContext('2d')!
      context.fillStyle = '#1677ff'
      context.fillRect(0, 0, 128, 128)
      return canvas.toDataURL('image/png').split(',')[1]!
    }),
    'base64',
  )
  let uploadedAvatar = originalAvatar
  await page.route('**/old-avatar.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: originalAvatar }),
  )
  await page.route('**/cropped-avatar.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: uploadedAvatar }),
  )
  await page.route('**/api/user/detail', async (route) => {
    if (route.request().method() === 'PUT') {
      currentAvatar = route.request().postDataJSON().avatar
      await route.fulfill({ json: { success: true, status: 200, result: true } })
    } else
      await route.fulfill({
        json: {
          success: true,
          status: 200,
          result: { id: 'u1', username: 'admin', name: 'Admin', status: 1, avatar: currentAvatar },
        },
      })
  })
  await login(page)
  await page.goto('account')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const profile = page.getByRole('dialog').filter({ has: page.locator('.avatar-editor') })
  const updates: unknown[] = [],
    uploads: Buffer[] = []
  let managedUploads = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/user/detail'))
      updates.push(request.postDataJSON())
  })
  let rejectUpload = true
  await page.route('**/api/file/upload', (route) => {
    managedUploads++
    return route.fulfill({
      status: 403,
      json: { success: false, status: 403, message: 'No file-management permission' },
    })
  })
  await page.route('**/api/user/me/avatar', async (route) => {
    uploads.push(route.request().postDataBuffer()!)
    if (rejectUpload)
      await route.fulfill({
        status: 400,
        json: { success: false, status: 400, message: 'Upload rejected' },
      })
    else {
      const multipart = uploads.at(-1)!,
        start = multipart.indexOf(Buffer.from('\r\n\r\n')) + 4,
        end = multipart.indexOf(Buffer.from('\r\n--'), start)
      uploadedAvatar = multipart.subarray(start, end)
      await route.fulfill({
        json: {
          success: true,
          status: 200,
          result: { accessUrl: '/cropped-avatar.png', url: '/unused.png' },
        },
      })
    }
  })
  const base64 = await page.evaluate(() => {
    const source = document.createElement('canvas')
    source.width = 800
    source.height = 400
    const context = source.getContext('2d')!
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 400, 400)
    context.fillStyle = '#0000ff'
    context.fillRect(400, 0, 400, 400)
    return source.toDataURL('image/png').split(',')[1]!
  })
  await expect(profile.locator('.avatar-current img')).toHaveAttribute('src', '/old-avatar.png')
  await expect
    .poll(() =>
      profile
        .locator('.avatar-current img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(128)
  const input = profile.locator('input[type="file"]')
  await expect(input).toBeHidden()
  await page.screenshot({
    path: test.info().outputPath('system-slimming-profile-editor.png'),
    animations: 'disabled',
    fullPage: true,
  })
  const choosing = page.waitForEvent('filechooser')
  await profile.getByRole('button', { name: '选择头像', exact: true }).click()
  await (
    await choosing
  ).setFiles({
    name: 'not-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid'),
  })
  await expect(profile.getByText(/请选择有效的 PNG/)).toBeVisible()
  expect(uploads).toHaveLength(0)
  const source = {
    name: 'source.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  }
  await input.setInputFiles(source)
  const crop = page.getByRole('dialog').filter({ has: page.locator('.avatar-crop-preview') })
  const preview = crop.locator('canvas')
  await expect(preview).toBeVisible()
  const original = await preview.evaluate((element: HTMLCanvasElement) => element.toDataURL())
  await crop.locator('.ant-slider').nth(0).getByRole('slider').focus()
  await page.keyboard.press('End')
  await crop.locator('.ant-slider').nth(1).getByRole('slider').focus()
  await page.keyboard.press('End')
  await expect
    .poll(() => preview.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(original)
  const pixel = await preview.evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext('2d')!.getImageData(128, 128, 1, 1).data),
  )
  expect(pixel).toEqual([0, 0, 255, 255])
  await crop.locator('.avatar-size .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText('128 × 128', { exact: true })
    .click()
  await expect(preview).toHaveAttribute('width', '128')
  await page.screenshot({
    path: test.info().outputPath('system-slimming-avatar-crop.png'),
    animations: 'disabled',
    fullPage: true,
  })
  expect(uploads).toHaveLength(0)
  await crop.getByRole('button', { name: '取消', exact: true }).click()
  expect(uploads).toHaveLength(0)
  expect(updates).toHaveLength(0)
  await input.setInputFiles(source)
  await crop.getByRole('button', { name: '确认上传', exact: true }).click()
  await expect(crop.getByText('Upload rejected', { exact: true })).toBeVisible()
  await expect(profile.locator('.avatar-current img')).toHaveAttribute('src', '/old-avatar.png')
  expect(updates).toHaveLength(0)
  rejectUpload = false
  await crop.getByRole('button', { name: '确认上传', exact: true }).click()
  await expect(crop).not.toBeVisible()
  await expect(profile.locator('.avatar-current img')).toHaveAttribute('src', '/cropped-avatar.png')
  const body = uploads[1]!,
    start = body.indexOf(Buffer.from('\r\n\r\n')) + 4,
    end = body.indexOf(Buffer.from('\r\n--'), start),
    png = body.subarray(start, end)
  expect(body.toString('utf8', 0, start)).toContain('name="file"; filename="avatar.png"')
  expect(body.toString('utf8', 0, start)).toContain('Content-Type: image/png')
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.readUInt32BE(16)).toBe(128)
  expect(png.readUInt32BE(20)).toBe(128)
  await profile.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => updates).toEqual([{ name: 'Admin', avatar: '/cropped-avatar.png' }])
  expect(managedUploads).toBe(0)
})

test('mandatory profile failures remain retryable and rejected passwords never update or end the session', async ({
  page,
}) => {
  await login(page)
  let profileReads = 0
  await page.route('**/api/user/detail', (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    // Full navigation boots a new session first; fail only AccountView's subsequent profile read.
    profileReads += 1
    if (profileReads !== 2) return route.continue()
    return route.fulfill({
      status: 404,
      json: { success: false, status: 404, message: '资料不存在' },
    })
  })
  await page.goto('account/center')
  await expect(page.getByText('资料不存在', { exact: true }).last()).toBeVisible()
  expect(profileReads).toBe(2)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.ant-descriptions').getByText('admin', { exact: true })).toBeVisible()
  expect(profileReads).toBe(3)
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const modal = page.getByRole('dialog')
  const updates: unknown[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/user/passwd'))
      updates.push(request.postDataJSON())
  })
  await modal.getByLabel('旧密码', { exact: true }).fill('old-password')
  await page.route('**/api/user/me/password/_validate', (route) =>
    route.fulfill({
      json: { success: true, status: 200, result: { passed: false, reason: '旧密码校验失败' } },
    }),
  )
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(modal.getByText('旧密码校验失败', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('新密码', { exact: true })).toHaveCount(0)
  expect(updates).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeTruthy()
  await page.unroute('**/api/user/me/password/_validate')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('新密码', { exact: true }).fill('Newpassword123')
  await page.route('**/api/user/password/_validate', (route) =>
    route.fulfill({
      json: { success: true, status: 200, result: { passed: false, reason: '新密码校验失败' } },
    }),
  )
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(modal.getByText('新密码校验失败', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('确认密码', { exact: true })).toHaveCount(0)
  expect(updates).toEqual([])
  await page.unroute('**/api/user/password/_validate')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('确认密码', { exact: true }).fill('Mismatch123')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByText('两次输入的密码不一致', { exact: true })).toBeVisible()
  expect(updates).toEqual([])
  await modal.getByLabel('确认密码', { exact: true }).fill('Newpassword123')
  const saving = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/user/passwd'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saving).postDataJSON()).toEqual({
    oldPassword: 'old-password',
    newPassword: 'Newpassword123',
  })
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})
