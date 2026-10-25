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
import type { ReviewThread, Share } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQrzjwHwAEiAJf6ZokFQAAAABJRU5ErkJggg==',
  'base64',
)
const upload = { name: 'private-first-image.png', mimeType: 'image/png', buffer: png }
const metadata = { contentType: 'image/png', size: png.length, width: 1, height: 1 }
type Locale = 'zh' | 'en'

async function prepare(page: Page, request: APIRequestContext, locale: Locale = 'zh') {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await response.json()).result.find((row: Share) => row.token === 'open') as Share
  const policy = await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers,
    data: {
      enabled: true,
      allowUnverified: true,
      allowComment: true,
      expectedVersion: share.configVersion,
    },
  })
  expect(policy.ok()).toBe(true)
  await page.evaluate(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  await page.goto('share/open')
  await page.getByRole('button', { name: protoLocales[locale].feedback, exact: true }).click()
  return page.getByRole('dialog', { name: protoLocales[locale].feedback, exact: true })
}
async function authenticate(page: Page, drawer: Locator, locale: Locale = 'zh', email = false) {
  const text = protoLocales[locale]
  await drawer.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
  const identity = page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
  if (email)
    await identity.getByLabel(text.reviewEmail, { exact: true }).fill('first-image@example.invalid')
  else await identity.getByRole('button', { name: text.reviewUseUnverified, exact: true }).click()
  await identity.getByLabel(text.reviewName, { exact: true }).fill('First image visitor')
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
async function create(page: Page, drawer: Locator, caption: string, locale: Locale = 'zh') {
  await drawer.locator('textarea#review-feedback-text').fill(caption)
  const creating = page.waitForResponse((response) =>
    response.url().endsWith('/threads/_with-image'),
  )
  const querying = page.waitForResponse((response) =>
    /\/threads\/[^/]+\/messages\/_query$/.test(response.url()),
  )
  await drawer
    .getByRole('button', { name: protoLocales[locale].feedbackSubmit, exact: true })
    .click()
  const response = await creating
  expect(response.ok()).toBe(true)
  const thread = (await response.json()).result as ReviewThread
  expect(thread).not.toHaveProperty('image')
  const messages = await querying,
    rows = (await messages.json()).result
  expect(rows.total).toBe(1)
  expect(rows.data).toHaveLength(1)
  expect(rows.data[0]).toMatchObject({
    threadId: thread.id,
    text: caption,
    visibility: 'public',
    image: metadata,
  })
  await expect(drawer.locator('.feedback-text')).toHaveText(caption)
  expect(new URL(page.url()).searchParams.get('threadId')).toBe(thread.id)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue('')
  await expect(
    drawer.getByAltText(protoLocales[locale].feedbackImageDraftAlt, { exact: true }),
  ).toHaveCount(0)
  return { response, thread, messages }
}
async function readUpload(outgoing: BrowserRequest) {
  // Chromium exposes File parts on paused requests, not reliably on the later response request.
  const body = outgoing.postDataBuffer()
  expect(body).not.toBeNull()
  const form = await new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': (await outgoing.allHeaders())['content-type']! },
    body: new Uint8Array(body!),
  }).formData()
  return { body: body!, form }
}
async function observeCreates(page: Page) {
  const uploads: { body: Buffer; form: FormData }[] = []
  await page.route('**/review/threads/_with-image', async (route) => {
    uploads.push(await readUpload(route.request()))
    await route.continue()
  })
  return uploads
}
async function view(page: Page, drawer: Locator, locale: Locale = 'zh') {
  const reading = page.waitForResponse((response) =>
    /\/messages\/[^/]+\/image$/.test(response.url()),
  )
  await drawer
    .getByRole('button', { name: protoLocales[locale].feedbackImageView, exact: true })
    .click()
  const response = await reading
  expect(response.request().method()).toBe('POST')
  expect(response.ok()).toBe(true)
  expect(response.headers()['cache-control']).toContain('no-store')
  const image = drawer.getByAltText(protoLocales[locale].feedbackImageAlt, { exact: true })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1)
  expect(await image.getAttribute('src')).toMatch(/^blob:/)
  // Read the actual Blob consumed by the product; CDP can omit a successfully transferred body.
  const received = await image.evaluate(async (element) => {
    const source = (element as HTMLImageElement).src
    if (!source.startsWith('blob:')) throw new Error('Expected a local image Blob')
    return Array.from(new Uint8Array(await (await fetch(source)).arrayBuffer()))
  })
  expect(Buffer.from(received)).toEqual(png)
  return image
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('a new public image thread atomically exposes its first message and reads original bytes only on request', async ({
  page,
  request,
}, info) => {
  const writes: string[] = [],
    reads: string[] = [],
    runtime: Promise<{ url: string; headers: Record<string, string>; body: string }>[] = []
  page.on('request', (outgoing) => {
    if (/\/review\/threads(?:\/_with-image)?$/.test(outgoing.url())) writes.push(outgoing.url())
    if (/\/messages\/[^/]+\/image$/.test(outgoing.url())) reads.push(outgoing.url())
    if (outgoing.url().includes('/runtime/'))
      runtime.push(
        outgoing
          .allHeaders()
          .then((headers) => ({ headers, url: outgoing.url(), body: outgoing.postData() || '' })),
      )
  })
  const drawer = await prepare(page, request)
  await authenticate(page, drawer)
  const uploads = await observeCreates(page)
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles(upload)
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.feedbackTextRequired, { exact: true }),
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  await drawer.locator('textarea#review-feedback-text').fill('First screenshot context')
  await page.screenshot({
    path: info.outputPath('review-create-image-new-draft-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  const { response } = await create(page, drawer, 'First screenshot context')
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatch(/\/threads\/_with-image$/)
  expect(reads).toHaveLength(0)
  const actualHeaders = await response.request().allHeaders()
  expect(actualHeaders['x-access-token']).toBeUndefined()
  expect(actualHeaders['x-review-csrf']).toBeTruthy()
  expect(uploads).toHaveLength(1)
  expect(uploads[0]!.body.includes(Buffer.from(upload.name))).toBe(false)
  expect([...uploads[0]!.form.keys()]).toEqual(['request', 'image'])
  expect((uploads[0]!.form.get('image') as File).name).toBe('image')
  expect(Buffer.from(await (uploads[0]!.form.get('image') as Blob).arrayBuffer())).toEqual(png)
  await view(page, drawer)
  expect(reads).toHaveLength(1)
  await expect(drawer).not.toContainText(upload.name)
  await page.screenshot({
    path: info.outputPath('review-create-image-public-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  const observed = await Promise.all(runtime)
  expect(observed.length).toBeGreaterThan(0)
  for (const item of observed) {
    expect(item.headers['x-review-csrf']).toBeUndefined()
    expect(item.headers.cookie || '').not.toContain('mock-review')
    expect(item.body).not.toContain('First screenshot context')
    expect(item.url).not.toMatch(/blob:|private-first-image|_with-image/)
  }
  expect(await page.locator('.frame-stage > iframe').getAttribute('src')).not.toMatch(
    /blob:|private-first-image|First screenshot/,
  )
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(
    /blob:|private-first-image|First screenshot context/,
  )
})

test('an unknown committed creation retries its exact image and key manually without creating another thread or first message', async ({
  page,
  request,
}) => {
  const drawer = await prepare(page, request)
  await authenticate(page, drawer)
  const attempts: { input: Record<string, unknown>; image: string; filename: string }[] = []
  await page.route('**/review/threads/_with-image', async (route) => {
    const { form } = await readUpload(route.request()),
      input = JSON.parse(await (form.get('request') as Blob).text()),
      image = form.get('image') as File
    expect([...form.keys()]).toEqual(['request', 'image'])
    expect(input.clientRequestId).toMatch(/^[\x21-\x7e]{1,128}$/)
    expect(image.name).toBe('image')
    attempts.push({
      input,
      image: Buffer.from(await image.arrayBuffer()).toString('base64'),
      filename: image.name,
    })
    const response = await route.fetch()
    if (attempts.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles(upload)
  await drawer.locator('textarea#review-feedback-text').fill('Unknown first screenshot')
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  await expect(
    drawer.getByText(protoLocales.zh.feedbackResultUnknown, { exact: true }),
  ).toBeVisible()
  expect(attempts).toHaveLength(1)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue(
    'Unknown first screenshot',
  )
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toBeVisible()
  const { messages } = await create(page, drawer, 'Unknown first screenshot')
  expect(attempts).toHaveLength(2)
  expect(attempts[0]).toEqual(attempts[1])
  expect(attempts.every((attempt) => attempt.image === png.toString('base64'))).toBe(true)
  const queried = await page.request.post(
    `${origin}/api/prototype-hub/public/shares/open/review/threads/_query`,
    {
      headers: { 'X-Review-CSRF': (await messages.request().allHeaders())['x-review-csrf']! },
      data: messages.request().postDataJSON(),
    },
  )
  expect(queried.ok()).toBe(true)
  const body = (await queried.json()).result
  expect(body.total).toBe(1)
  expect(body.data).toHaveLength(1)
  await view(page, drawer)
})

test('fresh email OTP preserves a first-image draft and never uploads on identity return', async ({
  page,
  request,
}) => {
  const drawer = await prepare(page, request),
    writes: string[] = []
  page.on('request', (outgoing) => {
    if (/\/review\/threads(?:\/_with-image)?$/.test(outgoing.url())) writes.push(outgoing.url())
  })
  await drawer
    .getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
    .setInputFiles(upload)
  await drawer.locator('textarea#review-feedback-text').fill('First image after email OTP')
  await expect(
    drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }),
  ).toBeDisabled()
  expect(writes).toHaveLength(0)
  await authenticate(page, drawer, 'zh', true)
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue(
    'First image after email OTP',
  )
  await expect(
    drawer.getByAltText(protoLocales.zh.feedbackImageDraftAlt, { exact: true }),
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  await create(page, drawer, 'First image after email OTP')
  expect(writes).toHaveLength(1)
  await expect(drawer.locator('.feedback-messages')).toContainText(
    protoLocales.zh.reviewEmailVerified,
  )
})

test('image validation, exact multipart and shared text/image receipts do not leave partial or duplicate threads', async ({
  page,
  request,
}) => {
  const drawer = await prepare(page, request)
  await authenticate(page, drawer)
  const uploads = await observeCreates(page)
  const input = drawer.getByLabel(protoLocales.zh.feedbackImageSelect, { exact: true })
  await input.setInputFiles({
    name: 'spoofed.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not PNG bytes'),
  })
  await drawer.locator('textarea#review-feedback-text').fill('Only complete creation')
  const rejected = page.waitForResponse((response) =>
    response.url().endsWith('/threads/_with-image'),
  )
  await drawer.getByRole('button', { name: protoLocales.zh.feedbackSubmit, exact: true }).click()
  expect((await rejected).status()).toBe(400)
  await expect(
    drawer.getByText(protoLocales.zh.feedbackImageInvalid, { exact: true }),
  ).toBeVisible()
  await expect(drawer.locator('textarea#review-feedback-text')).toHaveValue(
    'Only complete creation',
  )
  await input.setInputFiles(upload)
  const { response, thread, messages } = await create(page, drawer, 'Only complete creation')
  expect(uploads).toHaveLength(2)
  const actualHeaders = await response.request().allHeaders(),
    form = uploads[1]!.form,
    data = JSON.parse(await (form.get('request') as Blob).text()),
    publicHeaders = { 'X-Review-CSRF': actualHeaders['x-review-csrf']! },
    multipart = {
      request: {
        name: 'request.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
      },
      image: upload,
    },
    url = `${origin}/api/prototype-hub/public/shares/open/review/threads/_with-image`
  expect([...form.keys()]).toEqual(['request', 'image'])
  expect((form.get('request') as Blob).type).toBe('application/json')
  expect((form.get('image') as File).name).toBe('image')
  expect(Buffer.from(await (form.get('image') as Blob).arrayBuffer())).toEqual(png)
  expect(uploads[1]!.body.includes(Buffer.from(upload.name))).toBe(false)
  const repeated = await page.request.post(url, { headers: publicHeaders, multipart })
  expect(repeated.ok()).toBe(true)
  expect((await repeated.json()).result.id).toBe(thread.id)
  const plain = await page.request.post(url.replace('/_with-image', ''), {
    headers: publicHeaders,
    data,
  })
  expect(plain.status()).toBe(409)
  const different = await page.request.post(url, {
    headers: publicHeaders,
    multipart: {
      ...multipart,
      image: {
        ...upload,
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8t8AAAAASUVORK5CYII=',
          'base64',
        ),
      },
    },
  })
  expect(different.status()).toBe(409)
  const extra = await page.request.post(url, {
    headers: publicHeaders,
    multipart: { ...multipart, unexpected: 'not allowed' },
  })
  expect(extra.status()).toBe(400)
  expect((await extra.json()).code).toBe('PROTOTYPE_HUB_REVIEW_IMAGE_PARTS_INVALID')
  const listed = await page.request.post(url.replace('/_with-image', '/_query'), {
    headers: publicHeaders,
    data: messages.request().postDataJSON(),
  })
  expect(listed.ok()).toBe(true)
  expect((await listed.json()).result.total).toBe(1)
  await view(page, drawer)
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} new-image selection, removal, submission and first-message viewing are keyboard accessible`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const drawer = await prepare(page, request, locale),
      text = protoLocales[locale]
    await authenticate(page, drawer, locale)
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
    await drawer.locator('textarea#review-feedback-text').fill('Keyboard first image')
    await remove.focus()
    await page.keyboard.press('Tab')
    const send = drawer.getByRole('button', { name: text.feedbackSubmit, exact: true })
    await expect(send).toBeFocused()
    const writing = page.waitForResponse((response) =>
      response.url().endsWith('/threads/_with-image'),
    )
    await page.keyboard.press('Enter')
    expect((await writing).ok()).toBe(true)
    await expect(drawer.locator('.feedback-text')).toHaveText('Keyboard first image')
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
      path: info.outputPath(`review-create-image-public-390-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  })
