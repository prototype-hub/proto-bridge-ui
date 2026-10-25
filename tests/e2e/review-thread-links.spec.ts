import { expect, test, type Page, type APIRequestContext } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type {
  Share,
  PublicShare,
  ReviewContext,
  ReviewThread,
  CreatedReviewInvitation,
  PrototypePage,
} from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
async function enable(page: Page, request: APIRequestContext, token = 'open') {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await response.json()).result.find((row: Share) => row.token === token) as Share
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
  page: Page,
  token: string,
  count = 1,
  email = 'reader@example.invalid',
  unverified = false,
) {
  const response =
    token === 'locked'
      ? await page.request.post(`${origin}/api/prototype-hub/public/shares/${token}/verify`, {
          data: { password: 'test-share-password' },
        })
      : await page.request.get(`${origin}/api/prototype-hub/public/shares/${token}`)
  expect(response.ok()).toBe(true)
  const grant = (await response.json()).result as PublicShare
  const manifest = await page.request.get(`${origin}${grant.pagesUrl}`)
  expect(manifest.ok()).toBe(true)
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((item) => [item, ...flatten(item.children || [])])
  const selectedPage = flatten((await manifest.json()).result).find(
    (item) => !item.folder && item.pageId && item.path,
  )!
  expect(!!selectedPage?.pageId).toBe(true)
  const base = `${origin}/api/prototype-hub/public/shares/${token}/review`
  const data = { revisionId: grant.revisionId, accessKey: grant.accessKey }
  const call = async (action: string, body: object = {}, csrf?: string) => {
    const value = await page.request.post(`${base}/${action}`, {
      headers: csrf ? { 'X-Review-CSRF': csrf } : {},
      data: { ...data, ...body },
    })
    expect(value.ok()).toBe(true)
    return (await value.json()).result
  }
  let identity = (await call('context')) as ReviewContext
  if (unverified)
    identity = await call('unverified', { displayName: 'Link visitor' }, identity.csrfToken)
  else {
    const challenge = await call(
      'challenges',
      { email, displayName: 'Link visitor' },
      identity.csrfToken,
    )
    identity = await call(
      'verify',
      { challengeId: challenge.challengeId, code: '123456' },
      identity.csrfToken,
    )
  }
  const threads: ReviewThread[] = []
  for (let index = 0; index < count; index++)
    threads.push(
      await call(
        'threads',
        {
          pageId: selectedPage.pageId,
          text: `Linked question ${index + 1}`,
          clientRequestId: crypto.randomUUID(),
        },
        identity.csrfToken,
      ),
    )
  return { threads, identity, call, grant }
}
const link = (path: string, thread: ReviewThread) =>
  `${path}?${new URLSearchParams({ revisionId: thread.revisionId, pageId: thread.pageId, threadId: thread.id })}`
