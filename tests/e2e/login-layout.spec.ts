import { expect, test, type Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expectDefaultBrandingAsset } from './branding-helpers'

const defaultBackground = readFileSync(
  'src/modules/authentication-manager-ui/assets/login/login.svg',
  'utf8',
)
const defaultBackgroundWidth = Number(defaultBackground.match(/width="(\d+)"/)?.[1])

async function bounds(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  if (!box) throw new Error('Visible login element has no bounds')
  return box
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('login uses a full-height right panel and keeps configured filing details responsive', async ({
  page,
}, testInfo) => {
  let configured = false
  let ssoDiscoveryRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/application/sso/_all')) ssoDiscoveryRequests += 1
  })
  const background = '/api/prototype-hub/public/login-layout-background.svg'
  const logo = '/api/prototype-hub/public/login-layout-logo.svg'
  await page.route('**/api/system/config/front', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: configured
          ? {
              title: 'Configured platform',
              background,
              logo,
              copyright: 'Copyright layout fixture',
              showRecordNumber: true,
              recordNumber: '沪ICP备12345678号',
              policeRecordNumber: '沪公网安备 31010402009999 号',
            }
          : { title: 'Default platform' },
      },
    }),
  )
  await page.route(`**${background}`, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1080"><rect width="1400" height="1080" fill="#e6f4ff"/></svg>',
    }),
  )
  await page.route(`**${logo}`, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><rect width="96" height="48" fill="#1677ff"/></svg>',
    }),
  )

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    configured = viewport.width === 1920
    await page.setViewportSize(viewport)
    await page.goto('login')
    await expect(
      page.getByRole('heading', { name: configured ? 'Configured platform' : 'Default platform' }),
    ).toBeVisible()
    const picture = page.locator('.login-visual img')
    await expect
      .poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBe(configured ? 1400 : defaultBackgroundWidth)
    const visual = await bounds(page.locator('.login-visual'))
    const image = await bounds(picture)
    const panel = await bounds(page.locator('.login-panel'))
    const username = await bounds(page.getByLabel('用户名', { exact: true }))
    const submit = await bounds(page.getByRole('button', { name: '登录', exact: true }))
    expect(panel.y).toBe(0)
    expect(panel.height).toBeGreaterThanOrEqual(viewport.height)
    expect(Math.abs(panel.width - Math.max(400, viewport.width * 0.27))).toBeLessThan(2)
    expect(Math.abs(panel.x + panel.width - viewport.width)).toBeLessThan(2)
    expect(Math.abs(visual.x + visual.width - panel.x)).toBeLessThan(2)
    expect(Math.abs(visual.height - panel.height)).toBeLessThan(2)
    expect(image).toEqual(visual)
    expect(username.x).toBeGreaterThan(panel.x)
    expect(submit.x + submit.width).toBeLessThan(panel.x + panel.width)
    expect(
      await page
        .locator('.login-panel')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe('rgb(255, 255, 255)')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    if (configured) {
      await expect(picture).toHaveAttribute('src', background)
      await expect(
        page.getByRole('img', { name: 'Configured platform', exact: true }),
      ).toHaveAttribute('src', logo)
      await expect(page.locator('.login-footer')).toContainText('Copyright layout fixture')
      const icp = page.getByRole('link', { name: '沪ICP备12345678号', exact: true })
      await expect(icp).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
      await expect(icp).toHaveAttribute('target', '_blank')
      await expect(icp).toHaveAttribute('rel', 'noopener noreferrer')
      const police = page.getByRole('link', {
        name: '沪公网安备 31010402009999 号',
        exact: true,
      })
      await expect(police).toHaveAttribute(
        'href',
        'https://beian.mps.gov.cn/#/query/webSearch?code=31010402009999',
      )
      await expect(police).toHaveAttribute('target', '_blank')
      await expect(police).toHaveAttribute('rel', 'noopener noreferrer')
      await expect(police.locator('img')).toHaveCount(0)
    } else {
      await expectDefaultBrandingAsset(picture, 'background')
      await expectDefaultBrandingAsset(page.locator('.login-brand img'), 'logo')
      await expectDefaultBrandingAsset(page.locator('link[rel="icon"]'), 'ico', 'href')
      await expect(page.locator('.login-filings a')).toHaveCount(0)
    }
    await page.screenshot({
      path: testInfo.outputPath(`login-layout-${configured ? 'configured' : 'fallback'}.png`),
      animations: 'disabled',
      fullPage: true,
    })
  }

  await page.setViewportSize({ width: 390, height: 620 })
  await page.goto('login')
  await expect(
    page.getByRole('link', { name: '沪公网安备 31010402009999 号', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  expect(ssoDiscoveryRequests).toBe(0)
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Configured platform', exact: true }),
  ).toBeVisible()
})

