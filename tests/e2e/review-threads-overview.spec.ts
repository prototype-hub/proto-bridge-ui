import { expect, test, type APIRequestContext, type Page, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type {
  CreatedReviewInvitation,
  PrototypePage,
  PublicShare,
  ReviewContext,
  ReviewThread,
  ReviewAssignment,
  Share,
} from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
type Locale = 'zh' | 'en'
async function enable(page: Page, request: APIRequestContext, token = 'open') {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await response.json()).result.find((item: Share) => item.token === token) as Share
  const policy = await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers,
    data: {
      enabled: true,
      allowComment: true,
      allowUnverified: true,
      expectedVersion: share.configVersion,
    },
  })
  expect(policy.ok()).toBe(true)
  return { ...share, configVersion: (await policy.json()).result.configVersion }
}
async function seed(
  client: APIRequestContext,
  count = 3,
  email = 'overview@example.invalid',
  token = 'open',
  resolved = false,
) {
  const response =
    token === 'locked'
      ? await client.post(`${origin}/api/prototype-hub/public/shares/${token}/verify`, {
          data: { password: 'test-share-password' },
        })
      : await client.get(`${origin}/api/prototype-hub/public/shares/${token}`)
  expect(response.ok()).toBe(true)
  const share = (await response.json()).result as PublicShare
  const manifest = await client.get(`${origin}${share.pagesUrl}`)
  const flat = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((item) => [item, ...flat(item.children || [])])
  const pages = flat((await manifest.json()).result).filter(
    (item) => !item.folder && item.pageId && item.path,
  )
  expect(pages.length).toBeGreaterThanOrEqual(2)
  const base = `${origin}/api/prototype-hub/public/shares/${token}/review`
  const grant = { revisionId: share.revisionId, accessKey: share.accessKey }
  const call = async (action: string, body = {}, csrf?: string) => {
    const result = await client.post(`${base}/${action}`, {
      headers: csrf ? { 'X-Review-CSRF': csrf } : {},
      data: { ...grant, ...body },
    })
    expect(result.ok()).toBe(true)
    return (await result.json()).result
  }
  let identity = (await call('context')) as ReviewContext
  const challenge = await call(
    'challenges',
    { email, displayName: email.split('@')[0] },
    identity.csrfToken,
  )
  identity = await call(
    'verify',
    { challengeId: challenge.challengeId, code: '123456' },
    identity.csrfToken,
  )
  const threads: ReviewThread[] = []
  for (let index = 0; index < count; index++) {
    let thread = (await call(
      'threads',
      {
        pageId: pages[index % 2]!.pageId,
        text: `${email.split('@')[0]} question ${index + 1}`,
        clientRequestId: crypto.randomUUID(),
      },
      identity.csrfToken,
    )) as ReviewThread
    if (resolved) {
      const changed = await client.put(
        `${origin}/api/prototype-hub/versions/v1/review-threads/${thread.id}/status`,
        {
          headers,
          data: {
            revisionId: thread.revisionId,
            pageId: thread.pageId,
            state: 'resolved',
            expectedVersion: thread.configVersion,
            clientRequestId: crypto.randomUUID(),
          },
        },
      )
      expect(changed.ok()).toBe(true)
      thread = (await changed.json()).result
    }
    threads.push(thread)
  }
  return { share, identity, threads, call }
}
const overview = (page: Page, locale: Locale = 'zh') =>
  page.getByRole('dialog', { name: protoLocales[locale].feedbackOverview, exact: true })
const feedback = (page: Page, locale: Locale = 'zh') =>
  page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
