import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { ReviewGuest } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
async function enable(page: Page, request: APIRequestContext, allowUnverified = true) {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, {
    headers: { 'X-Access-Token': 'mock-admin' },
  })
  const share = (await response.json()).result.find(
    (row: { token: string }) => row.token === 'open',
  )
  const update = await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers: { 'X-Access-Token': 'mock-admin' },
    data: { enabled: true, allowUnverified, expectedVersion: share.configVersion },
  })
  expect(update.ok()).toBe(true)
}
async function openIdentity(page: Page, locale: 'zh' | 'en' = 'zh') {
  await page.goto('share/open')
  const text = protoLocales[locale]
  await page.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
  return page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('name-only identity is an explicit opt-in and never sends mail, recovers by name, or leaks credentials to the prototype', async ({
  page,
  request,
}, testInfo) => {
  await enable(page, request)
  const requests: { url: string; headers: Record<string, string> }[] = []
  page.on('request', (outgoing) =>
    requests.push({ url: outgoing.url(), headers: outgoing.headers() }),
  )
  const drawer = await openIdentity(page)
  await expect(drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true })).toBeVisible()
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewUseUnverified, exact: true })
    .click()
  await expect(drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true })).toHaveCount(0)
  await expect(
    drawer.getByText(protoLocales.zh.reviewUnverifiedHint, { exact: true }),
  ).toBeVisible()
  await drawer.getByLabel(protoLocales.zh.reviewName, { exact: true }).fill('Self declared visitor')
  await drawer
    .getByLabel(protoLocales.zh.reviewCompany, { exact: true })
    .fill('Self declared company')
  const creating = page.waitForResponse((response) => response.url().endsWith('/review/unverified'))
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewCreateUnverified, exact: true })
    .click()
  const response = await creating
  const payload = response.request().postDataJSON()
  expect(Object.keys(payload).sort()).toEqual(['accessKey', 'company', 'displayName', 'revisionId'])
  expect(payload).toMatchObject({
    displayName: 'Self declared visitor',
    company: 'Self declared company',
  })
  const first = (await response.json()).result.session
  expect(first).toMatchObject({ verificationLevel: 'unverified', maskedEmail: null })
  expect(first.expiresAt - Date.now()).toBeLessThanOrEqual(8 * 3600000)
  await expect(drawer.getByText(protoLocales.zh.reviewUnverified, { exact: true })).toBeVisible()
  await expect(drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true })).toHaveCount(
    0,
  )
  await page.screenshot({
    path: testInfo.outputPath('unverified-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  const reopening = page.waitForResponse((result) => result.url().endsWith('/review/context'))
  await page.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  expect((await (await reopening).json()).result.session).toEqual(first)
  await drawer.getByRole('button', { name: protoLocales.zh.reviewLogout, exact: true }).click()
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewUseUnverified, exact: true })
    .click()
  await drawer.getByLabel(protoLocales.zh.reviewName, { exact: true }).fill('Self declared visitor')
  const creatingAnother = page.waitForResponse((result) =>
    result.url().endsWith('/review/unverified'),
  )
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewCreateUnverified, exact: true })
    .click()
  expect((await (await creatingAnother).json()).result.session.guestId).not.toBe(first.guestId)
  expect(requests.some((item) => /\/review\/(challenges|verify)$/.test(item.url))).toBe(false)
  for (const item of requests.filter((entry) => entry.url.includes('/review/')))
    expect(item.headers['x-access-token']).toBeUndefined()
  for (const item of requests.filter((entry) => entry.url.includes('/runtime/'))) {
    expect(item.headers['x-review-csrf']).toBeUndefined()
    expect(item.headers.cookie || '').not.toContain('mock-review')
  }
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
})

