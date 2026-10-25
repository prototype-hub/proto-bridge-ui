import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { Share, CreatedReviewInvitation } from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
async function enable(page: Page, request: APIRequestContext, token = 'open') {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await response.json()).result.find((row: Share) => row.token === token) as Share
  const update = await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers,
    data: { enabled: true, allowUnverified: true, expectedVersion: share.configVersion },
  })
  expect(update.ok()).toBe(true)
  return { ...share, configVersion: (await update.json()).result.configVersion }
}
async function create(
  request: APIRequestContext,
  share: Share,
  email = 'recipient@example.invalid',
) {
  const result = await request.post(
    `${origin}/api/prototype-hub/shares/${share.id}/review-invitations`,
    { headers, data: { email, expectedShareVersion: share.configVersion } },
  )
  expect(result.ok()).toBe(true)
  return (await result.json()).result as CreatedReviewInvitation
}
async function openInvitation(
  page: Page,
  token: string,
  locale: 'zh' | 'en' = 'zh',
  shareToken = 'open',
) {
  await page.goto(`share/${shareToken}#reviewInvitation=${token}`)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await page
    .getByRole('button', { name: protoLocales[locale].reviewInvitationUse, exact: true })
    .click()
  return page.getByRole('dialog', { name: protoLocales[locale].reviewIdentity, exact: true })
}
async function profile(
  page: Page,
  email = 'recipient@example.invalid',
  locale: 'zh' | 'en' = 'zh',
) {
  const drawer = page.getByRole('dialog', {
    name: protoLocales[locale].reviewIdentity,
    exact: true,
  })
  await drawer.getByLabel(protoLocales[locale].reviewEmail, { exact: true }).fill(email)
  await drawer.getByLabel(protoLocales[locale].reviewName, { exact: true }).fill('Recipient')
  return drawer
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('fixed-share managers create a single-copy invitation and its cleaned public link requires a fresh OTP before consumption', async ({
  page,
  request,
}, testInfo) => {
  const share = await enable(page, request)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  await page
    .locator('.ant-table-row')
    .filter({ hasText: 'Public review link' })
    .getByRole('button', { name: protoLocales.zh.reviewInvitations, exact: true })
    .click()
  const management = page.getByRole('dialog', {
    name: protoLocales.zh.reviewInvitations,
    exact: true,
  })
  await management
    .getByLabel(protoLocales.zh.reviewInvitationRecipient, { exact: true })
    .fill('recipient@example.invalid')
  const creating = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/review-invitations'),
  )
  await management
    .getByRole('button', { name: protoLocales.zh.reviewInvitationCreate, exact: true })
    .click()
  const created = await creating,
    result = (await created.json()).result as CreatedReviewInvitation
  expect(created.request().postDataJSON()).toEqual({
    email: 'recipient@example.invalid',
    expectedShareVersion: share.configVersion,
  })
  const link = `${origin}/tools/share/open#reviewInvitation=${result.invitationToken}`
  await expect(
    management.getByLabel(protoLocales.zh.reviewInvitationLink, { exact: true }),
  ).toHaveValue(link)
  await expect(management.getByText('r***@example.invalid', { exact: true })).toBeVisible()
  await management.getByRole('button', { name: '复制', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link)
  await page.screenshot({
    path: testInfo.outputPath('invitations-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  const outgoing: { url: string; headers: Record<string, string>; body: string }[] = []
  page.on('request', (request) =>
    outgoing.push({
      url: request.url(),
      headers: request.headers(),
      body: request.postData() || '',
    }),
  )
  await page.goto(link)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await page.getByRole('button', { name: protoLocales.zh.reviewInvitationUse, exact: true }).click()
  const drawer = await profile(page)
  await expect(
    drawer.getByText(protoLocales.zh.reviewInvitationRecipientHint, { exact: true }),
  ).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewUseUnverified, exact: true }),
  ).toHaveCount(0)
  const sending = page.waitForResponse((response) => response.url().endsWith('/review/challenges'))
  await drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).click()
  expect((await sending).request().postDataJSON().invitationToken).toBe(result.invitationToken)
  await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('111111')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewCodeInvalid, { exact: true })).toBeVisible()
  await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('123456')
  const verifying = page.waitForResponse((response) => response.url().endsWith('/review/verify'))
  await drawer.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  expect((await verifying).request().postDataJSON()).not.toHaveProperty('invitationToken')
  await expect(drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true })).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewInvitationAbandon, exact: true }),
  ).toHaveCount(0)
  const listed = await request.post(
    `${origin}/api/prototype-hub/shares/${share.id}/review-invitations/_query`,
    { headers, data: { pageIndex: 0, pageSize: 20 } },
  )
  expect((await listed.json()).result.data[0]).toMatchObject({
    status: 'consumed',
    maskedEmail: 'r***@example.invalid',
  })
  for (const item of outgoing) {
    expect(item.url).not.toContain(result.invitationToken)
    if (item.url.includes('/review/')) expect(item.headers['x-access-token']).toBeUndefined()
    if (item.url.includes('/runtime/')) {
      expect(item.headers['x-review-csrf']).toBeUndefined()
      expect(item.headers.cookie || '').not.toContain('mock-review')
      expect(item.body).not.toContain(result.invitationToken)
    }
  }
  const iframe = page.locator('.frame-stage > iframe')
  await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
  expect(await iframe.getAttribute('src')).not.toContain(result.invitationToken)
  const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))
  expect(storage).not.toContain(result.invitationToken)
})

