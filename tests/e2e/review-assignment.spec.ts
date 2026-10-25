import { expect, test, type Page, type APIRequestContext, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type {
  Share,
  PublicShare,
  PrototypePage,
  ReviewContext,
  ReviewThread,
  ReviewAssignment,
} from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
type Locale = 'zh' | 'en'
async function prepare(page: Page, request: APIRequestContext) {
  await login(page)
  const list = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await list.json()).result.find((row: Share) => row.token === 'open') as Share
  expect(
    (
      await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
        headers,
        data: {
          enabled: true,
          allowComment: true,
          allowUnverified: true,
          expectedVersion: share.configVersion,
        },
      })
    ).ok(),
  ).toBe(true)
  const result = await page.request.get(`${origin}/api/prototype-hub/public/shares/open`)
  const grant = (await result.json()).result as PublicShare
  const manifest = await page.request.get(`${origin}${grant.pagesUrl}`)
  const flatten = (pages: PrototypePage[]): PrototypePage[] =>
    pages.flatMap((item) => [item, ...flatten(item.children || [])])
  const selected = flatten((await manifest.json()).result).find(
    (item) => !item.folder && item.pageId && item.path,
  )!
  const input = { revisionId: grant.revisionId, accessKey: grant.accessKey }
  const call = async (action: string, body: object = {}, csrf?: string) => {
    const response = await page.request.post(
      `${origin}/api/prototype-hub/public/shares/open/review/${action}`,
      {
        headers: { Origin: origin, ...(csrf ? { 'X-Review-CSRF': csrf } : {}) },
        data: { ...input, ...body },
      },
    )
    expect(response.ok()).toBe(true)
    return (await response.json()).result
  }
  let identity = (await call('context')) as ReviewContext
  identity = await call('unverified', { displayName: 'Assignment visitor' }, identity.csrfToken)
  const thread = (await call(
    'threads',
    { pageId: selected.pageId, text: 'Assignment question', clientRequestId: crypto.randomUUID() },
    identity.csrfToken,
  )) as ReviewThread
  const scope = { revisionId: thread.revisionId, pageId: thread.pageId }
  const link = (base: string) => `${base}?${new URLSearchParams({ ...scope, threadId: thread.id })}`
  const assignmentUrl = `${origin}/api/prototype-hub/versions/v1/review-threads/${thread.id}/assignment`
  const assign = async (assigneeId: string | null, expectedVersion: number) => {
    const response = await request.put(assignmentUrl, {
      headers,
      data: { ...scope, assigneeId, expectedVersion, clientRequestId: crypto.randomUUID() },
    })
    expect(response.ok()).toBe(true)
    return (await response.json()).result as ReviewAssignment
  }
  return { thread, scope, link, assignmentUrl, assign, call }
}
async function member(
  page: Page,
  fixture: Awaited<ReturnType<typeof prepare>>,
  locale: Locale = 'zh',
) {
  await page.evaluate(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  await page.goto(fixture.link('preview/p1/v1'))
  const drawer = page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
  await expect(drawer).toBeVisible()
  const area = drawer.locator('.feedback-assignment')
  await expect(area.getByText(protoLocales[locale].assignmentEmpty, { exact: true })).toBeVisible()
  return { drawer, area }
}
async function choose(page: Page, area: Locator, name: string, locale: Locale = 'zh') {
  await area.getByRole('button', { name: protoLocales[locale].assignmentEdit, exact: true }).click()
  const select = area.locator('.assignment-picker')
  await select.locator('.ant-select-selector').click()
  await page
    .locator(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
    )
    .filter({ hasText: name })
    .click()
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('members explicitly set and clear an assignee without changing the public thread or exposing assignment to runtime or visitors', async ({
  page,
  request,
}, info) => {
  const fixture = await prepare(page, request)
  const outgoing: string[] = []
  page.on('request', (sent) => {
    if (sent.url().includes('/assignment')) outgoing.push(sent.url())
  })
  const { area } = await member(page, fixture)
  expect(outgoing.filter((url) => url.endsWith('/_candidates'))).toHaveLength(0)
  await choose(page, area, 'Admin')
  const written = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url() === fixture.assignmentUrl,
  )
  await area.getByRole('button', { name: protoLocales.zh.assignmentSave, exact: true }).click()
  const assignment = (await (await written).json()).result as ReviewAssignment
  expect(assignment.assignmentVersion).toBe(1)
  await expect(area.getByText('Admin', { exact: true })).toBeVisible()
  await page.screenshot({
    path: info.outputPath('review-assignment-member-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await area.getByRole('button', { name: protoLocales.zh.assignmentClear, exact: true }).click()
  await expect(area.getByText(protoLocales.zh.assignmentEmpty, { exact: true })).toBeVisible()
  const query = await fixture.call(
    `threads/${fixture.thread.id}/_detail`,
    fixture.scope,
    (await fixture.call('context')).csrfToken,
  )
  expect(query).toEqual(fixture.thread)
  const before = outgoing.length
  await page.goto(fixture.link('share/open'))
  const publicDrawer = page.getByRole('dialog', { name: protoLocales.zh.feedback, exact: true })
  await expect(publicDrawer.locator('.feedback-text')).toHaveText('Assignment question')
  await expect(publicDrawer.locator('.feedback-assignment')).toHaveCount(0)
  expect(outgoing).toHaveLength(before)
  expect(await page.locator('.frame-stage > iframe').getAttribute('src')).not.toContain(
    'assignment',
  )
  expect(page.url()).not.toMatch(/assignee|assignmentVersion/)
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(
    /assignmentVersion|assigneeId/,
  )
})

test('candidate search uses bounded real pages, literal names and current editor membership', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  expect(
    (
      await request.put(`${origin}/api/prototype-hub/projects/p1/members/u2`, {
        headers,
        data: { role: 'viewer' },
      })
    ).ok(),
  ).toBe(true)
  for (let index = 0; index < 21; index++) {
    const response = await request.post(`${origin}/api/user/detail/_create`, {
      headers,
      data: {
        user: { username: `editor${index}`, name: `Editor ${String(index).padStart(2, '0')}` },
        roleIdList: [],
        orgIdList: [],
        positions: [],
      },
    })
    expect(response.ok()).toBe(true)
    const user = (await response.json()).result
    expect(
      (
        await request.put(`${origin}/api/prototype-hub/projects/p1/members/${user.id}`, {
          headers,
          data: { role: 'editor' },
        })
      ).ok(),
    ).toBe(true)
  }
  const { area } = await member(page, fixture)
  const initial = page.waitForResponse((response) =>
    response.url().endsWith('/assignment/_candidates'),
  )
  await area.getByRole('button', { name: protoLocales.zh.assignmentEdit, exact: true }).click()
  const first = (await (await initial).json()).result
  expect(first.total).toBe(22)
  expect(first.data).toHaveLength(20)
  expect(
    first.data.every((row: object) => Object.keys(row).sort().join(',') === 'name,userId'),
  ).toBe(true)
  expect(first.data.some((row: { name: string }) => row.name === 'Operator')).toBe(false)
  const next = page.waitForResponse((response) =>
    response.url().endsWith('/assignment/_candidates'),
  )
  await area.locator('.ant-pagination-next').click()
  const second = (await (await next).json()).result
  expect(second.pageIndex).toBe(1)
  expect(second.total).toBe(22)
  expect(second.data).toHaveLength(2)
  await area.getByLabel(protoLocales.zh.assignmentSearch, { exact: true }).fill('%_')
  const literal = page.waitForResponse((response) =>
    response.url().endsWith('/assignment/_candidates'),
  )
  await area
    .getByRole('button', { name: protoLocales.zh.assignmentSearchAction, exact: true })
    .click()
  expect((await (await literal).json()).result.total).toBe(0)
})

test('a removed assignee stays visibly unavailable until an explicit clear, without automatic reassignment', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  await request.put(`${origin}/api/prototype-hub/projects/p1/members/u2`, {
    headers,
    data: { role: 'editor' },
  })
  const { area } = await member(page, fixture)
  await choose(page, area, 'Operator')
  await area.getByRole('button', { name: protoLocales.zh.assignmentSave, exact: true }).click()
  await expect(area.getByText('Operator', { exact: true })).toBeVisible()
  expect(
    (await request.delete(`${origin}/api/prototype-hub/projects/p1/members/u2`, { headers })).ok(),
  ).toBe(true)
  const writes: string[] = []
  page.on('request', (sent) => {
    if (sent.method() === 'PUT' && sent.url() === fixture.assignmentUrl) writes.push(sent.url())
  })
  await area.getByRole('button', { name: protoLocales.zh.assignmentRefresh, exact: true }).click()
  await expect(
    area.getByText(protoLocales.zh.assignmentFormerUnavailable, { exact: true }),
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  await area.getByRole('button', { name: protoLocales.zh.assignmentClear, exact: true }).click()
  await expect(area.getByText(protoLocales.zh.assignmentEmpty, { exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
})

test('unknown assignment locks the original operation for explicit same-payload retry', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request),
    inputs: object[] = []
  const { area } = await member(page, fixture)
  await page.route('**/review-threads/*/assignment', async (route) => {
    inputs.push(route.request().postDataJSON())
    const response = await route.fetch()
    if (inputs.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await choose(page, area, 'Admin')
  await area.getByRole('button', { name: protoLocales.zh.assignmentSave, exact: true }).click()
  await expect(area.getByText(protoLocales.zh.assignmentUnknown, { exact: true })).toBeVisible()
  expect(inputs).toHaveLength(1)
  await expect(
    area.getByRole('button', { name: protoLocales.zh.assignmentEdit, exact: true }),
  ).toHaveCount(0)
  await expect(area.locator('.assignment-picker')).toHaveCount(0)
  await area.getByRole('button', { name: protoLocales.zh.assignmentRetry, exact: true }).click()
  await expect(area.getByText('Admin', { exact: true })).toBeVisible()
  expect(inputs).toHaveLength(2)
  expect(inputs[1]).toEqual(inputs[0])
})

test('assignment conflicts refresh only assignment while reply text, image and thread stay intact', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  const { drawer, area } = await member(page, fixture)
  await drawer
    .locator('textarea#review-feedback-text')
    .fill('Unsent reply after assignment conflict')
  await drawer.getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true }).setInputFiles({
    name: 'private.png',
    mimeType: 'image/png',
    buffer: Buffer.from('local draft'),
  })
  await fixture.assign('u1', 0)
  let queries = 0,
    writes = 0
  page.on('request', (sent) => {
    if (sent.url().endsWith('/review-threads/_query')) queries++
    if (sent.method() === 'PUT' && sent.url() === fixture.assignmentUrl) writes++
  })
  await choose(page, area, 'Admin')
  await area.getByRole('button', { name: protoLocales.zh.assignmentSave, exact: true }).click()
  await expect(area.getByText(protoLocales.zh.assignmentConflict, { exact: true })).toBeVisible()
  expect(writes).toBe(1)
  expect(queries).toBe(0)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue(
    'Unsent reply after assignment conflict',
  )
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackImageRemove, exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(fixture.thread.id)
})

test('query-only members see assignment without any candidate or mutation controls', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  await page.route('**/api/authorize/me', async (route) => {
    const response = await route.fetch(),
      body = await response.json()
    body.result.permissions.find(
      (permission: { id: string }) => permission.id === 'prototype-hub-version',
    ).actions = ['query']
    await route.fulfill({ response, json: body })
  })
  const candidates: string[] = []
  page.on('request', (sent) => {
    if (
      sent.url().endsWith('/assignment/_candidates') ||
      (sent.method() === 'PUT' && sent.url() === fixture.assignmentUrl)
    )
      candidates.push(sent.url())
  })
  const { area } = await member(page, fixture)
  await expect(area.getByText(protoLocales.zh.assignmentEmpty, { exact: true })).toBeVisible()
  await expect(
    area.getByRole('button', { name: protoLocales.zh.assignmentEdit, exact: true }),
  ).toHaveCount(0)
  await expect(
    area.getByRole('button', { name: protoLocales.zh.assignmentClear, exact: true }),
  ).toHaveCount(0)
  expect(candidates).toHaveLength(0)
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} assignee editor remains inside the viewport and supports keyboard selection`, async ({
    page,
    request,
  }, info) => {
    const fixture = await prepare(page, request)
    await page.setViewportSize({ width: 390, height: 844 })
    const { area } = await member(page, fixture, locale),
      text = protoLocales[locale]
    await area.getByRole('button', { name: text.assignmentEdit, exact: true }).click()
    const keyword = area.getByLabel(text.assignmentSearch, { exact: true })
    await keyword.fill('Admin')
    const searched = page.waitForResponse((response) =>
      response.url().endsWith('/assignment/_candidates'),
    )
    await keyword.press('Enter')
    expect((await searched).ok()).toBe(true)
    await keyword.focus()
    await keyword.press('Tab')
    await expect(
      area.getByRole('button', { name: text.assignmentSearchAction, exact: true }),
    ).toBeFocused()
    await page.keyboard.press('Tab')
    const picker = area.getByLabel(text.assignmentCandidate, { exact: true })
    await expect(picker).toBeFocused()
    await picker.press('ArrowDown')
    await picker.press('Enter')
    const save = area.getByRole('button', { name: text.assignmentSave, exact: true })
    await expect(save).toBeEnabled()
    for (const control of [keyword, area.locator('.assignment-picker'), save])
      await expect
        .poll(async () => {
          const box = await control.boundingBox()
          return (
            !!box &&
            box.x >= 0 &&
            box.x + box.width <= 390 &&
            (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          )
        })
        .toBe(true)
    await page.screenshot({
      path: info.outputPath(`review-assignment-editor-390-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await save.focus()
    await page.keyboard.press('Enter')
    await expect(area.getByText('Admin', { exact: true })).toBeVisible()
  })