test('narrow login keeps captcha after the input and supports preparation retry and sign in without overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 620 })
  let configurationRequests = 0
  let captchaRequests = 0
  const captchaImage = `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="#e6f4ff"/><text x="20" y="29" font-size="24">A1B2C</text></svg>',
  ).toString('base64')}`
  await page.route('**/api/authorize/login/configs', (route) => {
    configurationRequests++
    return route.fulfill(
      configurationRequests === 1
        ? {
            status: 503,
            json: { success: false, status: 503, message: 'Login configuration unavailable' },
          }
        : { json: { success: true, status: 200, result: { encrypt: { enabled: false } } } },
    )
  })
  await page.route('**/api/authorize/captcha/config', (route) =>
    route.fulfill({ json: { success: true, status: 200, result: { enabled: true } } }),
  )
  await page.route('**/api/authorize/captcha/image?*', (route) => {
    const requestUrl = new URL(route.request().url())
    expect(requestUrl.searchParams.get('width')).toBe('160')
    expect(requestUrl.searchParams.get('height')).toBe('40')
    return route.fulfill({
      json: {
        success: true,
        status: 200,
        result: { key: `layout-captcha-${++captchaRequests}`, base64: captchaImage },
      },
    })
  })
  await page.goto('login')
  await expect(page.locator('.login-error')).toContainText('Login configuration unavailable')
  await expect(page.locator('.login-visual')).not.toBeVisible()
  const panel = await bounds(page.locator('.login-panel'))
  expect(panel.x).toBe(0)
  expect(panel.width).toBe(390)
  expect(panel.height).toBeGreaterThanOrEqual(620)
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.login-error')).toHaveCount(0)
  await expect(page.getByLabel('用户名', { exact: true })).toHaveValue('admin')
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('test-login-password')
  const code = page.getByLabel('验证码', { exact: true })
  const picture = page.locator('.captcha-control img')
  await expect(picture).toBeVisible()
  const inputBox = await bounds(code)
  const imageBox = await bounds(picture)
  expect(imageBox.x).toBeGreaterThan(inputBox.x + inputBox.width)
  expect(Math.abs(imageBox.y - inputBox.y)).toBeLessThan(2)
  expect(imageBox.width).toBe(160)
  expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('login-layout-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await page.setViewportSize({ width: 320, height: 620 })
  const compactControlBox = await bounds(page.locator('.captcha-control'))
  const compactInputBox = await bounds(code)
  const compactImageBox = await bounds(picture)
  expect(compactInputBox.width).toBeGreaterThan(0)
  expect(compactImageBox.x).toBeGreaterThanOrEqual(compactControlBox.x)
  expect(compactImageBox.x + compactImageBox.width).toBeLessThanOrEqual(
    compactControlBox.x + compactControlBox.width,
  )
  expect(compactControlBox.x + compactControlBox.width).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 620 })
  await page.locator('.captcha-control').getByRole('button', { name: '刷新', exact: true }).click()
  await expect.poll(() => captchaRequests).toBe(2)
  await code.fill('A1B2C')
  const submitted = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/authorize/login'),
  )
  await page.getByRole('button', { name: '登录', exact: true }).click()
  expect((await submitted).postDataJSON()).toEqual({
    username: 'admin',
    password: 'test-login-password',
    expires: 3600000,
    verifyCode: 'A1B2C',
    verifyKey: 'layout-captcha-2',
  })
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
})
