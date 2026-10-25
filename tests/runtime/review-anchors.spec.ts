import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { login } from '../e2e/system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { ReviewAnchor, ReviewThread, Share } from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187',
  headers = { 'X-Access-Token': 'mock-admin' }
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQrzjwHwAEiAJf6ZokFQAAAABJRU5ErkJggg==',
  'base64',
)
type Locale = 'zh' | 'en'
const words = (locale: Locale = 'zh') => protoLocales[locale]
const frame = (page: Page) => page.frameLocator('.frame-stage > iframe')
const drawer = (page: Page, locale: Locale = 'zh') =>
  page.getByRole('dialog', { name: words(locale).feedback, exact: true })
async function prepare(page: Page, request: APIRequestContext, locale: Locale = 'zh') {
  await login(page)
  const result = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await result.json()).result.find((row: Share) => row.token === 'open') as Share
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
  await page.evaluate(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  await page.goto('share/open')
  await expect(frame(page).locator('[data-review-anchor-surface]')).toHaveCount(1)
  await page.getByRole('button', { name: words(locale).feedback, exact: true }).click()
  return drawer(page, locale)
}
async function authenticate(page: Page, locale: Locale = 'zh') {
  const text = words(locale),
    discussion = drawer(page, locale)
  await discussion.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
  await identity.getByRole('button', { name: text.reviewUseUnverified, exact: true }).click()
  await identity.getByLabel(text.reviewName, { exact: true }).fill('Anchor visitor')
  await identity.getByRole('button', { name: text.reviewCreateUnverified, exact: true }).click()
  await expect(identity.getByText(text.reviewUnverified, { exact: true })).toBeVisible()
  await identity.getByRole('button', { name: text.feedbackReturn, exact: true }).click()
  await expect(discussion).toBeVisible()
}
async function draw(page: Page, shape: ReviewAnchor['shape'], locale: Locale = 'zh') {
  await drawer(page, locale)
    .getByRole('button', { name: words(locale)[`anchor${shape}`], exact: true })
    .click()
  await expect(drawer(page, locale)).toBeHidden()
  const surface = frame(page).locator('[data-review-anchor-surface]')
  await expect(surface).toBeVisible()
  await expect(page.getByText(words(locale).anchorDrawingHint, { exact: true })).toBeVisible()
  return surface
}
async function point(page: Page, locale: Locale = 'zh') {
  const surface = await draw(page, 'point', locale)
  await surface.click({ position: { x: 100, y: 140 } })
  await expect(drawer(page, locale)).toBeVisible()
}
async function submit(page: Page, text: string, image = false, locale: Locale = 'zh') {
  const discussion = drawer(page, locale)
  await discussion.locator('textarea').fill(text)
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith(image ? '/threads/_with-image' : '/review/threads') &&
      response.request().method() === 'POST',
  )
  await discussion.getByRole('button', { name: words(locale).feedbackSubmit, exact: true }).click()
  const result = await response
  expect(result.ok()).toBe(true)
  const thread = (await result.json()).result as ReviewThread
  await expect(discussion.locator('.feedback-text')).toContainText(text)
  return thread
}
async function located(page: Page, anchor: ReviewAnchor) {
  await expect(frame(page).locator('[data-review-anchor-surface]')).toBeVisible()
  const projection = await frame(page)
    .locator('[data-review-anchor-marker]')
    .evaluate((element) => ({
      left: parseFloat((element as HTMLElement).style.left),
      top: parseFloat((element as HTMLElement).style.top),
      width: parseFloat((element as HTMLElement).style.width),
      height: parseFloat((element as HTMLElement).style.height),
      x: scrollX,
      y: scrollY,
    }))
  expect(projection.left).toBe(anchor.x - projection.x - (anchor.shape === 'point' ? 6 : 0))
  expect(projection.top).toBe(anchor.y - projection.y - (anchor.shape === 'point' ? 6 : 0))
  expect(projection.width).toBe(anchor.shape === 'point' ? 12 : anchor.width)
  expect(projection.height).toBe(anchor.shape === 'point' ? 12 : anchor.height)
}
test.use({ deviceScaleFactor: 2 })
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${origin}/__test/reset`)).ok()).toBe(true)
})

test('captures root CSS coordinates after scrolling and more than three seconds of drawing, then locates only on explicit action', async ({
  page,
  request,
}, testInfo) => {
  const discussion = await prepare(page, request)
  await authenticate(page)
  await discussion.getByRole('button', { name: '关闭', exact: true }).click()
  await frame(page)
    .locator('html')
    .evaluate(() => window.scrollTo(120, 500))
  await page.getByRole('button', { name: words().feedback, exact: true }).click()
  const surface = await draw(page, 'point')
  // A human may think or use the keyboard for longer than the initialization deadline.
  await page.waitForTimeout(3200)
  await expect(surface).toBeVisible()
  await expect(discussion).toBeHidden()
  await surface.click({ position: { x: 100, y: 140 } })
  await expect(discussion).toBeVisible()
  const thread = await submit(page, 'Root point after scroll')
  expect(thread.anchor).toMatchObject({
    space: 'root-document-css-px-v1',
    shape: 'point',
    x: 220,
    y: 640,
    width: 0,
    height: 0,
    documentWidth: 1600,
    documentHeight: 2200,
  })
  expect(Object.keys(thread.anchor!)).toHaveLength(10)
  await expect(surface).toBeHidden()
  await discussion.getByRole('button', { name: words().anchorLocate, exact: true }).click()
  await located(page, thread.anchor!)
  await page.screenshot({ path: testInfo.outputPath('desktop-root-anchor.png') })
  const url = new URL(page.url())
  expect([...url.searchParams.keys()].sort()).toEqual(['pageId', 'revisionId', 'threadId'])
  expect(url.hash).toBe('')
})

test('creates rectangle with a first image atomically and retries the complete unchanged multipart geometry receipt', async ({
  page,
  request,
}) => {
  const discussion = await prepare(page, request)
  await authenticate(page)
  await discussion
    .locator('input[type=file]')
    .setInputFiles({ name: 'private-anchor.png', mimeType: 'image/png', buffer: png })
  const surface = await draw(page, 'rect')
  await surface.hover({ position: { x: 70, y: 90 } })
  await page.mouse.down()
  await surface.hover({ position: { x: 170, y: 190 } })
  await page.mouse.up()
  await expect(discussion).toBeVisible()
  const bodies: Record<string, unknown>[] = [],
    files: Buffer[] = []
  await page.route('**/review/threads/_with-image', async (route) => {
    const outgoing = route.request(),
      bytes = outgoing.postDataBuffer()
    expect(bytes).not.toBeNull()
    const form = await new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': (await outgoing.allHeaders())['content-type']! },
      body: new Uint8Array(bytes!),
    }).formData()
    expect([...form.keys()]).toEqual(['request', 'image'])
    expect((form.get('image') as File).name).toBe('image')
    bodies.push(JSON.parse(await (form.get('request') as Blob).text()))
    files.push(Buffer.from(await (form.get('image') as Blob).arrayBuffer()))
    if (bodies.length === 1) {
      const committed = await route.fetch()
      expect(committed.ok()).toBe(true)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ status: 503, success: false }),
      })
    } else await route.continue()
  })
  await discussion.locator('textarea').fill('Rectangle with image')
  await discussion.getByRole('button', { name: words().feedbackSubmit, exact: true }).click()
  await expect(discussion.getByText(words().feedbackResultUnknown, { exact: true })).toBeVisible()
  const thread = await submit(page, 'Rectangle with image', true)
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toEqual(bodies[0])
  expect(files).toEqual([png, png])
  expect(thread.anchor).toMatchObject({ shape: 'rect', x: 70, y: 90, width: 100, height: 100 })
  await expect(
    discussion.getByRole('button', { name: words().feedbackImageView, exact: true }),
  ).toBeVisible()
  expect(bodies[0]!.anchor).toEqual(thread.anchor)
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} captures ellipse by keyboard or two corners, cancels replacement without losing the draft`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const discussion = await prepare(page, request, locale)
    await discussion.locator('textarea').fill('Retained position draft')
    const surface = await draw(page, 'ellipse', locale)
    if (locale === 'zh') {
      await surface.press('Enter')
      await surface.press('Shift+ArrowRight')
      await surface.press('Shift+ArrowDown')
      await surface.press('Enter')
    } else {
      await surface.click({ position: { x: 40, y: 60 } })
      await expect(discussion).toBeHidden()
      await surface.click({ position: { x: 90, y: 110 } })
    }
    await expect(discussion).toBeVisible()
    await expect(discussion.locator('textarea')).toHaveValue('Retained position draft')
    await expect(
      discussion.getByRole('status').filter({ hasText: locale === 'zh' ? '已选择' : 'selected' }),
    ).toBeVisible()
    const replacing = await draw(page, 'point', locale)
    await replacing.press('Escape')
    await expect(discussion).toBeVisible()
    await expect(discussion.locator('textarea')).toHaveValue('Retained position draft')
    await authenticate(page, locale)
    const thread = await submit(page, 'Retained position draft', false, locale)
    expect(thread.anchor?.shape).toBe('ellipse')
    expect(thread.anchor?.width).toBe(locale === 'zh' ? 10 : 50)
    expect(thread.anchor?.height).toBe(locale === 'zh' ? 10 : 50)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`anchor-mobile-${locale}.png`) })
  })

