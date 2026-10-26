import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request as BrowserRequest,
} from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type {
  PrototypePage,
  PublicShare,
  ReviewContext,
  ReviewThread,
  Share,
} from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQrzjwHwAEiAJf6ZokFQAAAABJRU5ErkJggg==',
  'base64',
)
const upload = { name: 'private-draft.png', mimeType: 'image/png', buffer: png }
type Locale = 'zh' | 'en'
async function prepare(page: Page, request: APIRequestContext, locale: Locale = 'zh') {
  await login(page)
  const result = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await result.json()).result.find((row: Share) => row.token === 'open') as Share
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
  await page.evaluate(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  const grant = (
    await (await page.request.get(`${origin}/api/prototype-hub/public/shares/open`)).json()
  ).result as PublicShare
  const manifest = await page.request.get(`${origin}${grant.pagesUrl}`)
  const flat = (rows: PrototypePage[]): PrototypePage[] =>
    rows.flatMap((row) => [row, ...flat(row.children || [])])
  const selected = flat((await manifest.json()).result).find(
    (row) => !row.folder && row.pageId && row.path,
  )!
  const call = async (path: string, body = {}, csrf?: string) => {
    const response = await page.request.post(
      `${origin}/api/prototype-hub/public/shares/open/review/${path}`,
      {
        headers: csrf ? { 'X-Review-CSRF': csrf } : {},
        data: { revisionId: grant.revisionId, accessKey: grant.accessKey, ...body },
      },
    )
    expect(response.ok()).toBe(true)
    return (await response.json()).result
  }
  let identity = (await call('context')) as ReviewContext
  identity = await call('unverified', { displayName: 'Q0 visitor' }, identity.csrfToken)
  const threads: ReviewThread[] = []
  for (let index = 0; index < 20; index++)
    threads.push(
      await call(
        'threads',
        {
          pageId: selected.pageId,
          text: `Q0 question ${index + 1}`,
          clientRequestId: crypto.randomUUID(),
        },
        identity.csrfToken,
      ),
    )
  return {
    threads,
    link: (base: string, thread = threads.at(-1)!) =>
      `${base}?${new URLSearchParams({ revisionId: thread.revisionId, pageId: thread.pageId, threadId: thread.id })}`,
  }
}
const drawer = (page: Page, locale: Locale = 'zh') =>
  page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
const action = (
  area: Locator,
  key:
    | 'feedbackBackToList'
    | 'feedbackContinue'
    | 'feedbackNew'
    | 'feedbackImageRemove'
    | 'feedbackSubmit'
    | 'feedbackLeaveConfirm'
    | 'assignmentEdit'
    | 'assignmentSave'
    | 'assignmentRetry',
  locale: Locale = 'zh',
) => area.getByRole('button', { name: protoLocales[locale][key], exact: true })
const confirmation = (page: Page, locale: Locale = 'zh') =>
  page.getByRole('dialog', { name: protoLocales[locale].feedbackLeaveTitle, exact: true })