test('wrong recipient and a forwarded invitation never fall back; only an explicit abandon restores ordinary choices', async ({
  page,
  request,
}) => {
  const share = await enable(page, request),
    created = await create(request, share)
  const drawer = await openInvitation(page, created.invitationToken)
  await profile(page, 'forwarded@example.invalid')
  const sending = page.waitForResponse((response) => response.url().endsWith('/review/challenges'))
  await drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).click()
  expect((await sending).status()).toBe(403)
  await expect(
    drawer.getByText(protoLocales.zh.reviewInvitationInvalid, { exact: true }),
  ).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewUseUnverified, exact: true }),
  ).toHaveCount(0)
  await expect(drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: protoLocales.zh.reviewInvitationUse, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.reviewInvitationRecipientHint, { exact: true }),
  ).toBeVisible()
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewInvitationAbandon, exact: true })
    .click()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewUseUnverified, exact: true }),
  ).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewInvitationAbandon, exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }),
  ).toBeVisible()
})

test('invalid fragment remains an explicit error, is cleaned before preview, and cannot silently send an ordinary OTP', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const sent: string[] = []
  page.on('request', (request) => {
    if (/\/review\/(challenges|verify|unverified)$/.test(request.url())) sent.push(request.url())
  })
  await page.goto(`${origin}/tools/#/share/open#reviewInvitation=invalid-token`)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await page.getByRole('button', { name: protoLocales.zh.reviewInvitationUse, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: protoLocales.zh.reviewIdentity, exact: true })
  await expect(page.locator('.frame-stage > iframe')).toBeVisible()
  await expect(
    drawer.getByText(protoLocales.zh.reviewInvitationInvalid, { exact: true }),
  ).toBeVisible()
  await profile(page)
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }),
  ).toBeDisabled()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewUseUnverified, exact: true }),
  ).toHaveCount(0)
  expect(sent).toEqual([])
})

test('an existing identity does not consume the invitation and requires explicit logout before fresh OTP', async ({
  page,
  request,
}) => {
  const share = await enable(page, request),
    created = await create(request, share)
  await page.goto('share/open')
  await page.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  let drawer = await profile(page, 'old@example.invalid')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).click()
  await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('123456')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true })).toBeVisible()
  const mutations: string[] = []
  page.on('request', (request) => {
    if (/\/review\/(challenges|verify|logout)$/.test(request.url())) mutations.push(request.url())
  })
  drawer = await openInvitation(page, created.invitationToken)
  await expect(
    drawer.getByText(protoLocales.zh.reviewInvitationLogoutFirst, { exact: true }),
  ).toBeVisible()
  expect(mutations).toEqual([])
  await drawer.getByRole('button', { name: protoLocales.zh.reviewLogout, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.reviewInvitationRecipientHint, { exact: true }),
  ).toBeVisible()
  await profile(page)
  const sending = page.waitForResponse((response) => response.url().endsWith('/review/challenges'))
  await drawer.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).click()
  expect((await sending).request().postDataJSON().invitationToken).toBe(created.invitationToken)
  await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('123456')
  await drawer.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  await expect(drawer.getByText('Recipient', { exact: true })).toBeVisible()
})

for (const locale of ['zh', 'en'] as const) {
  test(`390px ${locale} invitation controls stay in the viewport and support explicit keyboard verification`, async ({
    page,
    request,
  }, testInfo) => {
    const share = await enable(page, request),
      created = await create(request, share)
    if (locale === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    const text = protoLocales[locale],
      drawer = await openInvitation(page, created.invitationToken, locale)
    await expect(
      drawer.getByText(text.reviewInvitationRecipientHint, { exact: true }),
    ).toBeVisible()
    const email = drawer.getByLabel(text.reviewEmail, { exact: true })
    await email.fill('recipient@example.invalid')
    await email.press('Tab')
    await expect(drawer.getByLabel(text.reviewName, { exact: true })).toBeFocused()
    await drawer.getByLabel(text.reviewName, { exact: true }).fill('Recipient')
    const send = drawer.getByRole('button', { name: text.reviewSendCode, exact: true })
    await send.focus()
    await page.keyboard.press('Enter')
    await drawer.getByLabel(text.reviewCode, { exact: true }).fill('123456')
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
    const verify = drawer.getByRole('button', { name: text.reviewVerify, exact: true })
    await expect
      .poll(async () => {
        const bounds = await verify.boundingBox()
        return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390
      })
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`invitation-${locale}-390.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await verify.focus()
    await page.keyboard.press('Enter')
    await expect(drawer.getByText(text.reviewEmailVerified, { exact: true })).toBeVisible()
    await expect(
      drawer.getByRole('button', { name: text.reviewInvitationAbandon, exact: true }),
    ).toHaveCount(0)
  })
}
