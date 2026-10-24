import { expect, test, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
const origin = 'http://127.0.0.1:5187'
async function enable(
  page: Page,
  request: {
    get: (url: string, options?: object) => Promise<{ json: () => Promise<unknown> }>
    put: (url: string, options?: object) => Promise<unknown>
  },
) {
  await login(page)
  const body = (await (
    await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, {
      headers: { 'X-Access-Token': 'mock-admin' },
    })
  ).json()) as { result: { id: string; token: string; configVersion: number }[] }
  const share = body.result.find((row) => row.token === 'open')!
  await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers: { 'X-Access-Token': 'mock-admin' },
    data: { enabled: true, expectedVersion: share.configVersion },
  })
}
async function identity(page: Page) {
  await page.goto('share/open')
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
  await page.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: protoLocales.zh.reviewIdentity, exact: true })
  await expect(drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true })).toBeVisible()
  return drawer
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('share managers explicitly enable identity using current policy version and refresh the share list', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  await page
    .getByRole('button', { name: protoLocales.zh.reviewSettings, exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: protoLocales.zh.reviewSettings, exact: true })
  await expect(dialog.getByText(protoLocales.zh.reviewPolicyHint, { exact: true })).toBeVisible()
  const toggle = dialog.getByRole('switch', { name: protoLocales.zh.reviewEnable, exact: true })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  const saving = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().endsWith('/review'),
  )
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  const response = await saving
  expect(response.request().postDataJSON()).toEqual({ enabled: true, expectedVersion: 1 })
  expect((await response.json()).result).toMatchObject({ enabled: true, configVersion: 2 })
  await expect(dialog).toBeHidden()
})

test('trusted shell verifies a mailbox, recovers the cookie identity and signs out without leaking it to runtime', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const requests: { url: string; headers: Record<string, string> }[] = []
  page.on('request', (outgoing) =>
    requests.push({ url: outgoing.url(), headers: outgoing.headers() }),
  )
  const drawer = await identity(page)
  await drawer
    .getByLabel(protoLocales.zh.reviewEmail, { exact: true })
    .fill('visitor@example.invalid')
  await drawer.getByLabel(protoLocales.zh.reviewName, { exact: true }).fill('Visitor')
  await drawer
    .getByLabel(protoLocales.zh.reviewCompany, { exact: true })
    .fill('Self declared company')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewCodeSent, { exact: true })).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }),
  ).toBeDisabled()
  await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('111111')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewCodeInvalid, { exact: true })).toBeVisible()
  await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('123456')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true })).toBeVisible()
  await expect(drawer.getByText('Visitor', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: protoLocales.zh.reviewLogout, exact: true }).click()
  await expect(drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true })).toBeVisible()
  const review = requests.filter((item) => item.url.includes('/review/'))
  expect(review.length).toBeGreaterThan(4)
  for (const item of review) expect(item.headers['x-access-token']).toBeUndefined()
  for (const item of requests.filter((item) => item.url.includes('/runtime/'))) {
    expect(item.headers['x-review-csrf']).toBeUndefined()
    expect(item.headers.cookie || '').not.toContain('mock-review')
    expect(item.url).not.toContain('123456')
  }
})

test('unconfigured mail keeps preview usable without a send action', async ({ page, request }) => {
  await enable(page, request)
  await page.route('**/review/context', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.result.mailAvailable = false
    await route.fulfill({ response, json: body })
  })
  await page.goto('share/open')
  await page.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: protoLocales.zh.reviewIdentity, exact: true })
  await expect(
    drawer.getByText(protoLocales.zh.reviewMailUnavailable, { exact: true }),
  ).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
})

test('390px identity form remains within the trusted viewport and works by keyboard', async ({
  page,
  request,
}, testInfo) => {
  await enable(page, request)
  await page.setViewportSize({ width: 390, height: 844 })
  const drawer = await identity(page)
  const email = drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true })
  await expect
    .poll(async () => {
      const box = await email.boundingBox()
      return !!box && box.x >= 0 && box.x + box.width <= 390
    })
    .toBe(true)
  await email.fill('visitor@example.invalid')
  await email.press('Tab')
  await expect(drawer.getByLabel(protoLocales.zh.reviewName, { exact: true })).toBeFocused()
  await drawer.getByLabel(protoLocales.zh.reviewName, { exact: true }).fill('Visitor')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('review-identity-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
})
