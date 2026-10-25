import { expect, test, type APIRequestContext, type Page, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { ReviewThread, Share } from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
async function enable(page: Page, request: APIRequestContext) {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await response.json()).result.find((row: Share) => row.token === 'open') as Share
  const changed = await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers,
    data: {
      enabled: true,
      allowUnverified: true,
      allowComment: true,
      expectedVersion: share.configVersion,
    },
  })
  expect(changed.ok()).toBe(true)
}
async function feedback(page: Page, locale: 'zh' | 'en' = 'zh') {
  await page.getByRole('button', { name: protoLocales[locale].feedback, exact: true }).click()
  return page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
}
async function authenticate(
  page: Page,
  drawer: Locator,
  locale: 'zh' | 'en' = 'zh',
  email = false,
) {
  const text = protoLocales[locale]
  await drawer.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
  if (email)
    await identity.getByLabel(text.reviewEmail, { exact: true }).fill('visitor@example.invalid')
  else await identity.getByRole('button', { name: text.reviewUseUnverified, exact: true }).click()
  await identity.getByLabel(text.reviewName, { exact: true }).fill('Visitor')
  if (email) {
    await identity.getByRole('button', { name: text.reviewSendCode, exact: true }).click()
    await identity.getByLabel(text.reviewCode, { exact: true }).fill('123456')
    await identity.getByRole('button', { name: text.reviewVerify, exact: true }).click()
    await expect(identity.getByText(text.reviewEmailVerified, { exact: true })).toBeVisible()
  } else {
    await identity.getByRole('button', { name: text.reviewCreateUnverified, exact: true }).click()
    await expect(identity.getByText(text.reviewUnverified, { exact: true })).toBeVisible()
  }
  await identity.getByRole('button', { name: text.feedbackReturn, exact: true }).click()
  await expect(drawer).toBeVisible()
}
async function submit(page: Page, drawer: Locator, body: string, locale: 'zh' | 'en' = 'zh') {
  await drawer.locator('textarea#review-feedback-text').fill(body)
  const writing = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && /\/review\/threads$/.test(response.url()),
  )
  await drawer
    .getByRole('button', { name: protoLocales[locale].feedbackSubmit, exact: true })
    .click()
  const result = await writing
  expect(result.ok()).toBe(true)
  await expect(drawer.locator('.feedback-text').filter({ hasText: body })).toBeVisible()
  return (await result.json()).result as ReviewThread
}
async function pmStatus(
  request: APIRequestContext,
  thread: ReviewThread,
  state: 'open' | 'resolved',
) {
  const response = await request.put(
    `${origin}/api/prototype-hub/versions/v1/review-threads/${thread.id}/status`,
    {
      headers,
      data: {
        revisionId: thread.revisionId,
        pageId: thread.pageId,
        state,
        expectedVersion: thread.configVersion,
        clientRequestId: crypto.randomUUID(),
      },
    },
  )
  expect(response.ok()).toBe(true)
  return (await response.json()).result as ReviewThread
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('OTP round-trip preserves a selected-page draft without automatic submission or iframe credentials', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const sent: { url: string; headers: Record<string, string>; body: string }[] = []
  page.on('request', (outgoing) =>
    sent.push({
      url: outgoing.url(),
      headers: outgoing.headers(),
      body: outgoing.postData() || '',
    }),
  )
  await page.goto('share/open')
  const drawer = await feedback(page)
  await drawer.locator('textarea#review-feedback-text').fill('Private draft <b>plain text</b>')
  await authenticate(page, drawer, 'zh', true)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue(
    'Private draft <b>plain text</b>',
  )
  expect(sent.filter((item) => /\/review\/threads$/.test(item.url))).toHaveLength(0)
  const thread = await submit(page, drawer, 'Private draft <b>plain text</b>')
  await expect(drawer.locator('.feedback-text b')).toHaveCount(0)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await feedback(page)
  await expect(drawer.locator('.feedback-thread')).toHaveText(thread.summary)
  for (const item of sent.filter((item) => item.url.includes('/review/')))
    expect(item.headers['x-access-token']).toBeUndefined()
  for (const item of sent.filter((item) => item.url.includes('/runtime/'))) {
    expect(item.headers['x-review-csrf']).toBeUndefined()
    expect(item.headers.cookie || '').not.toContain('mock-review')
    expect(item.body).not.toContain('Private draft')
    expect(item.url).not.toMatch(/csrf|visitor|123456|Private/)
  }
  expect(await page.locator('.frame-stage > iframe').getAttribute('src')).not.toContain('Private')
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    'Private draft',
  )
})