for (const locale of ['zh', 'en'] as const) {
  test(`390px ${locale} requires a keyboard choice after mail unavailability and keeps unverified form within the viewport`, async ({
    page,
    request,
  }, testInfo) => {
    await enable(page, request)
    if (locale === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/review/context', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.result.mailAvailable = false
      await route.fulfill({ response, json: body })
    })
    const text = protoLocales[locale]
    const drawer = await openIdentity(page, locale)
    await expect(drawer.getByText(text.reviewMailUnavailable, { exact: true })).toBeVisible()
    await expect(drawer.getByLabel(text.reviewName, { exact: true })).toHaveCount(0)
    const choice = drawer.getByRole('button', { name: text.reviewUseUnverified, exact: true })
    await choice.focus()
    await page.keyboard.press('Enter')
    const name = drawer.getByLabel(text.reviewName, { exact: true })
    await expect(name).toBeVisible()
    await name.fill('Visitor')
    await name.press('Tab')
    await expect(drawer.getByLabel(text.reviewCompany, { exact: true })).toBeFocused()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
    const create = drawer.getByRole('button', { name: text.reviewCreateUnverified, exact: true })
    await expect
      .poll(async () => {
        const bounds = await create.boundingBox()
        return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390
      })
      .toBe(true)
    await create.focus()
    await page.keyboard.press('Enter')
    await expect(drawer.getByText(text.reviewUnverified, { exact: true })).toBeVisible()
    await expect(drawer.getByText(text.reviewUnverifiedHint, { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`unverified-${locale}-390.png`),
      animations: 'disabled',
      fullPage: true,
    })
  })
}

test('unverified management is a separate page mode, shows fixed expiry and cannot enable an expired identity', async ({
  page,
}) => {
  const row: ReviewGuest = {
    id: 'low-guest',
    displayName: 'Self declared visitor',
    company: 'Self declared company',
    maskedEmail: null,
    verificationLevel: 'unverified',
    enabled: false,
    configVersion: 3,
    createTime: 1,
    modifyTime: 2,
    expiresAt: Date.now() + 8 * 3600000,
  }
  const expired = {
    ...row,
    id: 'expired-low',
    displayName: 'Expired visitor',
    expiresAt: Date.now() - 1000,
  }
  const pages: unknown[] = []
  const updates: { url: string; body: unknown }[] = []
  await page.route('**/api/prototype-hub/projects/p1/review-guests/**', async (route) => {
    const outgoing = route.request(),
      body = outgoing.postDataJSON()
    if (outgoing.method() === 'POST') {
      pages.push(body)
      await route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            data: body.verificationLevel === 'unverified' ? [row, expired] : [],
            total: body.verificationLevel === 'unverified' ? 2 : 0,
            pageIndex: body.pageIndex,
            pageSize: body.pageSize,
          },
        },
      })
    } else {
      updates.push({ url: outgoing.url(), body })
      row.enabled = body.enabled
      row.configVersion++
      await route.fulfill({ json: { success: true, status: 200, result: row } })
    }
  })
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: protoLocales.zh.reviewGuests, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: protoLocales.zh.reviewGuests, exact: true })
  // Ant Select names the visible wrapper; choose an option rather than filling its hidden search input.
  await drawer.locator('.ant-select').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .filter({ hasText: protoLocales.zh.reviewUnverified })
    .click()
  await expect(drawer.getByText(row.displayName, { exact: true })).toBeVisible()
  await expect(
    drawer.getByText(protoLocales.zh.reviewUnverifiedGuestsHint, { exact: true }),
  ).toBeVisible()
  const expiredItem = drawer.locator('.ant-list-item').filter({ hasText: 'Expired visitor' })
  await expect(
    expiredItem.getByRole('button', { name: protoLocales.zh.reviewGuestEnable, exact: true }),
  ).toBeDisabled()
  const current = drawer.locator('.ant-list-item').filter({ hasText: row.displayName })
  await current
    .getByRole('button', { name: protoLocales.zh.reviewGuestEnable, exact: true })
    .click()
  await expect(
    drawer.getByText(protoLocales.zh.reviewUnverifiedEnableConfirm, { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.reviewUnverifiedGuestUpdated, { exact: true }),
  ).toBeVisible()
  expect(updates).toEqual([
    {
      url: `${origin}/api/prototype-hub/projects/p1/review-guests/low-guest/enabled?verificationLevel=unverified`,
      body: { enabled: true, expectedVersion: 3 },
    },
  ])
  expect(pages).toEqual([
    { pageIndex: 0, pageSize: 20 },
    { pageIndex: 0, pageSize: 20, verificationLevel: 'unverified' },
    { pageIndex: 0, pageSize: 20, verificationLevel: 'unverified' },
  ])
})