test('member reads an anchored thread without automatic runtime projection and invalidates the explicit marker on resize', async ({
  page,
  request,
}, testInfo) => {
  const discussion = await prepare(page, request)
  await authenticate(page)
  await point(page)
  const thread = await submit(page, 'Member location')
  await page.goto(
    `preview/p1/v1?${new URLSearchParams({ revisionId: thread.revisionId, pageId: thread.pageId, threadId: thread.id })}`,
  )
  await expect(discussion.locator('.feedback-text')).toContainText('Member location')
  await expect(frame(page).locator('[data-review-anchor-surface]')).toBeHidden()
  await expect(
    discussion.getByRole('button', { name: words().anchorpoint, exact: true }),
  ).toHaveCount(0)
  await discussion.getByRole('button', { name: words().anchorLocate, exact: true }).click()
  await located(page, thread.anchor!)
  await page.screenshot({ path: testInfo.outputPath('member-anchor.png') })
  await page.setViewportSize({ width: 1100, height: 700 })
  await expect(page.getByText(words().anchorUnavailable, { exact: true })).toBeVisible()
  await expect(frame(page).locator('[data-review-anchor-surface]')).toBeHidden()
})

test('layout changes cancel drawing without submitting or losing the text and image draft', async ({
  page,
  request,
}) => {
  const discussion = await prepare(page, request)
  await discussion.locator('textarea').fill('Never auto submit')
  await discussion
    .locator('input[type=file]')
    .setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer: png })
  const sent: string[] = []
  page.on('request', (outgoing) => {
    if (
      outgoing.url().endsWith('/review/threads') ||
      outgoing.url().endsWith('/threads/_with-image')
    )
      sent.push(outgoing.method())
  })
  await draw(page, 'rect')
  await page.setViewportSize({ width: 1000, height: 720 })
  await expect(discussion).toBeVisible()
  await expect(discussion.locator('textarea')).toHaveValue('Never auto submit')
  await expect(
    discussion.getByAltText(words().feedbackImageDraftAlt, { exact: true }),
  ).toBeVisible()
  expect(sent).toEqual([])
  await expect(frame(page).locator('[data-review-anchor-surface]')).toBeHidden()
})