const drawer = (page: Page, locale: 'zh' | 'en' = 'zh') =>
  page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('a password-protected invited OTP flow returns to the requested thread without granting or submitting from its URL', async ({
  page,
  request,
}) => {
  const share = await enable(page, request, 'locked')
  const fixture = await seed(page, 'locked')
  await fixture.call('logout', {}, fixture.identity.csrfToken)
  const created = await request.post(
    `${origin}/api/prototype-hub/shares/${share.id}/review-invitations`,
    {
      headers,
      data: { email: 'reader@example.invalid', expectedShareVersion: share.configVersion },
    },
  )
  expect(created.ok()).toBe(true)
  const invitation = (await created.json()).result as CreatedReviewInvitation
  let details = 0,
    messages = 0,
    writes = 0
  page.on('request', (outgoing) => {
    if (outgoing.url().endsWith('/_detail')) details++
    if (outgoing.url().endsWith('/messages/_query')) messages++
    if (outgoing.method() === 'POST' && outgoing.url().endsWith('/review/threads')) writes++
  })
  const target = fixture.threads[0]!
  await page.goto(`${link('share/locked', target)}#reviewInvitation=${invitation.invitationToken}`)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await expect(page.getByLabel('分享密码', { exact: true })).toBeVisible()
  expect(details).toBe(0)
  expect(messages).toBe(0)
  await page.getByLabel('分享密码', { exact: true }).fill('test-share-password')
  await page.getByRole('button', { name: '打开原型', exact: true }).click()
  const feedback = drawer(page)
  await expect(feedback).toBeVisible()
  await expect(
    feedback.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }),
  ).toBeVisible()
  expect(details).toBe(0)
  expect(messages).toBe(0)
  await feedback.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: protoLocales.zh.reviewIdentity, exact: true })
  await expect(
    identity.getByText(protoLocales.zh.reviewInvitationRecipientHint, { exact: true }),
  ).toBeVisible()
  await identity
    .getByLabel(protoLocales.zh.reviewEmail, { exact: true })
    .fill('reader@example.invalid')
  await identity.getByLabel(protoLocales.zh.reviewName, { exact: true }).fill('Link visitor')
  await identity.getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true }).click()
  await identity.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill('123456')
  await identity.getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true }).click()
  await expect(
    identity.getByText(protoLocales.zh.reviewEmailVerified, { exact: true }),
  ).toBeVisible()
  await identity.getByRole('button', { name: protoLocales.zh.feedbackReturn, exact: true }).click()
  await expect(feedback.getByRole('heading', { name: target.summary, exact: true })).toBeVisible()
  await expect(feedback.locator('.feedback-text')).toHaveText(target.summary)
  expect(details).toBeGreaterThan(0)
  expect(messages).toBeGreaterThan(0)
  expect(writes).toBe(0)
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(target.id)
  const source = await page.locator('.frame-stage > iframe').getAttribute('src')
  expect(source).not.toContain(target.id)
  expect(source).not.toContain(invitation.invitationToken)
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    invitation.invitationToken,
  )
})

test('PM locates a thread outside page one and the active status filter, copies the current shell and restores Back/Forward', async ({
  page,
  request,
}, testInfo) => {
  await enable(page, request)
  const fixture = await seed(page, 'open', 25)
  const target = fixture.threads[0]!
  const first = await request.post(
    `${origin}/api/prototype-hub/versions/v1/review-threads/_query`,
    {
      headers,
      data: {
        revisionId: target.revisionId,
        pageId: target.pageId,
        pageIndex: 0,
        pageSize: 20,
      },
    },
  )
  expect((await first.json()).result.data.some((row: ReviewThread) => row.id === target.id)).toBe(
    false,
  )
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(link('preview/p1/v1', target))
  const feedback = drawer(page)
  await expect(feedback.getByRole('heading', { name: target.summary, exact: true })).toBeVisible()
  await expect(feedback.locator('.feedback-thread')).toHaveCount(20)
  await expect(feedback.getByRole('button', { name: target.summary, exact: true })).toHaveCount(0)
  await feedback
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackResolved })
    .click()
  await expect(feedback.locator('.feedback-thread')).toHaveCount(0)
  await expect(feedback.getByRole('heading', { name: target.summary, exact: true })).toBeVisible()
  const copy = feedback.getByRole('button', { name: protoLocales.zh.feedbackCopyLink, exact: true })
  await copy.click()
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  expect(copied.pathname).toBe('/tools/preview/p1/v1')
  expect([...copied.searchParams]).toEqual([
    ['revisionId', target.revisionId],
    ['pageId', target.pageId],
    ['threadId', target.id],
  ])
  expect(copied.hash).toBe('')
  await page.screenshot({
    path: testInfo.outputPath('thread-link-member-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await feedback
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackOpen })
    .click()
  const other = fixture.threads.at(-1)!
  await feedback.getByRole('button', { name: other.summary, exact: true }).click()
  await expect(feedback.getByRole('heading', { name: other.summary, exact: true })).toBeVisible()
  await page.goBack()
  await expect(feedback.getByRole('heading', { name: target.summary, exact: true })).toBeVisible()
  await page.goForward()
  await expect(feedback.getByRole('heading', { name: other.summary, exact: true })).toBeVisible()
  await feedback.getByRole('button', { name: '关闭', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('threadId')).toBe(false)
  await page.getByRole('button', { name: protoLocales.zh.copyPageLink, exact: true }).click()
  expect([
    ...new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams,
  ]).toEqual([
    ['revisionId', target.revisionId],
    ['pageId', target.pageId],
  ])
})