async function returnList(area: Locator, locale: Locale = 'zh') {
  await action(area, 'feedbackBackToList', locale).click()
  await expect(
    area.getByRole('heading', { name: protoLocales[locale].feedbackPageList, exact: true }),
  ).toBeFocused()
  await expect(area.locator('.feedback-thread')).toHaveCount(20)
}
async function multipart(request: BrowserRequest) {
  const bytes = request.postDataBuffer()
  expect(bytes).not.toBeNull()
  const form = await new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': (await request.allHeaders())['content-type']! },
    body: new Uint8Array(bytes!),
  }).formData()
  expect([...form.keys()].sort()).toEqual(['image', 'request'])
  const image = form.get('image') as File
  expect(Buffer.from(await image.arrayBuffer())).toEqual(png)
  return {
    request: await (form.get('request') as File).text(),
    image: Buffer.from(await image.arrayBuffer()),
  }
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('twenty-row member feedback separates finding from communication and visually returns without changing its draft', async ({
  page,
  request,
}, info) => {
  const fixture = await prepare(page, request)
  const current = fixture.threads.at(-1)!
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(fixture.link('preview/p1/v1'))
  const area = drawer(page)
  const heading = area.getByRole('heading', { name: current.summary, exact: true })
  await expect(heading).toBeFocused()
  await expect(area.locator('.feedback-thread')).toHaveCount(0)
  const bounds = await heading.boundingBox()
  expect(bounds!.y).toBeLessThan(1000)
  await expect(area.locator('.feedback-assignment')).toContainText(protoLocales.zh.assignmentEmpty)
  await area.locator('textarea').fill('Draft kept on visual return')
  await area.getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true }).setInputFiles(upload)
  const preview = await area.getByAltText(protoLocales.zh.feedbackImageDraftAlt).getAttribute('src')
  await returnList(area)
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(current.id)
  await area.getByRole('button', { name: current.summary, exact: true }).click()
  await expect(heading).toBeFocused()
  await expect(confirmation(page)).toHaveCount(0)
  await expect(area.locator('textarea')).toHaveValue('Draft kept on visual return')
  await expect(area.getByAltText(protoLocales.zh.feedbackImageDraftAlt)).toHaveAttribute(
    'src',
    preview!,
  )
  await action(area, 'feedbackImageRemove').click()
  await area
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackInternal })
    .click()
  await action(area, 'feedbackSubmit').click()
  await expect(area.locator('.feedback-internal .feedback-text')).toHaveText(
    'Draft kept on visual return',
  )
  await area
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackPublic })
    .click()
  await area.locator('textarea').fill('A public answer')
  await action(area, 'feedbackSubmit').click()
  await expect(area.locator('.feedback-text').filter({ hasText: 'A public answer' })).toBeVisible()
  await page.screenshot({
    path: info.outputPath('q0-member-detail-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
})

test('an unknown image reply survives cancel and same-thread return with the exact original payload and request key', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  await page.goto(fixture.link('share/open'))
  const area = drawer(page),
    payloads: Awaited<ReturnType<typeof multipart>>[] = []
  await page.route('**/review/threads/*/messages-with-image', async (route) => {
    payloads.push(await multipart(route.request()))
    const response = await route.fetch()
    if (payloads.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await area.locator('textarea').fill('Unknown Q0 reply')
  await area.getByLabel(protoLocales.zh.feedbackImageSelect).setInputFiles(upload)
  await action(area, 'feedbackSubmit').click()
  await expect(area.getByText(protoLocales.zh.feedbackResultUnknown, { exact: true })).toBeVisible()
  await returnList(area)
  const other = fixture.threads.at(-2)!
  await area.getByRole('button', { name: other.summary, exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmation(page)).toHaveCount(0)
  await expect(area).toBeVisible()
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(fixture.threads.at(-1)!.id)
  await action(area, 'feedbackContinue').click()
  await expect(area.locator('textarea')).toHaveValue('Unknown Q0 reply')
  await expect(area.getByAltText(protoLocales.zh.feedbackImageDraftAlt)).toBeVisible()
  await action(area, 'feedbackSubmit').click()
  await expect(area.locator('textarea')).toHaveValue('')
  expect(payloads).toHaveLength(2)
  expect(payloads[1]).toEqual(payloads[0])
  await expect(area.locator('.feedback-text').filter({ hasText: 'Unknown Q0 reply' })).toHaveCount(
    1,
  )
  await expect(area.locator('.feedback-assignment')).toHaveCount(0)
  await expect(
    area.getByRole('radio', { name: protoLocales.zh.feedbackInternal, exact: true }),
  ).toHaveCount(0)
})

test('assignment editing, a busy request and an unknown result protect target changes without discarding its original retry', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  await page.goto(fixture.link('preview/p1/v1'))
  const area = drawer(page),
    assignment = area.locator('.feedback-assignment')
  await action(assignment, 'assignmentEdit').click()
  await assignment.locator('.ant-select-selector').click()
  await page
    .locator(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content',
    )
    .filter({ hasText: 'Admin' })
    .click()
  await returnList(area)
  const other = fixture.threads.at(-2)!
  await area.getByRole('button', { name: other.summary, exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await action(area, 'feedbackContinue').click()
  await expect(assignment.locator('.assignment-picker')).toContainText('Admin')
  const payloads: string[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/review-threads/*/assignment', async (route) => {
    payloads.push(route.request().postData()!)
    if (payloads.length === 1) {
      await held
      await route.fetch()
      await route.abort('failed')
    } else await route.fulfill({ response: await route.fetch() })
  })
  await action(assignment, 'assignmentSave').click()
  await returnList(area)
  await expect(area.getByRole('button', { name: other.summary, exact: true })).toBeDisabled()
  release()
  await expect(area.getByRole('button', { name: other.summary, exact: true })).toBeEnabled()
  await area.getByRole('button', { name: other.summary, exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await action(area, 'feedbackContinue').click()
  await expect(
    assignment.getByText(protoLocales.zh.assignmentUnknown, { exact: true }),
  ).toBeVisible()
  await action(assignment, 'assignmentRetry').click()
  await expect(assignment.locator('.assignment-picker')).toHaveCount(0)
  expect(payloads).toHaveLength(2)
  expect(payloads[1]).toBe(payloads[0])
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(fixture.threads.at(-1)!.id)
})

test('new feedback is an explicit guarded transition and returning from a new image draft keeps the same task', async ({
  page,
  request,
}) => {
  const fixture = await prepare(page, request)
  await page.goto(fixture.link('share/open'))
  const area = drawer(page)
  await area.locator('textarea').fill('Existing draft')
  await returnList(area)
  await action(area, 'feedbackNew').click()
  await expect(confirmation(page)).toBeVisible()
  await confirmation(page).getByRole('button', { name: '取消', exact: true }).click()
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(fixture.threads.at(-1)!.id)
  await action(area, 'feedbackNew').click()
  await action(confirmation(page), 'feedbackLeaveConfirm').click()
  await expect(
    area.getByRole('heading', { name: protoLocales.zh.feedbackNew, exact: true }),
  ).toBeFocused()
  expect(new URL(page.url()).searchParams.has('threadId')).toBe(false)
  await expect(area.locator('textarea')).toHaveValue('')
  await area.locator('textarea').fill('A new draft')
  await area.getByLabel(protoLocales.zh.feedbackImageSelect).setInputFiles(upload)
  await returnList(area)
  await area
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackResolved })
    .click()
  await expect(confirmation(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmation(page)).toHaveCount(0)
  await expect(area).toBeVisible()
  await expect(
    area.getByRole('heading', { name: protoLocales.zh.feedbackPageList, exact: true }),
  ).toBeVisible()
  await expect
    .poll(() => area.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true)
  await action(area, 'feedbackNew').click()
  await expect(confirmation(page)).toHaveCount(0)
  await expect(area.locator('textarea')).toHaveValue('A new draft')
  await expect(area.getByAltText(protoLocales.zh.feedbackImageDraftAlt)).toBeVisible()
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} keeps twenty-row navigation, confirmation and task focus keyboard accessible`, async ({
    page,
    request,
  }, info) => {
    const fixture = await prepare(page, request, locale)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(fixture.link('preview/p1/v1'))
    const area = drawer(page, locale),
      text = protoLocales[locale]
    await expect(
      area.getByRole('heading', { name: fixture.threads.at(-1)!.summary, exact: true }),
    ).toBeFocused()
    await area.locator('textarea').fill('Keep my keyboard draft')
    await returnList(area, locale)
    const pager = area.locator('.feedback-pagination')
    await pager.scrollIntoViewIfNeeded()
    await expect(pager).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`q0-list-${locale}-390.png`),
      fullPage: true,
      animations: 'disabled',
    })
    const other = area.getByRole('button', { name: fixture.threads.at(-2)!.summary, exact: true })
    await other.focus()
    await page.keyboard.press('Enter')
    const modal = confirmation(page, locale)
    await expect(modal).toBeVisible()
    await expect
      .poll(async () => {
        const box = await modal.boundingBox()
        return (
          !!box &&
          box.x >= 0 &&
          box.x + box.width <= 390 &&
          (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        )
      })
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await action(area, 'feedbackContinue', locale).click()
    await expect(area.locator('textarea')).toHaveValue('Keep my keyboard draft')
    await expect(
      area.getByRole('heading', { name: fixture.threads.at(-1)!.summary, exact: true }),
    ).toBeFocused()
    await page.screenshot({
      path: info.outputPath(`q0-detail-${locale}-390.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await expect(area.getByRole('button', { name: text.feedbackSubmit, exact: true })).toBeVisible()
  })
