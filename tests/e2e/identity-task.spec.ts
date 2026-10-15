import { expect, test } from '@playwright/test'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
test('captcha stays after its input and submits the latest captcha key without changing login DTO fields', async ({
  page,
}) => {
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 40
    const context = canvas.getContext('2d')!
    context.fillStyle = '#eef6ff'
    context.fillRect(0, 0, 120, 40)
    context.fillStyle = '#245b9a'
    context.font = '24px sans-serif'
    context.fillText('1234', 20, 29)
    return canvas.toDataURL('image/png')
  })
  let count = 0
  await page.route('**/api/authorize/captcha/config', (route) =>
    route.fulfill({ json: { success: true, status: 200, result: { enabled: true } } }),
  )
  await page.route('**/api/authorize/captcha/image?*', (route) =>
    route.fulfill({
      json: { success: true, status: 200, result: { key: `captcha-${++count}`, base64: image } },
    }),
  )
  await page.goto('login')
  const input = page.getByLabel('验证码', { exact: true }),
    picture = page.locator('.captcha-control img')
  await expect(picture).toBeVisible()
  await expect
    .poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(120)
  await expect
    .poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalHeight))
    .toBe(40)
  const inputBox = await input.boundingBox(),
    imageBox = await picture.boundingBox()
  expect(imageBox!.x).toBeGreaterThan(inputBox!.x + inputBox!.width)
  expect(Math.abs(imageBox!.y - inputBox!.y)).toBeLessThan(2)
  await page.screenshot({
    path: test.info().outputPath('system-slimming-login-captcha.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await page.locator('.captcha-control').getByRole('button', { name: '刷新', exact: true }).click()
  await expect.poll(() => count).toBe(2)
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await input.fill('1234')
  const login = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/authorize/login'),
  )
  await page.getByRole('button', { name: '登录', exact: true }).click()
  expect((await login).postDataJSON()).toMatchObject({
    username: 'admin',
    password: 'test-login-password',
    verifyCode: '1234',
    verifyKey: 'captcha-2',
    expires: 3600000,
  })
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
})
