import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { ReviewMessage, Share } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQrzjwHwAEiAJf6ZokFQAAAABJRU5ErkJggg==',
  'base64',
)
const upload = { name: 'private-customer-filename.png', mimeType: 'image/png', buffer: png }
type Locale = 'zh' | 'en'

async function open(page: Page, locale: Locale = 'zh') {
  await page.getByRole('button', { name: protoLocales[locale].feedback, exact: true }).click()
  return page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
}
async function seed(page: Page, request: APIRequestContext, locale: Locale = 'zh') {
  await login(page)
  const result = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await result.json()).result.find((row: Share) => row.token === 'open') as Share
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
  await page.evaluate(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  await page.goto('share/open')
  const drawer = await open(page, locale),
    text = protoLocales[locale]
  await expect(drawer.getByLabel(text.feedbackImageSelect, { exact: true })).toBeVisible()
  await expect(
    drawer.getByRole('button', { name: text.feedbackSubmit, exact: true }),
  ).toBeDisabled()
  await drawer.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
  await identity.getByRole('button', { name: text.reviewUseUnverified, exact: true }).click()
  await identity.getByLabel(text.reviewName, { exact: true }).fill('Image visitor')
  await identity.getByRole('button', { name: text.reviewCreateUnverified, exact: true }).click()
  await expect(identity.getByText(text.reviewUnverified, { exact: true })).toBeVisible()
  await identity.getByRole('button', { name: text.feedbackReturn, exact: true }).click()
  await drawer.locator('textarea#review-feedback-text').fill('Image question')
  await drawer.getByRole('button', { name: text.feedbackSubmit, exact: true }).click()
  await expect(drawer.locator('.feedback-text')).toHaveText('Image question')
  return drawer
}
async function sendImage(page: Page, drawer: Locator, caption: string, locale: Locale = 'zh') {
  await drawer.locator('textarea#review-feedback-text').fill(caption)
  const reply = page.waitForResponse((response) => response.url().endsWith('/messages-with-image'))
  await drawer
    .getByRole('button', { name: protoLocales[locale].feedbackSubmit, exact: true })
    .click()
  const response = await reply
  expect(response.ok()).toBe(true)
  await expect(drawer.locator('.feedback-text').filter({ hasText: caption })).toBeVisible()
  return (await response.json()).result as ReviewMessage
}
async function view(drawer: Locator, locale: Locale = 'zh') {
  await drawer
    .getByRole('button', { name: protoLocales[locale].feedbackImageView, exact: true })
    .click()
  const image = drawer.getByAltText(protoLocales[locale].feedbackImageAlt, { exact: true })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1)
  return image
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('public image replies require text and manual upload/view, with no filename or runtime capability', async ({
  page,
  request,
}, info) => {
  const runtime: Promise<{ headers: Record<string, string>; url: string; body: string }>[] = []
  const content: string[] = [],
    writes: string[] = []
  page.on('request', (outgoing) => {
    if (outgoing.url().includes('/runtime/'))
      runtime.push(
        outgoing
          .allHeaders()
          .then((headers) => ({ headers, url: outgoing.url(), body: outgoing.postData() || '' })),
      )
    if (/\/messages\/[^/]+\/image$/.test(outgoing.url())) content.push(outgoing.url())
    if (outgoing.url().endsWith('/messages-with-image')) writes.push(outgoing.url())
  })
  const drawer = await seed(page, request)
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles(upload)
  const preview = drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true })
  await expect(preview).toBeVisible()
  await expect
    .poll(() => preview.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1)
  await expect(drawer).not.toContainText(upload.name)
  expect(writes).toHaveLength(0)
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.feedbackTextRequired, { exact: true }),
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  const message = await sendImage(page, drawer, 'Manual screenshot caption')
  expect(message.image).toEqual({ contentType: 'image/png', size: png.length, width: 1, height: 1 })
  expect(content).toHaveLength(0)
  await expect(preview).toHaveCount(0)
  const image = await view(drawer)
  expect(await image.getAttribute('src')).toMatch(/^blob:/)
  expect(content).toHaveLength(1)
  await page.screenshot({
    path: info.outputPath('review-images-public-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackImageHide, exact: true }).click()
  await expect(image).toHaveCount(0)
  const observed = await Promise.all(runtime)
  expect(observed.length).toBeGreaterThan(0)
  for (const item of observed) {
    expect(item.headers['x-review-csrf']).toBeUndefined()
    expect(item.headers.cookie || '').not.toContain('mock-review')
    expect(item.body).not.toContain('Manual screenshot caption')
    expect(item.url).not.toMatch(/blob:|private-customer|messages-with-image/)
  }
  expect(await page.locator('.frame-stage > iframe').getAttribute('src')).not.toMatch(
    /blob:|private-customer|Manual/,
  )
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(
    /blob:|private-customer|Manual screenshot/,
  )
})

test('an unknown committed upload waits for manual same-key retry and creates one image message', async ({
  page,
  request,
}) => {
  const drawer = await seed(page, request),
    keys: string[] = []
  await page.route('**/review/threads/*/messages-with-image', async (route) => {
    const body = route.request().postDataBuffer()!.toString()
    const key = /"clientRequestId":"([^"]+)"/.exec(body)?.[1]
    expect(key).toBeTruthy()
    keys.push(key!)
    const response = await route.fetch()
    if (keys.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles(upload)
  await drawer.locator('textarea#review-feedback-text').fill('Retry screenshot')
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.feedbackResultUnknown, { exact: true }),
  ).toBeVisible()
  expect(keys).toHaveLength(1)
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toBeVisible()
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('Retry screenshot')
  await sendImage(page, drawer, 'Retry screenshot')
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  await expect(drawer.locator('.feedback-text')).toHaveText(['Image question', 'Retry screenshot'])
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackImageView, exact: true }),
  ).toHaveCount(1)
})

