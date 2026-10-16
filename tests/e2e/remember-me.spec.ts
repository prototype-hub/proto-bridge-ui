import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const origin = 'http://127.0.0.1:5187'
const cookieName = 'proto-bridge-ui-remember-token'
async function signIn(page: Page, rememberMe: boolean, password = 'test-login-password') {
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('checkbox', { name: '记住我', exact: true }).setChecked(rememberMe)
  const submitted = page.waitForRequest((request) => request.url().endsWith('/authorize/login'))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  return (await submitted).postDataJSON()
}
async function rememberedCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === cookieName)
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('ordinary login retains its lifetime/storage policy and a failed remembered login stores no credential', async ({
  page,
  context,
}) => {
  await page.goto('login')
  await expect(page.getByRole('checkbox', { name: '记住我', exact: true })).not.toBeChecked()
  expect(await signIn(page, false)).toEqual({
    username: 'admin',
    password: 'test-login-password',
    expires: 3600000,
  })
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  expect(await rememberedCookie(context)).toBeUndefined()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBe(
    'mock-admin',
  )
  await page.locator('.pro-user').click()
  await page.getByRole('menuitem', { name: /退出$/ }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(await signIn(page, true, 'wrong')).toMatchObject({ expires: -1 })
  await expect(page.getByText('Invalid credentials')).toBeVisible()
  expect(await rememberedCookie(context)).toBeUndefined()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})

test('cookie-only browser reopening restores a verified session and keeps anonymous APIs free of credentials', async ({
  page,
  context,
  browser,
}, testInfo) => {
  await page.goto('login')
  expect(await signIn(page, true)).toEqual({
    username: 'admin',
    password: 'test-login-password',
    expires: -1,
  })
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  const cookie = await rememberedCookie(context)
  expect(cookie).toMatchObject({
    value: 'mock-admin',
    domain: '127.0.0.1',
    path: '/',
    sameSite: 'Lax',
    secure: false,
  })
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 399 * 86400)
  expect(cookie!.expires).toBeLessThanOrEqual(Date.now() / 1000 + 400 * 86400 + 2)
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
  const reopened = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    storageState: { cookies: [cookie!], origins: [] },
  })
  try {
    const restored = await reopened.newPage()
    const requests: { path: string; headers: Record<string, string> }[] = []
    await restored.route('**/api/**', async (route) => {
      requests.push({
        path: new URL(route.request().url()).pathname,
        headers: await route.request().allHeaders(),
      })
      await route.continue()
    })
    await restored.goto('login?redirect=/system/user')
    await expect(restored.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
    expect(
      requests.find((request) => request.path === '/api/user/detail')?.headers['x-access-token'],
    ).toBe('mock-admin')
    expect(await restored.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
    await restored.goto('share/open')
    await expect(restored.locator('iframe')).toBeVisible()
    const anonymous = requests.filter(
      (request) =>
        [
          '/api/system/config/front',
          '/api/authorize/login/configs',
          '/api/authorize/captcha/config',
        ].includes(request.path) ||
        /^\/api\/prototype-hub\/public\/shares\/open(?:\/[^/]+\/pages)?$/.test(request.path),
    )
    expect(anonymous.some((request) => request.path === '/api/authorize/login/configs')).toBe(true)
    expect(
      anonymous.some((request) => request.path.startsWith('/api/prototype-hub/public/shares/open')),
    ).toBe(true)
    for (const request of anonymous) {
      expect(request.headers.cookie).toBeUndefined()
      expect(request.headers['x-access-token']).toBeUndefined()
    }
    await restored.goto('./')
    await expect(restored.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
    await restored.locator('.pro-user').click()
    await restored.getByRole('menuitem', { name: /退出$/ }).click()
    await expect(restored.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    expect(await rememberedCookie(reopened)).toBeUndefined()
    await restored.reload()
    await expect(restored.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  } finally {
    await reopened.close()
  }
})

test('a current 401 removes the remembered cookie and legacy token instead of restoring it again', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: cookieName, value: 'revoked-token', url: origin, expires: Date.now() / 1000 + 86400 },
  ])
  await page.addInitScript(() => localStorage.setItem('X-Access-Token', 'old-legacy-token'))
  await page.route('**/api/user/detail', (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, status: 401, message: 'Remembered session revoked' },
    }),
  )
  await page.goto('login')
  await expect(page.getByText('Remembered session revoked')).toBeVisible()
  expect(await rememberedCookie(context)).toBeUndefined()
  expect(await page.evaluate(() => localStorage.getItem('X-Access-Token'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})

test('HTTPS remembers the token with the Secure cookie attribute', async ({ page, context }) => {
  const secureOrigin = 'https://remember.test'
  await page.route(`${secureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.goto(`${secureOrigin}/tools/login`)
  expect(await signIn(page, true)).toMatchObject({ expires: -1 })
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  expect(await rememberedCookie(context)).toMatchObject({
    domain: 'remember.test',
    path: '/',
    sameSite: 'Lax',
    secure: true,
  })
})
