import { test, expect, type Page, type Request as BrowserRequest } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import { join, dirname } from 'node:path'
import { unzipSync, zipSync, strToU8 } from 'fflate'

const content: Record<string, Buffer> = {
  'index.html': Buffer.from('<!doctype html><html><body>中文首页</body></html>'),
  '页面/第二 页.html': Buffer.from('<html><body>nested page</body></html>'),
  'resources/scripts/app.js': Buffer.from('window.folderFixture = true;'),
  'data/document.js': Buffer.from('window.pages = ["页面/第二 页.html"];'),
  'images/中文 空格.bin': Buffer.from([0, 255, 128, 1, 2, 3]),
  'fonts/example.woff2': Buffer.from([119, 79, 70, 50, 0, 1, 2]),
  'assets/empty.txt': Buffer.alloc(0),
}

/** The browser chooses an actual directory; no synthetic relative paths or Worker mocks are used. */
async function fixtureFolder() {
  const parent = await mkdtemp(join(tmpdir(), 'prototype-folder-browser-'))
  const root = join(parent, '中文原型 导出')
  for (const [path, bytes] of Object.entries(content)) {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  return { parent, root }
}
async function login(page: Page) {
  await page.goto('login')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await page.goto('prototype-hub/projects/p1')
}
async function selectFolder(page: Page, root: string) {
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('dialog').getByRole('button', { name: '选择 HTML 文件夹' }).click()
  const chooser = await choosing
  await chooser.setFiles(root)
  return chooser.element().evaluate((input) =>
    Array.from((input as HTMLInputElement).files || []).map((file) => ({
      webkitRelativePath: file.webkitRelativePath,
      size: file.size,
    })),
  )
}
async function uploaded(request: BrowserRequest) {
  const raw = request.postDataBuffer()!
  const form = await new Request('https://upload.invalid/', {
    method: 'POST',
    headers: { 'content-type': request.headers()['content-type']! },
    body: new Uint8Array(raw).buffer,
  }).formData()
  const file = form.get('file') as File
  return {
    key: request.headers()['idempotency-key'],
    name: form.get('versionName'),
    description: form.get('description'),
    bytes: Buffer.from(await file.arrayBuffer()),
  }
}
function completeArchive(bytes: Buffer) {
  const files = unzipSync(bytes)
  expect(Object.keys(files).sort()).toEqual(Object.keys(content).sort())
  for (const [path, expected] of Object.entries(content)) {
    expect(Buffer.from(files[path]!)).toEqual(expected)
  }
}

test.beforeEach(async ({ request }, testInfo) => {
  await request.post(new URL('/__test/reset', String(testInfo.project.use.baseURL)).toString())
})

test('real directory Worker preserves every nested resource for explicit create and replace', async ({
  page,
}, testInfo) => {
  const fixture = await fixtureFolder()
  try {
    await login(page)
    const requests: (Awaited<ReturnType<typeof uploaded>> & { method: string })[] = []
    // Capture multipart bodies while routing; Chromium may release file bytes after completion.
    await page.route(
      /\/api\/prototype-hub\/(?:projects\/p1\/versions|versions\/v1)$/,
      async (route) => {
        const request = route.request()
        if (['POST', 'PUT'].includes(request.method())) {
          requests.push({ ...(await uploaded(request)), method: request.method() })
        }
        await route.continue()
      },
    )
    await page.getByRole('button', { name: '上传版本', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByText('新建一个版本，占用一个版本名额。', { exact: false }),
    ).toBeVisible()
    await dialog.getByLabel('版本名称').fill('Folder V2')
    const selected = await selectFolder(page, fixture.root)
    await expect(dialog.getByText(/已打包「中文原型 导出」：7 个文件/)).toBeVisible()
    expect(requests).toHaveLength(0)
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('folder-ready.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Folder V2', exact: true })).toBeVisible()
    expect(requests).toHaveLength(1)
    const creation = requests[0]!
    expect(creation.name).toBe('Folder V2')
    expect(creation.key).toBeTruthy()
    completeArchive(creation.bytes)

    const original = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
    await original.getByRole('button', { name: '上传新修订', exact: true }).click()
    await expect(dialog.getByText('为版本「V1」上传新修订', { exact: false })).toBeVisible()
    await selectFolder(page, fixture.root)
    await expect(dialog.getByText(/已打包「中文原型 导出」：7 个文件/)).toBeVisible()
    await dialog.getByLabel('版本名称').fill('Folder replacement')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Folder replacement', exact: true })).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[1]!.method).toBe('PUT')
    const replacement = requests[1]!
    expect(replacement.key).toBeUndefined()
    completeArchive(replacement.bytes)
    expect(replacement.bytes).toEqual(creation.bytes)

    // Retain only the original synthetic package, never request headers or session credentials.
    const inputs = {
      schemaVersion: 1,
      source: {
        rootName: selected[0]!.webkitRelativePath.split('/')[0],
        kind: 'original synthetic HTML export',
        capture: 'native directory picker and real module Worker in Chrome',
        browserVersion: page.context().browser()!.version(),
        basePath: '/tools/',
        packer: 'src/modules/protohub-manager-ui/workers/folder-archive-pack.ts#packFolderArchive',
        manifest: 'src/modules/protohub-manager-ui/utils/folder-manifest.ts#buildFolderManifest',
        fflate: '0.8.3',
        mtime: 'local-calendar 2000-01-01 00:00:00',
      },
      archiveSha256: createHash('sha256').update(creation.bytes).digest('hex'),
      archiveBytes: creation.bytes.length,
      entries: selected.map((entry) => {
        const path = entry.webkitRelativePath.slice(entry.webkitRelativePath.indexOf('/') + 1)
        const bytes = content[path]!
        expect(bytes.length).toBe(entry.size)
        return {
          path,
          webkitRelativePath: entry.webkitRelativePath,
          size: entry.size,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          base64: bytes.toString('base64'),
        }
      }),
      zipBase64: creation.bytes.toString('base64'),
    }
    await writeFile(testInfo.outputPath('browser-folder-upload.zip'), creation.bytes)
    await writeFile(
      testInfo.outputPath('browser-folder-upload-inputs.json'),
      `${JSON.stringify(inputs, null, 2)}\n`,
    )
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})

test('an unknown POST waits for a manual retry with the same generated file and key', async ({
  page,
}) => {
  const fixture = await fixtureFolder()
  try {
    await login(page)
    const attempts: Awaited<ReturnType<typeof uploaded>>[] = []
    await page.route('**/api/prototype-hub/projects/p1/versions', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      attempts.push(await uploaded(route.request()))
      if (attempts.length === 1) return route.abort('failed')
      return route.continue()
    })
    await page.getByRole('button', { name: '上传版本', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('版本名称').fill('Retry folder')
    await selectFolder(page, fixture.root)
    await expect(dialog.getByText(/已打包「中文原型 导出」/)).toBeVisible()
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog.getByText('未收到服务器的处理结果', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    expect(attempts).toHaveLength(1)
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Retry folder', exact: true })).toBeVisible()
    expect(attempts).toHaveLength(2)
    expect(attempts[1]!.key).toBe(attempts[0]!.key)
    expect(attempts[1]!.bytes).toEqual(attempts[0]!.bytes)
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})

test('a sparse oversized directory is rejected before upload and ZIP fallback remains available', async ({
  page,
}) => {
  const fixture = await fixtureFolder()
  try {
    const oversized = await open(join(fixture.root, 'too-large.bin'), 'w')
    await oversized.truncate(64 * 1024 * 1024 + 1)
    await oversized.close()
    await login(page)
    let uploads = 0
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/api/prototype-hub/projects/p1/versions')
      )
        uploads++
    })
    await page.getByRole('button', { name: '上传版本', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('版本名称').fill('ZIP fallback')
    await selectFolder(page, fixture.root)
    await expect(
      dialog.getByText('文件夹或单文件超过浏览器打包上限', { exact: false }),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    expect(uploads).toBe(0)
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'fallback.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync({ 'index.html': strToU8('<html><body>ZIP fallback</body></html>') }),
      ),
    })
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'ZIP fallback', exact: true })).toBeVisible()
    expect(uploads).toBe(1)
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})

test('cancelling real Worker compression leaves no upload and no stale prepared file', async ({
  page,
}) => {
  const fixture = await fixtureFolder()
  try {
    // Incompressible bytes keep real compression active long enough to exercise the cancel button.
    await writeFile(join(fixture.root, 'large.bin'), randomBytes(32 * 1024 * 1024))
    await login(page)
    let uploads = 0
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/api/prototype-hub/projects/p1/versions')
      )
        uploads++
    })
    await page.getByRole('button', { name: '上传版本', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('版本名称').fill('Cancelled folder')
    await selectFolder(page, fixture.root)
    await dialog.getByRole('button', { name: '停止打包', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '选择 HTML 文件夹' })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    await expect(dialog.getByText(/已打包「/)).toHaveCount(0)
    expect(uploads).toBe(0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '上传版本', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    expect(uploads).toBe(0)
  } finally {
    await rm(fixture.parent, { recursive: true, force: true })
  }
})