async function assign(
  request: APIRequestContext,
  thread: ReviewThread,
  assigneeId: string | null,
  expectedVersion = 0,
) {
  const response = await request.put(
    `${origin}/api/prototype-hub/versions/v1/review-threads/${thread.id}/assignment`,
    {
      headers,
      data: {
        revisionId: thread.revisionId,
        pageId: thread.pageId,
        assigneeId,
        expectedVersion,
        clientRequestId: crypto.randomUUID(),
      },
    },
  )
  expect(response.ok()).toBe(true)
  return (await response.json()).result as ReviewAssignment
}
async function openOverview(page: Page, locale: Locale = 'zh') {
  await page
    .getByRole('button', { name: protoLocales[locale].feedbackOverview, exact: true })
    .click()
  const drawer = overview(page, locale)
  await expect(drawer).toBeVisible()
  return drawer
}
const rowFor = (drawer: Locator, thread: ReviewThread) =>
  drawer
    .locator('.overview-row')
    .filter({ has: drawer.page().getByText(thread.summary, { exact: true }) })
async function view(page: Page, drawer: Locator, thread: ReviewThread, locale: Locale = 'zh') {
  await rowFor(drawer, thread)
    .getByRole('button', { name: protoLocales[locale].overviewView, exact: true })
    .click()
  await expect(
    feedback(page, locale).getByRole('heading', { name: thread.summary, exact: true }),
  ).toBeVisible()
  expect([...new URL(page.url()).searchParams]).toEqual([
    ['revisionId', thread.revisionId],
    ['pageId', thread.pageId],
    ['threadId', thread.id],
  ])
}
async function authenticateOverview(
  page: Page,
  drawer: Locator,
  email: string,
  locale: Locale = 'zh',
) {
  const text = protoLocales[locale]
  await drawer.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
  await identity.getByLabel(text.reviewEmail, { exact: true }).fill(email)
  await identity.getByLabel(text.reviewName, { exact: true }).fill('Overview visitor')
  await identity.getByRole('button', { name: text.reviewSendCode, exact: true }).click()
  await identity.getByLabel(text.reviewCode, { exact: true }).fill('123456')
  await identity.getByRole('button', { name: text.reviewVerify, exact: true }).click()
  await expect(identity.getByText(text.reviewEmailVerified, { exact: true })).toBeVisible()
  await identity.getByRole('button', { name: text.overviewReturn, exact: true }).click()
  await expect(drawer).toBeVisible()
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('PM pages and filters a fixed revision across pages, then explicitly views its existing thread and restores Back/Forward', async ({
  page,
  request,
}, info) => {
  await enable(page, request)
  const seeded = await seed(page.request, 25)
  await page.goto('preview/p1/v1')
  const requests: string[] = []
  page.on('request', (outgoing) => requests.push(outgoing.url()))
  const drawer = await openOverview(page)
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  expect(new Set(await drawer.locator('.overview-row > strong').allTextContents()).size).toBe(2)
  expect(requests.some((url) => /\/messages|\/assignment/.test(url))).toBe(false)
  const input = requests.find((url) => url.endsWith('/_overview'))
  expect(input).toBeTruthy()
  const nextResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/_overview') && response.request().postDataJSON().pageIndex === 1,
  )
  await drawer.locator('.ant-pagination-next').click()
  expect((await (await nextResponse).json()).result.total).toBe(25)
  await expect(drawer.locator('.overview-row')).toHaveCount(5)
  await drawer
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackResolved })
    .click()
  await expect(drawer.locator('.overview-row')).toHaveCount(0)
  await drawer.getByRole('button', { name: protoLocales.zh.overviewClear, exact: true }).click()
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  await page.screenshot({
    path: info.outputPath('overview-member-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  const first = seeded.threads.at(-1)!,
    second = seeded.threads.at(-2)!
  await view(page, drawer, first)
  await feedback(page)
    .getByRole('button', { name: protoLocales.zh.feedbackOverview, exact: true })
    .click()
  await view(page, drawer, second)
  await page.goBack()
  await expect(
    feedback(page).getByRole('heading', { name: first.summary, exact: true }),
  ).toBeVisible()
  await page.goForward()
  await expect(
    feedback(page).getByRole('heading', { name: second.summary, exact: true }),
  ).toBeVisible()
})

test('member responsibility queues combine state and real paging, then reflect explicit assignment and clear after returning and refreshing', async ({
  page,
  request,
}, info) => {
  await enable(page, request)
  const seeded = await seed(page.request, 24)
  const editor = await request.put(`${origin}/api/prototype-hub/projects/p1/members/u2`, {
    headers,
    data: { role: 'editor' },
  })
  expect(editor.ok()).toBe(true)
  for (const thread of seeded.threads.slice(2)) await assign(request, thread, 'u1')
  await assign(request, seeded.threads[1]!, 'u2')
  const unassigned = seeded.threads[0]!,
    mineThread = seeded.threads[2]!
  await page.goto('preview/p1/v1')
  const drawer = await openOverview(page)
  const radio = (name: string) => drawer.getByRole('radio', { name, exact: true })
  await drawer
    .locator('.overview-assignment .ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.overviewAssignmentMine })
    .click()
  await expect(radio(protoLocales.zh.overviewAssignmentMine)).toBeChecked()
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  const next = page.waitForResponse(
    (response) =>
      response.url().endsWith('/_overview') && response.request().postDataJSON().pageIndex === 1,
  )
  await drawer.locator('.ant-pagination-next').click()
  const second = (await (await next).json()).result
  expect(second.total).toBe(22)
  expect(second.data).toHaveLength(2)
  await expect(drawer.locator('.overview-row')).toHaveCount(2)
  await drawer
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackResolved })
    .click()
  await expect(drawer.locator('.overview-row')).toHaveCount(0)
  const resolve = await request.put(
    `${origin}/api/prototype-hub/versions/v1/review-threads/${mineThread.id}/status`,
    {
      headers,
      data: {
        revisionId: mineThread.revisionId,
        pageId: mineThread.pageId,
        state: 'resolved',
        expectedVersion: 0,
        clientRequestId: crypto.randomUUID(),
      },
    },
  )
  expect(resolve.ok()).toBe(true)
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(drawer.locator('.overview-row')).toHaveCount(1)
  await expect(radio(protoLocales.zh.overviewAssignmentMine)).toBeChecked()
  await expect(radio(protoLocales.zh.feedbackResolved)).toBeChecked()
  await drawer.getByRole('button', { name: protoLocales.zh.overviewClear, exact: true }).click()
  await expect(radio(protoLocales.zh.overviewAssignmentAll)).toBeChecked()
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  await drawer
    .locator('.overview-assignment .ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.overviewAssignmentUnassigned })
    .click()
  await expect(drawer.locator('.overview-row')).toHaveCount(1)
  await view(page, drawer, unassigned)
  const area = feedback(page).locator('.feedback-assignment')
  await area.getByRole('button', { name: protoLocales.zh.assignmentEdit, exact: true }).click()
  await area.locator('.assignment-picker .ant-select-selector').click()
  await page
    .locator(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
    )
    .filter({ hasText: 'Admin' })
    .click()
  await area.getByRole('button', { name: protoLocales.zh.assignmentSave, exact: true }).click()
  await expect(area.getByText('Admin', { exact: true })).toBeVisible()
  await feedback(page)
    .getByRole('button', { name: protoLocales.zh.feedbackOverview, exact: true })
    .click()
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(drawer.locator('.overview-row')).toHaveCount(0)
  await expect(radio(protoLocales.zh.overviewAssignmentUnassigned)).toBeChecked()
  await drawer
    .locator('.overview-assignment .ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.overviewAssignmentMine })
    .click()
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  // The newly assigned oldest thread can be outside the first page; paging remains server-driven.
  await drawer.locator('.ant-pagination-next').click()
  await expect(drawer.locator('.overview-row')).toHaveCount(3)
  await view(page, drawer, unassigned)
  await area.getByRole('button', { name: protoLocales.zh.assignmentClear, exact: true }).click()
  await expect(area.getByText(protoLocales.zh.assignmentEmpty, { exact: true })).toBeVisible()
  await feedback(page)
    .getByRole('button', { name: protoLocales.zh.feedbackOverview, exact: true })
    .click()
  await drawer.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(drawer.locator('.overview-row')).toHaveCount(2)
  await drawer
    .locator('.overview-assignment .ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.overviewAssignmentUnassigned })
    .click()
  await expect(rowFor(drawer, unassigned)).toBeVisible()
  await page.screenshot({
    path: info.outputPath('overview-assignment-member-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} member responsibility controls support keyboard selection with real matched pagination`, async ({
    page,
    request,
  }, info) => {
    await enable(page, request)
    const seeded = await seed(page.request, 22)
    for (const thread of seeded.threads) await assign(request, thread, 'u1')
    await page.evaluate(
      (language) => localStorage.setItem('proto-bridge-ui:language', language),
      locale,
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('preview/p1/v1')
    const drawer = await openOverview(page, locale),
      text = protoLocales[locale]
    const mine = drawer.getByRole('radio', { name: text.overviewAssignmentMine, exact: true })
    await mine.focus()
    await expect(mine).toBeFocused()
    await page.keyboard.press('Space')
    await expect(mine).toBeChecked()
    await expect(drawer.locator('.overview-row')).toHaveCount(20)
    const next = page.waitForResponse(
      (response) =>
        response.url().endsWith('/_overview') && response.request().postDataJSON().pageIndex === 1,
    )
    await drawer.locator('.ant-pagination-next').click()
    const result = (await (await next).json()).result
    expect(result.total).toBe(22)
    expect(result.data).toHaveLength(2)
    await expect(drawer.locator('.overview-row')).toHaveCount(2)
    await expect(drawer.locator('.ant-pagination-simple-pager input')).toHaveValue('2')
    await drawer.locator('.overview-pagination').scrollIntoViewIfNeeded()
    await expect
      .poll(async () => {
        const container = await drawer.boundingBox(),
          pager = await drawer.locator('.overview-pagination').boundingBox()
        return (
          !!container &&
          !!pager &&
          pager.x >= 0 &&
          pager.x + pager.width <= 390 &&
          pager.y >= 0 &&
          pager.y + pager.height <= 844 &&
          Math.abs(pager.x + pager.width - container.x - container.width) <= 2 &&
          (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        )
      })
      .toBe(true)
    await page.screenshot({
      path: info.outputPath(`overview-assignment-member-390-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    const free = drawer.getByRole('radio', { name: text.overviewAssignmentUnassigned, exact: true })
    await free.focus()
    await page.keyboard.press('Space')
    await expect(free).toBeChecked()
    await expect(drawer.locator('.overview-row')).toHaveCount(0)
    const clear = drawer.getByRole('button', { name: text.overviewClear, exact: true })
    await clear.focus()
    await page.keyboard.press('Enter')
    await expect(
      drawer.getByRole('radio', { name: text.overviewAssignmentAll, exact: true }),
    ).toBeChecked()
    await expect(drawer.locator('.overview-row')).toHaveCount(20)
  })

test('a visitor sees only their own feedback in the current share and overview never reads message/image/assignment bodies', async ({
  page,
  request,
}) => {
  await enable(page, request)
  await enable(page, request, 'locked')
  const own = await seed(page.request, 3)
  await seed(request, 2, 'other@example.invalid')
  await seed(page.request, 2, 'overview@example.invalid', 'locked')
  const observed: {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
  }[] = []
  await page.goto('share/open')
  const reads: Promise<void>[] = []
  page.on('request', (outgoing) => {
    if (outgoing.url().includes('/review/'))
      reads.push(
        (async () => {
          observed.push({
            url: outgoing.url(),
            headers: await outgoing.allHeaders(),
            body: outgoing.postDataJSON(),
          })
        })(),
      )
  })
  const drawer = await openOverview(page)
  await expect(drawer.locator('.overview-row')).toHaveCount(3)
  await expect(drawer.locator('.overview-assignment')).toHaveCount(0)
  await expect(drawer).not.toContainText('other question')
  await Promise.all(reads)
  const requests = observed.filter((item) => item.url.endsWith('/_overview'))
  expect(requests.length).toBeGreaterThan(0)
  expect(observed.some((item) => /\/messages|\/assignment/.test(item.url))).toBe(false)
  for (const outgoing of requests) {
    expect(outgoing.headers['x-access-token']).toBeUndefined()
    expect(outgoing.headers['x-review-csrf']).toBeTruthy()
    expect(outgoing.body).toEqual({
      revisionId: own.share.revisionId,
      accessKey: own.share.accessKey,
      pageIndex: 0,
      pageSize: 20,
    })
  }
  await view(page, drawer, own.threads.at(-1)!)
})

test('session loss on page two makes no further overview request before fresh OTP and returns to the same resolved query', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const seeded = await seed(page.request, 24, 'return@example.invalid', 'open', true)
  await page.goto('share/open')
  const drawer = await openOverview(page)
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  await drawer
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackResolved })
    .click()
  await expect(drawer.locator('.overview-row')).toHaveCount(20)
  await seeded.call('logout', {}, seeded.identity.csrfToken)
  await drawer.locator('.ant-pagination-next').click()
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }),
  ).toBeVisible()
  let calls = 0
  page.on('request', (outgoing) => {
    if (outgoing.url().endsWith('/_overview')) calls++
  })
  await drawer.getByRole('button', { name: '重试', exact: true }).click()
  expect(calls).toBe(0)
  await authenticateOverview(page, drawer, 'return@example.invalid')
  await expect(drawer.locator('.overview-row')).toHaveCount(4)
  await expect(
    drawer.getByRole('radio', { name: protoLocales.zh.feedbackResolved, exact: true }),
  ).toBeChecked()
  await expect(drawer.locator('.ant-pagination-simple-pager input')).toHaveValue('2')
  expect(calls).toBeGreaterThan(0)
})

test('pending invitation blocks an existing session from overview and neither the fragment nor invitation grants access', async ({
  page,
  request,
}) => {
  const share = await enable(page, request)
  await seed(page.request, 2)
  const created = await request.post(
    `${origin}/api/prototype-hub/shares/${share.id}/review-invitations`,
    {
      headers,
      data: { email: 'invited@example.invalid', expectedShareVersion: share.configVersion },
    },
  )
  expect(created.ok()).toBe(true)
  const invitation = (await created.json()).result as CreatedReviewInvitation
  let queries = 0
  page.on('request', (outgoing) => {
    if (outgoing.url().endsWith('/_overview')) queries++
  })
  await page.goto(`share/open#reviewInvitation=${invitation.invitationToken}`)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  const drawer = await openOverview(page)
  await expect(drawer.locator('.overview-row')).toHaveCount(0)
  await drawer.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: protoLocales.zh.reviewIdentity, exact: true })
  await expect(
    identity.getByText(protoLocales.zh.reviewInvitationLogoutFirst, { exact: true }),
  ).toBeVisible()
  expect(queries).toBe(0)
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    invitation.invitationToken,
  )
})

test('opening overview and cancelling navigation preserve an unknown image reply and its exact retry key, while confirmed navigation discards the draft', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const seeded = await seed(page.request, 2),
    current = seeded.threads[0]!,
    other = seeded.threads[1]!
  await page.goto(
    `share/open?${new URLSearchParams({ revisionId: current.revisionId, pageId: current.pageId, threadId: current.id })}`,
  )
  const drawer = feedback(page)
  await expect(drawer.getByRole('heading', { name: current.summary, exact: true })).toBeVisible()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQrzjwHwAEiAJf6ZokFQAAAABJRU5ErkJggg==',
    'base64',
  )
  const attempts: { request: string; image: string }[] = []
  await page.route('**/threads/*/messages-with-image', async (route) => {
    const outgoing = route.request(),
      body = outgoing.postDataBuffer()
    expect(body).not.toBeNull()
    const form = await new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': (await outgoing.allHeaders())['content-type']! },
      body: new Uint8Array(body!),
    }).formData()
    attempts.push({
      request: await (form.get('request') as Blob).text(),
      image: Buffer.from(await (form.get('image') as Blob).arrayBuffer()).toString('base64'),
    })
    if (attempts.length === 1) {
      await route.fetch()
      await route.abort('failed')
    } else await route.fulfill({ response: await route.fetch() })
  })
  await drawer.locator('textarea#review-feedback-text').fill('Unconfirmed reply')
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: png })
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.feedbackResultUnknown, { exact: true }),
  ).toBeVisible()
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackOverview, exact: true }).click()
  const all = overview(page)
  await rowFor(all, other)
    .getByRole('button', { name: protoLocales.zh.overviewView, exact: true })
    .click()
  const confirm = page.getByRole('dialog', {
    name: protoLocales.zh.overviewLeaveTitle,
    exact: true,
  })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(current.id)
  expect(attempts).toHaveLength(1)
  await rowFor(all, current)
    .getByRole('button', { name: protoLocales.zh.overviewView, exact: true })
    .click()
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('Unconfirmed reply')
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toBeVisible()
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.locator('.feedback-text').filter({ hasText: 'Unconfirmed reply' }),
  ).toBeVisible()
  expect(attempts).toHaveLength(2)
  expect(attempts[0]).toEqual(attempts[1])
  await drawer.locator('textarea#review-feedback-text').fill('Discard only by confirmation')
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackOverview, exact: true }).click()
  await rowFor(all, other)
    .getByRole('button', { name: protoLocales.zh.overviewView, exact: true })
    .click()
  await confirm
    .getByRole('button', { name: protoLocales.zh.overviewLeaveConfirm, exact: true })
    .click()
  await expect(drawer.getByRole('heading', { name: other.summary, exact: true })).toBeVisible()
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('')
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toHaveCount(0)
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} overview keeps rows, right pagination, state controls and keyboard viewing inside the viewport`, async ({
    page,
    request,
  }, info) => {
    await enable(page, request)
    const seeded = await seed(page.request, 3)
    await page.evaluate(
      (language) => localStorage.setItem('proto-bridge-ui:language', language),
      locale,
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('share/open')
    const drawer = await openOverview(page, locale),
      text = protoLocales[locale]
    await expect(drawer.locator('.overview-row')).toHaveCount(3)
    await drawer.getByRole('radio', { name: text.feedbackResolved, exact: true }).focus()
    await expect(
      drawer.getByRole('radio', { name: text.feedbackResolved, exact: true }),
    ).toBeFocused()
    await page.keyboard.press('Space')
    await expect(
      drawer.getByRole('radio', { name: text.feedbackResolved, exact: true }),
    ).toBeChecked()
    await expect(drawer.locator('.overview-row')).toHaveCount(0)
    const clear = drawer.getByRole('button', { name: text.overviewClear, exact: true })
    await clear.focus()
    await page.keyboard.press('Enter')
    await expect(drawer.locator('.overview-row')).toHaveCount(3)
    await expect
      .poll(async () => {
        const container = await drawer.boundingBox(),
          pager = await drawer.locator('.overview-pagination').boundingBox()
        return (
          !!container &&
          !!pager &&
          Math.abs(pager.x + pager.width - container.x - container.width) <= 2 &&
          (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        )
      })
      .toBe(true)
    const viewButton = rowFor(drawer, seeded.threads.at(-1)!).getByRole('button', {
      name: text.overviewView,
      exact: true,
    })
    await expect
      .poll(async () => {
        const box = await viewButton.boundingBox()
        return !!box && box.x >= 0 && box.x + box.width <= 390
      })
      .toBe(true)
    await page.screenshot({
      path: info.outputPath(`overview-public-390-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await viewButton.focus()
    await page.keyboard.press('Enter')
    await expect(
      feedback(page, locale).getByRole('heading', {
        name: seeded.threads.at(-1)!.summary,
        exact: true,
      }),
    ).toBeVisible()
    expect(new URL(page.url()).searchParams.get('threadId')).toBe(seeded.threads.at(-1)!.id)
  })