test('root navigation and hash changes cannot attach geometry to the shell selected page', async ({
  page,
  request,
}) => {
  const discussion = await prepare(page, request)
  await discussion.getByRole('button', { name: '关闭', exact: true }).click()
  await frame(page).locator('#navigate').click()
  await expect(frame(page).locator('body')).toBeVisible()
  await page.getByRole('button', { name: words().feedback, exact: true }).click()
  await discussion.getByRole('button', { name: words().anchorpoint, exact: true }).click()
  await expect(discussion).toBeVisible()
  await expect(page.getByText(words().anchorUnavailable, { exact: true })).toBeVisible()
  await expect(frame(page).locator('[data-review-anchor-surface]')).toBeHidden()
  await discussion.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: words().feedback, exact: true }).click()
  await draw(page, 'point')
  await frame(page)
    .locator('html')
    .evaluate(() => {
      location.hash = 'internal-state'
    })
  await expect(discussion).toBeVisible()
  await expect(frame(page).locator('[data-review-anchor-surface]')).toBeHidden()
})

test('nested, unrelated opaque and previous-generation messages cannot finish a root drawing or leak capabilities', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'PROTOTYPE_REVIEW_ANCHOR_COMMAND')
        (window as unknown as { anchorCommands: unknown[] }).anchorCommands = [
          ...((window as unknown as { anchorCommands?: unknown[] }).anchorCommands || []),
          event.data,
        ]
    })
  })
  const discussion = await prepare(page, request)
  const surface = await draw(page, 'point')
  const command = await frame(page)
    .locator('html')
    .evaluate(
      () =>
        (window as unknown as { anchorCommands: Record<string, unknown>[] }).anchorCommands.at(-1)!,
    )
  expect(Object.keys(command).sort()).toEqual([
    'action',
    'channel',
    'generation',
    'prefixLength',
    'resourcePath',
    'shape',
    'type',
  ])
  const fake = {
    type: 'PROTOTYPE_REVIEW_ANCHOR_EVENT',
    channel: command.channel,
    generation: command.generation,
    status: 'captured',
    anchor: {
      space: 'root-document-css-px-v1',
      shape: 'point',
      x: 1,
      y: 1,
      width: 0,
      height: 0,
      documentWidth: 1600,
      documentHeight: 2200,
      viewportWidth: 800,
      viewportHeight: 600,
    },
  }
  await frame(page)
    .frameLocator('iframe')
    .locator('body')
    .evaluate((_, message) => top!.postMessage(message, '*'), fake)
  await page.evaluate((message) => {
    const other = document.createElement('iframe')
    other.sandbox.add('allow-scripts')
    other.srcdoc = `<script>parent.postMessage(${JSON.stringify(message)},'*')<` + '/script>'
    document.body.append(other)
  }, fake)
  await expect(discussion).toBeHidden()
  await expect(surface).toBeVisible()
  await frame(page)
    .locator('html')
    .evaluate(
      (_, message) =>
        top!.postMessage({ ...message, generation: Number(message.generation) - 1 }, '*'),
      fake,
    )
  await expect(discussion).toBeHidden()
  // The root overlay covers the child iframe; a point over its outer rectangle never clicks its content.
  await surface.click({ position: { x: 150, y: 240 } })
  await expect(discussion).toBeVisible()
  expect(
    await frame(page).frameLocator('iframe').locator('body').getAttribute('data-clicked'),
  ).toBeNull()
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  )
})