test('invalid or incomplete triples stay visible and never become ordinary new-thread submissions', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const fixture = await seed(page, 'open')
  const id = fixture.threads[0]!.id
  const pageId = fixture.threads[0]!.pageId
  let reads = 0
  page.on('request', (outgoing) => {
    if (outgoing.url().endsWith('/_detail') || outgoing.url().endsWith('/messages/_query')) reads++
  })
  for (const query of [
    `threadId=${id}`,
    `revisionId=r-v1&threadId=${id}`,
    `revisionId=r-v1&pageId=${pageId}&threadId=${id}&threadId=${id}`,
    `revisionId=r-v1&pageId=${pageId}&threadId=`,
  ]) {
    await page.goto(`share/open?${query}`)
    await expect(
      page.getByText(protoLocales.zh.feedbackInvalidTarget, { exact: true }),
    ).toBeVisible()
    expect(new URL(page.url()).search.slice(1)).toBe(query)
  }
  await page.getByRole('button', { name: protoLocales.zh.feedback, exact: true }).click()
  await expect(
    drawer(page).getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }),
  ).toHaveCount(0)
  expect(reads).toBe(0)
})

for (const kind of ['missing', 'foreign'] as const)
  test(`a ${kind} target cannot fall back to a new thread or show another guest's messages`, async ({
    page,
    request,
  }) => {
    await enable(page, request)
    const fixture = await seed(page, 'open')
    const target = { ...fixture.threads[0]!, ...(kind === 'missing' ? { id: 'x'.repeat(43) } : {}) }
    if (kind === 'foreign') await seed(page, 'open', 0, 'other@example.invalid')
    await page.goto(link('share/open', target))
    const feedback = drawer(page)
    await expect(
      feedback.getByText(protoLocales.zh.feedbackUnavailable, { exact: true }),
    ).toBeVisible()
    await expect(feedback.locator('.feedback-text')).toHaveCount(0)
    await expect(
      feedback.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }),
    ).toHaveCount(0)
    expect(new URL(page.url()).searchParams.get('threadId')).toBe(target.id)
  })

test('a delayed old detail cannot replace the target after history navigation', async ({
  page,
  request,
}) => {
  await enable(page, request)
  const fixture = await seed(page, 'open', 2)
  const [old, current] = fixture.threads as [ReviewThread, ReviewThread]
  await page.goto(link('share/open', current))
  await expect(
    drawer(page).getByRole('heading', { name: current.summary, exact: true }),
  ).toBeVisible()
  let release!: () => void, reached!: () => void
  const started = new Promise<void>((resolve) => {
    reached = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/review/threads/${old.id}/_detail`, async (route) => {
    reached()
    await held
    await route.fulfill({ json: { success: true, result: old } })
  })
  try {
    await page.goto(link('share/open', old))
    await started
    await page.goBack()
    await expect(
      drawer(page).getByRole('heading', { name: current.summary, exact: true }),
    ).toBeVisible()
  } finally {
    release()
  }
  await expect(drawer(page).getByRole('heading', { name: old.summary, exact: true })).toHaveCount(0)
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} direct feedback keeps keyboard copy in bounds without recovering an unverified identity by URL`, async ({
    page,
    request,
  }, testInfo) => {
    await enable(page, request)
    const fixture = await seed(page, 'open', 1, undefined, true)
    const target = fixture.threads[0]!
    await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), locale)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(link('share/open', target))
    const feedback = drawer(page, locale)
    await expect(feedback.getByRole('heading', { name: target.summary, exact: true })).toBeVisible()
    const copy = feedback.getByRole('button', {
      name: protoLocales[locale].feedbackCopyLink,
      exact: true,
    })
    await expect
      .poll(async () => {
        const box = await copy.boundingBox()
        return (
          !!box &&
          box.x >= 0 &&
          box.x + box.width <= 390 &&
          (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        )
      })
      .toBe(true)
    await copy.focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${origin}/tools/${link('share/open', target)}`)
    await page.screenshot({
      path: testInfo.outputPath(`thread-link-${locale}-390.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await page.context().clearCookies()
    await page.reload()
    await expect(
      drawer(page, locale).getByRole('button', {
        name: protoLocales[locale].reviewIdentity,
        exact: true,
      }),
    ).toBeVisible()
    await expect(drawer(page, locale).locator('.feedback-text')).toHaveCount(0)
  })
