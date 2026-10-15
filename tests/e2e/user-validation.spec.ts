import { expect, test, type Page, type Locator } from '@playwright/test'
import { login } from './system-helpers'
const passwordRule = '密码须为 12 至 128 个字符，不能全部为空白'
async function addUser(page: Page): Promise<Locator> {
  await login(page)
  await page.goto('system/user')
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('姓名', { exact: true }).fill('Validation user')
  await modal.getByLabel('用户名', { exact: true }).fill('中文用户名')
  await modal.getByLabel('角色', { exact: true }).click()
  await page.locator('.ant-select-tree-switcher').first().click()
  await page
    .locator('.ant-select-tree-title')
    .filter({ hasText: /^Administrator$/ })
    .click()
  return modal
}
async function passwords(modal: Locator, password: string, confirmation = password) {
  await modal.getByLabel('密码', { exact: true }).fill(password)
  await modal.getByLabel('确认密码', { exact: true }).fill(confirmation)
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('user creation blocks local invalid passwords and preserves a valid 128-character raw password with empty optional contacts', async ({
  page,
}) => {
  const validations: { path: string; body: string | null }[] = [],
    creates: unknown[] = []
  page.on('request', (request) => {
    if (/\/user\/(username|password)\/_validate$/.test(new URL(request.url()).pathname)) {
      expect(request.method()).toBe('POST')
      expect(request.headers()['content-type']).toContain('text/plain')
      validations.push({ path: new URL(request.url()).pathname, body: request.postData() })
    }
    if (request.url().endsWith('/user/detail/_create')) creates.push(request.postDataJSON())
  })
  const modal = await addUser(page)
  await modal.getByLabel('姓名', { exact: true }).fill('名'.repeat(100))
  await modal.getByLabel('联系电话', { exact: true }).fill('')
  await modal.getByLabel('电子邮箱', { exact: true }).fill('')
  await passwords(modal, 'Newuser123')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    modal.locator('.ant-form-item-explain-error').filter({ hasText: passwordRule }),
  ).toBeVisible()
  expect(validations).toEqual([])
  expect(creates).toEqual([])
  await passwords(modal, 'abcdefghijkl', 'different password')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByText('两次输入的密码不一致', { exact: true })).toBeVisible()
  expect(validations).toEqual([])
  const password = ` ${'a'.repeat(126)} `
  await passwords(modal, password)
  const created = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/user/detail/_create'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  const payload = (await created).postDataJSON()
  expect(payload).toMatchObject({
    user: { username: '中文用户名', name: '名'.repeat(100), password },
    roleIdList: ['ADMIN'],
    orgIdList: [],
    positions: [],
  })
  expect([undefined, '']).toContain(payload.user.telephone)
  expect([undefined, '']).toContain(payload.user.email)
  expect(validations).toEqual([
    { path: '/api/user/username/_validate', body: '中文用户名' },
    { path: '/api/user/password/_validate', body: password },
  ])
  await expect(modal).not.toBeVisible()
  await expect(page.getByRole('cell', { name: '名'.repeat(100), exact: true })).toBeVisible()
})

test('user validation distinguishes a missing username reason and retains a server password reason before a successful retry', async ({
  page,
}) => {
  let rejection: 'username' | 'password' | undefined = 'username'
  const reason = 'This password was rejected by the server'
  await page.route('**/api/user/username/_validate', async (route) => {
    expect(route.request().postData()).toBe('中文用户名')
    await route.fulfill({
      json: { success: true, status: 200, result: { passed: rejection !== 'username' } },
    })
  })
  await page.route('**/api/user/password/_validate', async (route) => {
    expect(route.request().postData()).toBe('abcdefghijkl')
    await route.fulfill({
      json: {
        success: true,
        status: 200,
        result: rejection === 'password' ? { passed: false, reason } : { passed: true },
      },
    })
  })
  const creates: unknown[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/user/detail/_create')) creates.push(request.postDataJSON())
  })
  const modal = await addUser(page)
  await passwords(modal, 'abcdefghijkl')
  await modal.getByLabel('联系电话', { exact: true }).fill('+44 (0)20 1234 5678')
  const email = `person@${'a'.repeat(45)}.${'b'.repeat(30)}.com`
  await modal.getByLabel('电子邮箱', { exact: true }).fill(email)
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByText('用户名已存在或不可用，请更换用户名', { exact: true })).toBeVisible()
  await expect(modal.getByText('输入内容无效', { exact: true })).toHaveCount(0)
  expect(creates).toEqual([])
  rejection = 'password'
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByText(reason, { exact: true })).toBeVisible()
  expect(creates).toEqual([])
  rejection = undefined
  const created = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/user/detail/_create'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await created).postDataJSON()).toMatchObject({
    user: {
      username: '中文用户名',
      password: 'abcdefghijkl',
      telephone: '+44 (0)20 1234 5678',
      email,
    },
    roleIdList: ['ADMIN'],
  })
  await expect(modal).not.toBeVisible()
  await expect(page.getByRole('cell', { name: 'Validation user', exact: true })).toBeVisible()
})
