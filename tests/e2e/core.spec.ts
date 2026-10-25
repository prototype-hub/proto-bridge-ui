import { test, expect, type Page } from '@playwright/test'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
async function login(page: Page, user = 'admin') {
  await page.goto('login')
  await page.getByLabel('用户名', { exact: true }).fill(user)
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
}
test.beforeEach(async ({ request }, testInfo) => {
  await request.post(new URL('/__test/reset', String(testInfo.project.use.baseURL)).toString())
})
test('login failures, session recovery, i18n and sign out', async ({ page }) => {
  await page.goto('login')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('Invalid credentials')).toBeVisible()
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Contract project', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Prototype projects' })).toBeVisible()
  await page.locator('.pro-user').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})
test('project cards navigate from content and keyboard without leaking operation events', async ({
  page,
}) => {
  await login(page)
  const openList = async () => {
    await page.goto('prototype-hub/projects?source=card')
    await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
    return page.locator('.project-card').filter({ hasText: 'Contract project' })
  }
  let card = await openList()
  await expect(card).toHaveAttribute('role', 'link')
  await expect(card).toHaveAttribute('tabindex', '0')
  await expect(card).toHaveAttribute('aria-label', '详情：Contract project')
  await expect(card.locator('.project-name')).toHaveText('Contract project')
  await expect(card.locator('.project-name button')).toHaveCount(0)
  await card.locator('.project-description').click()
  await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1\?source=card$/)

  card = await openList()
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1\?source=card$/)

  card = await openList()
  await card.focus()
  await page.keyboard.press('Space')
  await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1\?source=card$/)

  card = await openList()
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub\/projects\?source=card$/)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await card.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub\/projects\?source=card$/)
  await expect(page.locator('.ant-popconfirm')).toBeVisible()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '取消', exact: true }).click()

  await page.evaluate(() => {
    const originalPushState = history.pushState.bind(history)
    Reflect.set(window, '__projectDetailPushes', [])
    history.pushState = (data, unused, url) => {
      const pushes = Reflect.get(window, '__projectDetailPushes') as string[]
      pushes.push(String(url))
      originalPushState(data, unused, url)
    }
  })
  await card.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1\?source=card$/)
  expect(
    await page.evaluate(
      () =>
        (Reflect.get(window, '__projectDetailPushes') as string[]).filter((url) =>
          url.includes('/prototype-hub/projects/p1'),
        ).length,
    ),
  ).toBe(1)
})
test('project create edit and delete', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: '新建项目' }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('名称', { exact: true }).fill('Migrated project')
  await modal.getByLabel('描述', { exact: true }).fill('Long project description')
  await modal.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('Migrated project', { exact: true })).toBeVisible()
  const cards = page.locator('.project-card')
  await expect(cards).toHaveCount(2)
  const cardHeights = await cards.evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().height),
  )
  expect(Math.abs(cardHeights[0]! - cardHeights[1]!)).toBeLessThan(2)
  const card = page.locator('.ant-card').filter({ hasText: 'Migrated project' })
  expect(
    await card
      .locator('.project-actions button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(['详情', '编辑', '删除'])
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  await modal.getByLabel('名称', { exact: true }).fill('Updated project')
  await modal.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('Updated project', { exact: true })).toBeVisible()
  await page
    .locator('.ant-card')
    .filter({ hasText: 'Updated project' })
    .getByRole('button', { name: '删除' })
    .click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('Updated project', { exact: true })).toHaveCount(0)
})
test('project deletion is blocked until all versions are deleted', async ({ page }) => {
  await login(page)
  const card = page.locator('.project-card').filter({ hasText: 'Contract project' })
  const deleteProject = card.getByRole('button', { name: '删除', exact: true })

  await deleteProject.click()
  await expect(page.locator('.ant-popconfirm')).toContainText(protoLocales.zh.projectDeleteConfirm)
  await expect(page.locator('.ant-popconfirm')).toContainText('30 天')
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    page
      .getByText('项目下存在版本，请先删除全部版本后再删除项目', {
        exact: true,
      })
      .first(),
  ).toBeVisible()
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: '详情', exact: true }).click()
  const versionRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
  await versionRow.getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'V1', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '返回', exact: true }).click()
  const deletableCard = page.locator('.project-card').filter({ hasText: 'Contract project' })
  await deletableCard.getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(deletableCard).toHaveCount(0)
})
test('project cards keep compact actions and long content inside a mobile viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/prototype-hub/projects/_query', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    const body = await response.json()
    body.result.data.push({
      ...body.result.data[0],
      id: 'p-long',
      name: 'A very long prototype project name that must stay on one line',
      description: 'A long project summary used to verify the responsive card layout.',
      updatedAt: 1700000000001,
    })
    body.result.total = body.result.data.length
    await route.fulfill({ response, json: body })
  })
  await login(page)
  const card = page
    .locator('.project-card')
    .filter({ hasText: 'A very long prototype project name that must stay on one line' })
  await expect(card).toBeVisible()
  expect(
    await card.locator('.project-name').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        clipped: element.scrollWidth > element.clientWidth,
      }
    }),
  ).toEqual({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', clipped: true })
  expect(
    await card
      .locator('.project-actions button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(['详情', '编辑', '删除'])
  const updated = card.locator('.project-updated-text')
  const fullUpdatedText = (await updated.textContent())!.trim()
  expect(
    await updated.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      }
    }),
  ).toEqual({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  await updated.hover()
  await expect(page.getByRole('tooltip', { name: fullUpdatedText, exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('project-cards-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
})
test('version upload update preserves a share, then deletion', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '上传版本', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('版本名称').fill('V2')
  await modal.locator('input[type=file]').setInputFiles({
    name: 'test.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('fixture zip'),
  })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'V2', exact: true })).toBeVisible()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
  await row.getByRole('button', { name: '上传新修订' }).click()
  const updateActions = modal.locator('.upload-actions button')
  await expect(updateActions).toHaveText(['取消', '保存'])
  const updateButtonPositions = await updateActions.evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().x),
  )
  expect(updateButtonPositions[0]).toBeLessThan(updateButtonPositions[1]!)
  await modal.getByLabel('版本名称').fill('V1 updated')
  await modal.locator('input[type=file]').setInputFiles({
    name: 'replacement.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('fixture zip'),
  })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'V1 updated', exact: true })).toBeVisible()
  await page.goto('share/open')
  await expect(page.getByText('V1', { exact: true })).toBeVisible()
  await page.goto('protohub/projects/p1')
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'V2', exact: true }) })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'V2', exact: true })).toHaveCount(0)
})
test('failed version replacement keeps the current version and can retry', async ({ page }) => {
  await login(page)
  await page.goto('protohub/projects/p1')
  await page.route('**/api/prototype-hub/versions/v1', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 409,
          json: { success: false, status: 409, message: 'Unsafe ZIP', code: 'ZIP_INVALID' },
        })
      : route.continue(),
  )
  await page.getByRole('button', { name: '上传新修订' }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('版本名称').fill('Replacement')
  await modal
    .locator('input[type=file]')
    .setInputFiles({ name: 'test.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByText('Unsafe ZIP')).toBeVisible()
  await page.unroute('**/api/prototype-hub/versions/v1')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Replacement', exact: true })).toBeVisible()
})
test('cancel aborts an upload and does not leave the dialog blocked', async ({ page }) => {
  await login(page)
  await page.goto('protohub/projects/p1')
  await page.route('**/api/prototype-hub/projects/p1/versions', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.abort().catch(() => {})
  })
  await page.getByRole('button', { name: '上传版本' }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('版本名称').fill('Cancelled')
  await modal
    .locator('input[type=file]')
    .setInputFiles({ name: 'test.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await page.getByRole('button', { name: '上传版本' }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }),
  ).toBeDisabled()
})
test('share create copies a full origin and deployment base URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page)
  await page.goto('protohub/projects/p1')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('分享密码', { exact: true }).fill('private-share')
  await modal.locator('.ant-input-password-icon').click()
  await expect(modal.locator('input').first()).toHaveAttribute('type', 'text')
  await modal.getByRole('button', { name: '创建分享' }).click()
  await expect(modal.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await modal.getByRole('button', { name: '复制', exact: true }).last().click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(
    /^Contract project-V1：http:\/\/127\.0\.0\.1:5187\/tools\/share\/[^\n]+\n密码：private-share$/,
  )
})
test('public preview has no management credentials, menus or user requests', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/')) {
      requests.push(req.url())
      expect(req.headers()['x-access-token']).toBeUndefined()
    }
  })
  await page.goto('share/open')
  await expect(page.locator('iframe')).toBeVisible()
  expect(requests.some((url) => /\/menu\/|\/user\/detail|\/authorize\/me/.test(url))).toBe(false)
  await expect(page.locator('.desktop-nav')).toHaveCount(0)
})
test('share password, expired, disabled and missing states', async ({ page }) => {
  await page.goto('share/locked')
  await page.getByLabel('分享密码', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: '打开原型' }).click()
  await expect(page.getByText('Invalid share password')).toBeVisible()
  await page.getByLabel('分享密码', { exact: true }).fill('test-share-password')
  await page.getByRole('button', { name: '打开原型' }).click()
  await expect(page.locator('iframe')).toBeVisible()
  for (const token of ['expired', 'disabled', 'missing']) {
    await page.goto(`share/${token}`)
    await expect(page.getByText('Share unavailable')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  }
})
test('page hierarchy, nav collapse, Inspect, highlight and copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('share/open')
  await expect(page.getByText('Folder', { exact: true })).toBeVisible()
  await expect(page.getByText('Child page', { exact: true })).toBeVisible()
  await page.getByText('Child page', { exact: true }).click()
  await expect(page.locator('iframe')).toHaveAttribute('src', /child\.html$/)
  const before = await page.locator('iframe').boundingBox()
  await page.getByRole('button', { name: '隐藏页面目录' }).click()
  const after = await page.locator('iframe').boundingBox()
  expect(after!.width).toBeGreaterThan(before!.width)
  await page.getByText('检查', { exact: true }).click()
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: 'Contract element' }).hover()
  await expect(frame.locator('#overlay')).toBeVisible()
  await frame.getByRole('button', { name: 'Contract element' }).click()
  await expect(page.getByText('BUTTON#u1', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await expect(page.locator('pre')).toContainText('border-radius: 6px')
  await page.getByRole('button', { name: '复制', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('width: 160px')
  await page.getByRole('tab', { name: 'HTML', exact: true }).click()
  await expect(
    page.getByRole('tabpanel', { name: 'HTML', exact: true }).locator('pre'),
  ).toContainText('<button')
  await page.getByRole('tab', { name: '图片与 SVG' }).click()
  await expect(page.locator('.inspect-image')).toBeVisible()
})
test('standalone preview skips menus and opens through a new window', async ({ page }) => {
  await login(page)
  await page.goto('protohub/projects/p1')
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const popup = await popupPromise
  const requests: string[] = []
  popup.on('request', (request) => requests.push(request.url()))
  await expect(popup.locator('iframe')).toBeVisible()
  await expect(popup.locator('.desktop-nav')).toHaveCount(0)
  expect(requests.some((url) => url.includes('/menu/'))).toBe(false)
})
test('member cannot access management or mutate a project', async ({ page }) => {
  await login(page, 'member')
  await expect(page.getByRole('button', { name: '新建项目' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '用户管理' })).toHaveCount(0)
  await page.goto('system/user')
  await expect(page.getByText('页面不存在', { exact: true })).toBeVisible()
})
test('user forms preserve associations, status safeguards and confirmed password resets', async ({
  page,
}) => {
  test.setTimeout(90000)
  await login(page)
  await page.goto('system/user')
  const admin = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Admin', exact: true }) })
  await expect(admin.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('基本信息', { exact: true })).toBeVisible()
  await modal.getByLabel('姓名', { exact: true }).fill('New user')
  await modal.getByLabel('用户名', { exact: true }).fill('new-user')
  await modal.getByLabel('密码', { exact: true }).fill('Newuser12345')
  await modal.getByLabel('确认密码', { exact: true }).fill('Newuser12345')
  await modal.getByLabel('角色', { exact: true }).click()
  await page.locator('.ant-select-tree-switcher').first().click()
  await page
    .locator('.ant-select-tree-title')
    .filter({ hasText: /^Administrator$/ })
    .click()
  const create = page.waitForRequest((request) => request.url().endsWith('/user/detail/_create'))
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await create).postDataJSON()).toMatchObject({
    user: { username: 'new-user', name: 'New user' },
    roleIdList: ['ADMIN'],
    positions: [],
  })
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'New user', exact: true }) })
  await expect(row.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  await row.getByRole('button', { name: '禁用', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(row.getByRole('button', { name: '启用', exact: true })).toBeVisible()
  await row.getByRole('button', { name: '重置密码', exact: true }).click()
  await modal.getByLabel('密码', { exact: true }).fill('Resetpass12345')
  await modal.getByLabel('确认密码', { exact: true }).fill('Resetpass12345')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(modal.getByLabel('用户名', { exact: true })).toBeDisabled()
  await modal.getByLabel('姓名', { exact: true }).fill('Edited user')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Edited user', exact: true })).toBeVisible()
})
test('related role creation survives popup navigation and returns its generated ID to the user form', async ({
  page,
}) => {
  test.setTimeout(90000)
  await login(page)
  await page.goto('system/user')
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('姓名', { exact: true }).fill('Related user')
  await modal.getByLabel('用户名', { exact: true }).fill('related-user')
  await modal.getByLabel('密码', { exact: true }).fill('Relateduser123')
  await modal.getByLabel('确认密码', { exact: true }).fill('Relateduser123')
  const popupPromise = page.waitForEvent('popup')
  await modal.getByRole('button', { name: '新增角色管理', exact: true }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/system\/Role\?save=true&sourceId=related_/)
  const roleForm = popup.getByRole('dialog')
  await expect(roleForm.getByLabel('名称', { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(roleForm.locator('.ant-select-selection-item')).toHaveText('默认')
  await roleForm.getByLabel('名称', { exact: true }).fill('Popup role')
  const created = popup.waitForRequest(
    (request) => request.url().endsWith('/role') && request.method() === 'POST',
  )
  const parentRoles = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/role/_query/no-paging') &&
      response.request().method() === 'GET',
  )
  const closed = popup.waitForEvent('close')
  await roleForm.getByRole('button', { name: '保存', exact: true }).click()
  const request = await created
  expect(request.postDataJSON()).toMatchObject({
    name: 'Popup role',
    groupId: 'default_group',
  })
  expect(request.postDataJSON()).not.toHaveProperty('id')
  await closed
  const refreshedRoles = (await (await parentRoles).json()).result as {
    id: string
    name: string
  }[]
  const createdRole = refreshedRoles.find((role) => role.name === 'Popup role')
  expect(createdRole).toMatchObject({ id: expect.any(String), name: 'Popup role' })
  await expect(modal.locator('.ant-tag').filter({ hasText: /^Popup role$/ })).toBeVisible()
  const userCreated = page.waitForRequest((request) =>
    request.url().endsWith('/user/detail/_create'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await userCreated).postDataJSON()).toMatchObject({ roleIdList: [createdRole!.id] })
  await expect(page.getByRole('cell', { name: 'Related user', exact: true })).toBeVisible()
})
test('role creation opens the permission matrix and supports member selection and batch unbinding', async ({
  page,
}) => {
  test.setTimeout(90000)
  await login(page)
  await page.goto('system/Role')
  await expect(page.locator('.role-sidebar').getByText('全局角色', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByLabel('角色标识', { exact: true })).toHaveCount(0)
  await modal.getByLabel('名称', { exact: true }).fill('Test role')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  const drawer = page.locator('.ant-drawer-body').last()
  await expect(drawer.getByRole('tab', { name: '权限设置', exact: true })).toBeVisible()
  await expect(drawer.getByRole('checkbox', { name: '个人中心', exact: true })).toBeDisabled()
  await drawer.getByRole('checkbox', { name: '全选', exact: true }).uncheck()
  await expect(drawer.getByRole('checkbox', { name: '查看', exact: true })).toBeChecked()
  const grantRow = drawer
    .getByRole('row')
    .filter({ has: page.getByRole('checkbox', { name: '用户管理', exact: true }) })
  await grantRow.getByRole('checkbox', { name: 'view', exact: true }).check()
  await grantRow.getByRole('radio', { name: '全部数据', exact: true }).check()
  const grant = page.waitForRequest(
    (request) => request.url().endsWith('/_grant') && request.method() === 'PUT',
  )
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  const payload = (await grant).postDataJSON()
  expect(payload.menus.find((menu: { code: string }) => menu.code === 'system/User')).toMatchObject(
    {
      granted: true,
      assetAccesses: [
        { supportId: 'creator', granted: false },
        { supportId: 'all', granted: true },
      ],
    },
  )
  await drawer.getByRole('tab', { name: '用户分配', exact: true }).click()
  await drawer.getByRole('button', { name: '新增', exact: true }).click()
  await expect(modal.getByRole('cell', { name: 'admin', exact: true })).toHaveCount(0)
  await modal
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Operator', exact: true }) })
    .getByRole('checkbox')
    .check()
  await modal.getByRole('button', { name: '确定', exact: true }).click()
  await expect(drawer.getByRole('cell', { name: 'Operator', exact: true })).toBeVisible()
  await drawer
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Operator', exact: true }) })
    .getByRole('checkbox')
    .check()
  await drawer.getByRole('button', { name: '批量解绑', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(drawer.getByRole('cell', { name: 'Operator', exact: true })).toHaveCount(0)
})
test('permission resources edit action rows and enforce enabled deletion safeguards', async ({
  page,
}) => {
  test.setTimeout(90000)
  await login(page)
  await page.goto('system/Permission')
  const initial = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'prototype-hub-project', exact: true }) })
  await expect(initial.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('标识', { exact: true }).fill('test-resource')
  await modal.getByLabel('名称', { exact: true }).fill('Test resource')
  await expect(modal.locator('tbody tr.ant-table-row')).toHaveCount(3)
  await expect(modal.locator('tbody input').first()).toHaveValue('query')
  await modal.getByRole('button', { name: '添加操作权限', exact: true }).click()
  const last = modal.locator('tbody tr.ant-table-row').last()
  await last.locator('input').nth(0).fill('publish')
  await last.locator('input').nth(1).fill('Publish')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'test-resource', exact: true }) })
  await expect(row.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  await row.getByRole('button', { name: '禁用', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(row.getByRole('button', { name: '删除', exact: true })).toBeEnabled()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(modal.getByLabel('标识', { exact: true })).toBeDisabled()
  await expect(modal.locator('tbody tr.ant-table-row')).toHaveCount(4)
  await modal.getByLabel('名称', { exact: true }).fill('Edited resource')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Edited resource', exact: true })).toBeVisible()
})
test('legacy hash links and expired session recover consistently', async ({ page }) => {
  await page.goto('./#/share/open')
  await expect(page.locator('iframe')).toBeVisible()
  await page.goto('login')
  await page.evaluate(() => localStorage.setItem('proto-bridge-ui:token', 'expired'))
  await page.goto('protohub/projects')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})
test('desktop and narrow public preview remain operable', async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('share/open')
    await expect(page.locator('iframe')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`share-${viewport.width}.png`),
      fullPage: true,
    })
    if (viewport.width < 760) {
      await page.getByRole('button', { name: '显示页面目录' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByText('Child page', { exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
      await page.getByText('检查', { exact: true }).click()
      await page.frameLocator('iframe').getByRole('button', { name: 'Contract element' }).click()
      await expect(page.getByText('BUTTON#u1', { exact: true })).toBeVisible()
      await page
        .locator('.ant-drawer-content-wrapper')
        .last()
        .evaluate(async (element) => {
          element.getBoundingClientRect()
          await Promise.all(
            element
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => {})),
          )
        })
      await page.screenshot({ path: testInfo.outputPath('inspect-mobile.png') })
    }
  }
})
