import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
import { configurationZh } from '../../src/modules/authentication-manager-ui/locale-messages'
import type { ApiResponse } from '../../src/shared/api/types'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQK///HwAEvwKM9Ew8SgAAAABJRU5ErkJggg==',
  'base64',
)
function iconBuffer() {
  const directory = Buffer.alloc(22)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(1, 4)
  directory[6] = 1
  directory[7] = 1
  directory.writeUInt16LE(1, 10)
  directory.writeUInt16LE(32, 12)
  directory.writeUInt32LE(png.length, 14)
  directory.writeUInt32LE(22, 18)
  return Buffer.concat([directory, png])
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
test('invalid base address stays in the field and a valid relative address saves all scopes', async ({
  page,
}) => {
  const saves: unknown[] = []
  await page.route('**/api/system/config/scope/_save', async (route) => {
    saves.push(route.request().postDataJSON())
    await route.continue()
  })
  await login(page)
  await page.goto('system/Basis')
  const address = page.getByLabel('后台访问地址', { exact: true })
  await address.fill('http://192.168.0.280:5173/api')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText(configurationZh.invalidBasePath, { exact: true })).toBeVisible()
  await expect(address).toHaveValue('http://192.168.0.280:5173/api')
  expect(saves).toHaveLength(0)
  await address.fill('/api')
  const saved = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/system/config/scope/_save'),
  )
  const savedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/system/config/scope/_save'),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).postDataJSON()).toEqual([
    {
      scope: 'front',
      properties: { title: 'ProtoBridge', headerTheme: 'light', showRecordNumber: false },
    },
    { scope: 'amap', properties: { webKey: '', apiKey: '', secretKey: '' } },
    { scope: 'paths', properties: { 'base-path': '/api' } },
  ])
  await expect.poll(() => saves.length).toBe(1)
  await expect(page.getByText(configurationZh.invalidBasePath, { exact: true })).toHaveCount(0)
  expect((await savedResponse).status()).toBe(200)
  await page.reload()
  await expect(address).toHaveValue('/api')
})

test('ICO uses original multipart bytes and server errors never erase the previous image', async ({
  page,
}) => {
  test.setTimeout(60000)
  const requests: { body: Buffer; contentType: string; token?: string }[] = []
  let responseKind: 'success' | 'reject' | 'malformed' = 'success'
  let seedPreviousIcon = true
  const bytes = iconBuffer()
  await page.route('**/api/system/config/scopes', async (route) => {
    const response = await route.fetch()
    const payload: ApiResponse<{ scope: string; properties: Record<string, unknown> }[]> =
      await response.json()
    if (seedPreviousIcon) {
      payload.result = payload.result.map((row) =>
        row.scope === 'front'
          ? { ...row, properties: { ...row.properties, ico: '/previous.ico' } }
          : row,
      )
      seedPreviousIcon = false
    }
    await route.fulfill({ response, json: payload })
  })
  await page.route('**/api/uploaded-original.ico', (route) =>
    route.fulfill({ contentType: 'image/x-icon', body: bytes }),
  )
  await page.route('**/api/file/upload', async (route) => {
    const request = route.request()
    requests.push({
      body: request.postDataBuffer()!,
      contentType: request.headers()['content-type']!,
      token: request.headers()['x-access-token'],
    })
    await route.fulfill({
      status: responseKind === 'reject' ? 400 : 200,
      json:
        responseKind === 'reject'
          ? { success: false, status: 400, code: 'BAD_REQUEST', message: '系统管理请求参数无效' }
          : {
              success: true,
              status: 200,
              result:
                responseKind === 'malformed' ? {} : { accessUrl: '/api/uploaded-original.ico' },
            },
    })
  })
  await login(page)
  await page.goto('system/Basis')
  const icon = page.locator('.branding-upload.ico'),
    input = icon.locator('input[type="file"]'),
    image = icon.locator('img')
  await expect(image).toHaveAttribute('src', '/previous.ico')
  for (const file of [
    { name: 'disguised.ico', mimeType: 'image/png', buffer: png },
    { name: 'truncated.ico', mimeType: 'image/x-icon', buffer: bytes.subarray(0, 6) },
    { name: 'incorrect.png', mimeType: 'image/x-icon', buffer: bytes },
  ]) {
    await input.setInputFiles(file)
    await expect(icon.getByRole('alert')).toHaveText(configurationZh.invalidIcon)
    await expect(icon.locator('.mask button')).not.toHaveClass(/ant-btn-loading/)
    expect(requests).toHaveLength(0)
    await expect(image).toHaveAttribute('src', '/previous.ico')
  }
  for (const mimeType of ['image/x-icon', 'image/vnd.microsoft.icon', '']) {
    const uploaded = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/file/upload'),
    )
    if (mimeType) await input.setInputFiles({ name: 'original.ico', mimeType, buffer: bytes })
    else {
      // Playwright infers MIME from .ico for an empty payload type; simulate the native no-MIME file.
      const originalType = await input.evaluate((element: HTMLInputElement, data: number[]) => {
        const file = new File([new Uint8Array(data)], 'original.ico', { type: '' }),
          transfer = new DataTransfer()
        transfer.items.add(file)
        element.files = transfer.files
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return file.type
      }, Array.from(bytes))
      expect(originalType).toBe('')
    }
    await uploaded
    await expect(icon.locator('.mask button')).not.toHaveClass(/ant-btn-loading/)
    await expect(image).toHaveAttribute('src', '/api/uploaded-original.ico')
    const request = requests.at(-1)!
    expect(request.contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(request.token).toBeTruthy()
    expect(request.body.toString()).toContain('name="file"; filename="original.ico"')
    expect(request.body.toString()).toContain(
      `Content-Type: ${mimeType || 'application/octet-stream'}`,
    )
    expect(request.body.includes(bytes)).toBe(true)
  }
  expect(requests).toHaveLength(3)
  await expect
    .poll(() =>
      icon
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1),
    )
    .toBe(true)
  const reloaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/system/config/scopes'),
  )
  const saved = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/system/config/scope/_save'),
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).postDataJSON()).toContainEqual({
    scope: 'front',
    properties: {
      title: 'ProtoBridge',
      headerTheme: 'light',
      showRecordNumber: false,
      ico: '/api/uploaded-original.ico',
    },
  })
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/api/uploaded-original.ico',
  )
  await reloaded
  await expect(page.locator('.panel .load-state')).toHaveCount(0)
  await expect(input).toBeAttached()
  const file = { name: 'original.ico', mimeType: 'image/vnd.microsoft.icon', buffer: bytes }
  responseKind = 'reject'
  await input.setInputFiles(file)
  await expect(icon.getByRole('alert')).toHaveText('系统管理请求参数无效')
  await expect(image).toHaveAttribute('src', '/api/uploaded-original.ico')
  responseKind = 'malformed'
  await input.setInputFiles(file)
  await expect(icon.getByRole('alert')).toHaveText(configurationZh.invalidUploadResponse)
  await expect(image).toHaveAttribute('src', '/api/uploaded-original.ico')
})