test('member internal image metadata and content are absent from the visitor response and cannot be read by its ID', async ({
  page,
  request,
}, info) => {
  await seed(page, request)
  await page.goto('preview/p1/v1')
  let drawer = await open(page)
  await drawer.getByRole('button', { name: 'Image question', exact: true }).click()
  await drawer
    .locator('.ant-radio-button-wrapper')
    .filter({ hasText: protoLocales.zh.feedbackInternal })
    .click()
  await expect(
    drawer.getByRole('radio', { name: protoLocales.zh.feedbackInternal, exact: true }),
  ).toBeChecked()
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles(upload)
  const internal = await sendImage(page, drawer, 'Internal screenshot caption')
  await view(drawer)
  await page.screenshot({
    path: info.outputPath('review-images-member-internal-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.goto('share/open')
  drawer = await open(page)
  const queried = page.waitForResponse((response) =>
    response.url().endsWith(`/threads/${internal.threadId}/messages/_query`),
  )
  await drawer
    .getByRole('button', { name: protoLocales.zh.feedbackBackToList, exact: true })
    .click()
  await drawer.getByRole('button', { name: 'Image question', exact: true }).click()
  const response = await queried,
    body = await response.json()
  expect(body.result.total).toBe(1)
  expect(body.result.data).toHaveLength(1)
  expect(body.result.data[0].image).toBeNull()
  expect(JSON.stringify(body)).not.toMatch(/Internal screenshot|image\/png/)
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackImageView, exact: true }),
  ).toHaveCount(0)
  const denied = await page.request.post(
    `${origin}/api/prototype-hub/public/shares/open/review/threads/${internal.threadId}/messages/${internal.id}/image`,
    {
      data: response.request().postDataJSON(),
      headers: {
        'X-Review-CSRF': (await response.request().allHeaders())['x-review-csrf']!,
        Origin: origin,
      },
    },
  )
  expect(denied.status()).toBe(404)
  expect(denied.headers()['content-type']).not.toContain('image/')
})

test('type and size hints prevent upload while server byte validation retains the explicit draft', async ({
  page,
  request,
}) => {
  const drawer = await seed(page, request),
    writes: string[] = []
  page.on('request', (outgoing) => {
    if (outgoing.url().endsWith('/messages-with-image')) writes.push(outgoing.url())
  })
  const input = drawer.getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
  await input.setInputFiles({
    name: 'vector.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  })
  await expect(
    drawer.getByText(protoLocales.zh.feedbackImageInvalid, { exact: true }),
  ).toBeVisible()
  await input.setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toHaveCount(0)
  expect(writes).toHaveLength(0)
  await input.setInputFiles({
    name: 'spoofed.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  })
  await drawer.locator('textarea#review-feedback-text').fill('Keep invalid caption')
  const rejected = page.waitForResponse((response) =>
    response.url().endsWith('/messages-with-image'),
  )
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  expect((await rejected).status()).toBe(400)
  await expect(
    drawer.getByText(protoLocales.zh.feedbackImageInvalid, { exact: true }),
  ).toBeVisible()
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('Keep invalid caption')
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackImageRemove, exact: true }),
  ).toBeVisible()
  expect(writes).toHaveLength(1)
  await drawer
    .getByRole('button', { name: protoLocales.zh.feedbackImageRemove, exact: true })
    .click()
  const plain = page.waitForResponse((response) =>
    /\/threads\/[^/]+\/messages$/.test(response.url()),
  )
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  expect((await plain).ok()).toBe(true)
  await expect(
    drawer.locator('.feedback-text').filter({ hasText: 'Keep invalid caption' }),
  ).toBeVisible()
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} image selection, removal and viewing remain labelled and keyboard accessible`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const drawer = await seed(page, request, locale),
      text = protoLocales[locale]
    const input = drawer.getByLabel(text.feedbackImageSelect, { exact: true })
    await drawer.locator('textarea#review-feedback-text').focus()
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await input.setInputFiles(upload)
    await input.focus()
    await page.keyboard.press('Tab')
    const remove = drawer.getByRole('button', { name: text.feedbackImageRemove, exact: true })
    await expect(remove).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(drawer.getByAltText(text.feedbackImageDraftAlt, { exact: true })).toHaveCount(0)
    await input.setInputFiles(upload)
    await drawer.locator('textarea#review-feedback-text').fill('Keyboard image caption')
    await remove.focus()
    await page.keyboard.press('Tab')
    const send = drawer.getByRole('button', { name: text.feedbackSubmit, exact: true })
    await expect(send).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(
      drawer.locator('.feedback-text').filter({ hasText: 'Keyboard image caption' }),
    ).toBeVisible()
    const trigger = drawer.getByRole('button', { name: text.feedbackImageView, exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const image = drawer.getByAltText(text.feedbackImageAlt, { exact: true })
    await expect(image).toBeVisible()
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(1)
    for (const control of [input, send, image])
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
      path: info.outputPath(`review-images-public-390-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  })