test('PM explicitly writes private notes and public replies, while the visitor receives no internal content or count', async ({
  page,
  request,
}, testInfo) => {
  await enable(page, request)
  await page.goto('share/open')
  let drawer = await feedback(page)
  await authenticate(page, drawer)
  const thread = await submit(page, drawer, 'Customer question')
  await page.goto('preview/p1/v1')
  drawer = await feedback(page)
  await drawer.getByRole('button', { name: 'Customer question', exact: true }).click()
  await drawer
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackInternal })
    .click()
  await expect(
    drawer.getByRole('radio', { name: protoLocales.zh.feedbackInternal, exact: true }),
  ).toBeChecked()
  await drawer.locator('textarea#review-feedback-text').fill('Private PM note')
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(drawer.locator('.feedback-internal .feedback-text')).toHaveText('Private PM note')
  const query = { revisionId: thread.revisionId, pageId: thread.pageId, pageIndex: 0, pageSize: 20 }
  const afterInternal = await request.post(
    `${origin}/api/prototype-hub/versions/v1/review-threads/_query`,
    { headers, data: query },
  )
  expect((await afterInternal.json()).result.data[0]).toMatchObject({
    updatedAt: thread.updatedAt,
    configVersion: thread.configVersion,
    state: 'open',
  })
  await page.screenshot({
    path: testInfo.outputPath('feedback-pm-internal-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await drawer
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackPublic })
    .click()
  await drawer.locator('textarea#review-feedback-text').fill('Public PM answer')
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.locator('.feedback-text').filter({ hasText: 'Public PM answer' }),
  ).toBeVisible()
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackResolve, exact: true }).click()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackReopen, exact: true }),
  ).toBeVisible()
  await page.goto('share/open')
  drawer = await feedback(page)
  await drawer.getByRole('button', { name: 'Customer question', exact: true }).click()
  await expect(drawer.locator('.feedback-text')).toHaveText([
    'Customer question',
    'Public PM answer',
  ])
  await expect(drawer.getByText('Private PM note', { exact: true })).toHaveCount(0)
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackResolve, exact: true }),
  ).toHaveCount(0)
  const messages = page.waitForResponse((response) =>
    response.url().endsWith(`/threads/${thread.id}/messages/_query`),
  )
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  const publicResult = (await (await messages).json()).result
  expect(publicResult.total).toBe(2)
  expect(
    publicResult.data.every((message: { visibility: string }) => message.visibility === 'public'),
  ).toBe(true)
})

test('a visitor can reopen or reply to resolved feedback; a CAS conflict refreshes without retry and page switches clear its draft', async ({
  page,
  request,
}) => {
  await enable(page, request)
  await page.goto('share/open')
  const drawer = await feedback(page)
  await authenticate(page, drawer)
  const thread = await submit(page, drawer, 'State question')
  await pmStatus(request, thread, 'resolved')
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  const reopening = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/threads/${thread.id}/status`),
  )
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackReopen, exact: true }).click()
  const reopened = (await (await reopening).json()).result as ReviewThread
  expect(reopened.state).toBe('open')
  const resolvedAgain = await pmStatus(request, reopened, 'resolved')
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackReopen, exact: true }),
  ).toBeVisible()
  const current = await pmStatus(request, resolvedAgain, 'open')
  await drawer.locator('textarea#review-feedback-text').fill('Draft across CAS')
  const statusRequests: string[] = []
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PUT' && outgoing.url().endsWith(`/threads/${thread.id}/status`))
      statusRequests.push(outgoing.url())
  })
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackReopen, exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.feedbackConflict, { exact: true })).toBeVisible()
  expect(statusRequests).toHaveLength(1)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('Draft across CAS')
  await pmStatus(request, current, 'resolved')
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackReopen, exact: true }),
  ).toBeVisible()
  await drawer.locator('textarea#review-feedback-text').fill('Reply reopens')
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackReopen, exact: true }),
  ).toHaveCount(0)
  await expect(drawer.locator('.feedback-text').filter({ hasText: 'Reply reopens' })).toBeVisible()
  await drawer.locator('textarea#review-feedback-text').fill('Wrong-page draft')
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  const pages = page.locator('.workspace-nav .tree-page')
  await pages.nth(1).click()
  await feedback(page)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('')
  await expect(drawer.locator('.feedback-thread')).toHaveCount(0)
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} feedback keeps text and keyboard operations in the trusted viewport`, async ({
    page,
    request,
  }, testInfo) => {
    await enable(page, request)
    await page.evaluate(
      (language) => localStorage.setItem('proto-bridge-ui:language', language),
      locale,
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('share/open')
    const drawer = await feedback(page, locale)
    await authenticate(page, drawer, locale)
    await submit(page, drawer, 'A long page feedback line '.repeat(8), locale)
    const text = protoLocales[locale]
    await expect(drawer.getByText(text.feedbackPageHint, { exact: true })).toBeVisible()
    const input = drawer.locator('textarea#review-feedback-text')
    await input.fill('Keyboard reply')
    await input.focus()
    await input.press('Tab')
    const image = drawer.getByLabel(text.feedbackImageSelect, { exact: true })
    await expect(image).toBeFocused()
    await image.press('Tab')
    const send = drawer.getByRole('button', { name: text.feedbackSubmit, exact: true })
    await expect(send).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(
      drawer.locator('.feedback-text').filter({ hasText: 'Keyboard reply' }),
    ).toBeVisible()
    await expect
      .poll(async () => {
        const box = await send.boundingBox()
        return (
          !!box &&
          box.x >= 0 &&
          box.x + box.width <= 390 &&
          (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        )
      })
      .toBe(true)
    for (const pagination of await drawer.locator('.feedback-pagination').all())
      expect(await pagination.evaluate((element) => getComputedStyle(element).justifyContent)).toBe(
        'flex-end',
      )
    await page.screenshot({
      path: testInfo.outputPath(`feedback-${locale}-390.png`),
      fullPage: true,
      animations: 'disabled',
    })
  })
