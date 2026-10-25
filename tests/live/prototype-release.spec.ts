import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { liveEnvironment } from './environment'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type {
  Share,
  PublicShare,
  PrototypePage,
  RevisionComparison,
  RevisionQuality,
} from '../../src/modules/protohub-manager-ui/types'

interface Resource {
  id: string
}
interface Version extends Resource {
  versionName: string
  currentRevisionId: string
  revisionId: string
  revisionCount: number
}
interface Capacity {
  used: number
  limit: number
  canCreate: boolean
}
interface ProjectMember {
  userId: string
  name: string
  username: string
  role: 'owner' | 'editor' | 'viewer'
}

async function result<T>(response: Pick<APIResponse, 'ok' | 'json'>): Promise<T> {
  expect(response.ok(), 'Live API request must succeed').toBe(true)
  const body = (await response.json()) as { success: boolean; result: T }
  expect(body.success, 'Live API must return a successful envelope').toBe(true)
  return body.result
}

async function preview(
  page: Page,
  heading = 'Runtime fixture home',
  revisionId?: string,
  versionName?: string,
) {
  const opened = page.waitForEvent('popup')
  const exchange = revisionId
    ? page
        .context()
        .waitForEvent('request', (request) =>
          request.url().endsWith(`/revisions/${encodeURIComponent(revisionId)}/preview-session`),
        )
    : undefined
  const scope = versionName
    ? page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: versionName, exact: true }) })
    : page
  await scope.getByRole('button', { name: '预览', exact: true }).first().click()
  const popup = await opened
  const frame = popup.frameLocator('.frame-stage > iframe')
  await expect(frame.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  await expect(frame.frameLocator('iframe').getByTestId('runtime-nested')).toHaveText(
    'Runtime fixture nested page',
  )
  await expect(popup.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
  await expect(popup.locator('.frame-stage > iframe')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  )
  // Check the browser's actual origin boundary without reading any platform credential.
  expect(
    await frame.locator('body').evaluate(() => {
      try {
        localStorage.getItem('live-verification-non-secret')
        return false
      } catch {
        return true
      }
    }),
  ).toBe(true)
  if (exchange) await exchange
  await popup.close()
}

/** Track only resources created by this test; teardown never clears unrelated database content. */
class OwnedResources {
  headers: Record<string, string> = {}
  projects: string[] = []
  versions: string[] = []
  users: string[] = []
  shares: string[] = []

  constructor(readonly request: APIRequestContext) {}

  async cleanup() {
    const failures: string[] = []
    for (const id of [...this.shares].reverse()) {
      const response = await this.request.delete(`/api/prototype-hub/shares/${id}`, {
        headers: this.headers,
      })
      if (!response.ok()) failures.push(`share cleanup returned ${response.status()}`)
    }
    for (const id of [...this.versions].reverse()) {
      const response = await this.request.delete(`/api/prototype-hub/versions/${id}`, {
        headers: this.headers,
      })
      if (!response.ok()) failures.push(`version cleanup returned ${response.status()}`)
    }
    for (const id of [...this.projects].reverse()) {
      const response = await this.request.delete(`/api/prototype-hub/projects/${id}`, {
        headers: this.headers,
      })
      if (!response.ok()) failures.push(`project cleanup returned ${response.status()}`)
    }
    for (const id of [...this.users].reverse()) {
      const response = await this.request.delete(`/api/user/${encodeURIComponent(id)}`, {
        headers: this.headers,
      })
      if (!response.ok()) failures.push(`user cleanup returned ${response.status()}`)
    }
    if (failures.length) throw new Error(failures.join('; '))
  }
}

const liveTest = test.extend<{ owned: OwnedResources }>({
  owned: async ({ request }, use) => {
    const owned = new OwnedResources(request)
    await use(owned)
    await owned.cleanup()
  },
})

liveTest(
  'production UI uses the real backend for login, members, nested preview, replacement and capacity',
  async ({ page, request, owned }, testInfo) => {
    const environment = liveEnvironment()
    const name = `Live verification ${randomUUID()}`
    let projectId = ''
    let versionId = ''
    let firstRevisionId = ''
    let secondRevisionId = ''
    let shareToken = ''
    let firstRuntimeUrl = ''

    await test.step('log in through the platform form', async () => {
      await page.goto('/login')
      await page.getByLabel('用户名', { exact: true }).fill(environment.username)
      await page.getByLabel('密码', { exact: true }).fill(environment.password)
      const loggingIn = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/authorize/login',
      )
      await page.getByRole('button', { name: '登录', exact: true }).click()
      const response = await loggingIn
      expect(response.ok(), 'Browser login must succeed').toBe(true)
      const body = (await response.json()) as { result: { token: string } }
      expect(Boolean(body.result.token), 'Browser login must issue a token').toBe(true)
      owned.headers = { 'X-Access-Token': body.result.token, 'Accept-Language': 'zh-CN' }
      await page.goto('/prototype-hub')
      await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
      await expect(page.locator('.capacity-notice')).toContainText('项目用量：0 / 5')
    })

    await test.step('create a project and upload a multi-page ZIP through the UI', async () => {
      await page.getByRole('button', { name: '新建项目', exact: true }).click()
      const editor = page.getByRole('dialog')
      await editor.getByLabel('名称', { exact: true }).fill(name)
      const creating = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/prototype-hub/projects',
      )
      await editor.getByRole('button', { name: '保存', exact: true }).click()
      const response = await creating
      expect(response.ok(), 'Project form must persist through the real backend').toBe(true)
      projectId = ((await response.json()) as { result: Resource }).result.id
      owned.projects.push(projectId)
      expect(Boolean(response.request().headers()['idempotency-key'])).toBe(true)
      await expect(page.locator('.capacity-notice')).toContainText('项目用量：1 / 5')
      await page.getByRole('link', { name: `详情：${name}`, exact: true }).click()
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      await page.getByRole('button', { name: '上传版本', exact: true }).click()
      const upload = page.getByRole('dialog')
      await upload.getByLabel('版本名称', { exact: true }).fill('Browser upload')
      await upload.locator('input[type=file]').setInputFiles(environment.zipPath)
      const uploading = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          new URL(res.url()).pathname === `/api/prototype-hub/projects/${projectId}/versions`,
      )
      await upload.getByRole('button', { name: '保存', exact: true }).click()
      const saved = await uploading
      expect(saved.ok(), 'ZIP upload must persist through the real backend').toBe(true)
      const uploadedVersion = ((await saved.json()) as { result: Version }).result
      versionId = uploadedVersion.id
      firstRevisionId = uploadedVersion.revisionId
      expect(firstRevisionId).toBeTruthy()
      const shared = await result<{ id: string; token: string }>(
        await request.post(`/api/prototype-hub/versions/${versionId}/shares`, {
          headers: owned.headers,
          data: {},
        }),
      )
      owned.shares.push(shared.id)
      shareToken = shared.token
      owned.versions.push(versionId)
      expect(Boolean(saved.request().headers()['idempotency-key'])).toBe(true)
      await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：1 / 5')
      await preview(page)
    })

    await test.step('refresh and revisit a selected immutable page through member and anonymous app links', async () => {
      const pages = await result<PrototypePage[]>(
        await request.get(
          `/api/prototype-hub/versions/${versionId}/revisions/${firstRevisionId}/pages`,
          { headers: owned.headers },
        ),
      )
      const flatten = (items: PrototypePage[]): PrototypePage[] =>
        items.flatMap((item) => [item, ...flatten(item.children || [])])
      const targets = flatten(pages).filter(
        (item) => item.folder !== true && item.path && item.pageId,
      )
      expect(
        targets.length,
        'Runtime fixture exposes multiple stable manifest pages',
      ).toBeGreaterThanOrEqual(2)
      const target = targets[1]
      for (const path of [`/preview/${projectId}/${versionId}`, `/share/${shareToken}`]) {
        const popup = await page.context().newPage()
        try {
          const query = new URLSearchParams({ revisionId: firstRevisionId, pageId: target.pageId! })
          await popup.goto(`${path}?${query}`)
          const iframe = popup.locator('.frame-stage > iframe')
          await expect(iframe).toHaveAttribute(
            'src',
            new RegExp(
              `/${target
                .path!.split('/')
                .map(encodeURIComponent)
                .join('/')
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            ),
          )
          await expect(popup.locator('.workspace-current')).toContainText(target.name)
          await expect(popup.locator('.current-path')).toHaveText(target.path!)
          await popup.reload()
          await expect(iframe).toHaveAttribute(
            'src',
            new RegExp(
              `/${target
                .path!.split('/')
                .map(encodeURIComponent)
                .join('/')
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            ),
          )
          expect(new URL(popup.url()).searchParams.get('revisionId')).toBe(firstRevisionId)
          expect(new URL(popup.url()).searchParams.get('pageId')).toBe(target.pageId)
          await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
        } finally {
          await popup.close()
        }
      }
    })

    await test.step('search, add, change and remove a test-owned project member through the UI', async () => {
      const username = `live-member-${randomUUID().replaceAll('-', '')}`
      const memberName = `Live member ${randomUUID()}`
      const user = await result<Resource>(
        await request.post('/api/user/detail/_create', {
          headers: owned.headers,
          data: { name: memberName, username, password: `Aa1!${randomUUID()}` },
        }),
      )
      owned.users.push(user.id)
      const membersPath = `/api/prototype-hub/projects/${encodeURIComponent(projectId)}/members`
      const memberPath = `${membersPath}/${encodeURIComponent(user.id)}`
      const initialLoading = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && new URL(response.url()).pathname === membersPath,
      )
      await page.getByRole('button', { name: '项目成员', exact: true }).click()
      const initialMembers = await result<ProjectMember[]>(await initialLoading)
      expect(initialMembers.some((member) => member.role === 'owner')).toBe(true)
      const dialog = page.getByRole('dialog', { name: '项目成员', exact: true })
      const searching = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === 'GET' &&
          url.pathname === membersPath.replace(/\/members$/, '/member-candidates') &&
          url.searchParams.get('keyword') === username
        )
      })
      const memberSearch = dialog.getByRole('combobox', { name: /^\*?\s*成员$/ })
      await memberSearch.click()
      await memberSearch.fill(username)
      const candidates = await result<Omit<ProjectMember, 'role'>[]>(await searching)
      expect(candidates.length).toBeLessThanOrEqual(20)
      expect(candidates).toContainEqual({ userId: user.id, name: memberName, username })
      const options = page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        .locator('.ant-select-item-option')
      await options.filter({ hasText: `${memberName} (${username})` }).click()
      const adding = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' && new URL(response.url()).pathname === memberPath,
      )
      await dialog.getByRole('button', { name: '添加或更新成员', exact: true }).click()
      const added = await adding
      expect(added.status()).toBe(200)
      expect(added.request().postDataJSON()).toEqual({ role: 'viewer' })
      expect(await result<ProjectMember>(added)).toEqual({
        userId: user.id,
        name: memberName,
        username,
        role: 'viewer',
      })
      const memberRow = dialog.locator('tr').filter({ hasText: username })
      await expect(memberRow.getByText('查看者', { exact: true })).toBeVisible()
      await memberRow.locator('.ant-select-selector').click()
      const changing = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' && new URL(response.url()).pathname === memberPath,
      )
      await options.filter({ hasText: '编辑者' }).click()
      const changed = await changing
      expect(changed.status()).toBe(200)
      expect(changed.request().postDataJSON()).toEqual({ role: 'editor' })
      expect(await result<ProjectMember>(changed)).toEqual({
        userId: user.id,
        name: memberName,
        username,
        role: 'editor',
      })
      await expect(memberRow.getByText('编辑者', { exact: true })).toBeVisible()
      const currentMembers = await result<ProjectMember[]>(
        await request.get(membersPath, { headers: owned.headers }),
      )
      expect(currentMembers).toHaveLength(initialMembers.length + 1)
      expect(currentMembers).toContainEqual({
        userId: user.id,
        name: memberName,
        username,
        role: 'editor',
      })
      await memberRow.getByRole('button', { name: '移除成员', exact: true }).click()
      const removing = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          new URL(response.url()).pathname === memberPath,
      )
      await page.getByRole('button', { name: '确定', exact: true }).click()
      const removed = await removing
      expect(removed.status()).toBe(200)
      expect(await result<boolean>(removed)).toBe(true)
      await expect(memberRow).toHaveCount(0)
      expect(
        await result<ProjectMember[]>(await request.get(membersPath, { headers: owned.headers })),
      ).toEqual(initialMembers)
      await dialog.locator('.ant-modal-close').click()
      await expect(dialog).toBeHidden()
    })

    await test.step('upload a second immutable revision without consuming another slot', async () => {
      const initialGrant = await result<{ previewUrl: string }>(
        await request.post(
          `/api/prototype-hub/versions/${versionId}/revisions/${firstRevisionId}/preview-session`,
          { headers: owned.headers },
        ),
      )
      firstRuntimeUrl = initialGrant.previewUrl
      await page.getByRole('button', { name: '上传新修订', exact: true }).click()
      const editor = page.getByRole('dialog')
      await editor.getByLabel('版本名称', { exact: true }).fill('Browser replacement')
      const files = unzipSync(readFileSync(environment.zipPath))
      let replaced = false
      for (const [path, bytes] of Object.entries(files)) {
        if (!path.endsWith('.html')) continue
        const html = strFromU8(bytes)
        if (html.includes('Runtime fixture home')) {
          files[path] = strToU8(
            html.replaceAll('Runtime fixture home', 'Runtime fixture revision two'),
          )
          replaced = true
        }
      }
      expect(replaced, 'The fixture ZIP must contain a distinguishable first revision').toBe(true)
      await editor.locator('input[type=file]').setInputFiles({
        name: 'revision-two.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from(zipSync(files)),
      })
      const updating = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          new URL(response.url()).pathname === `/api/prototype-hub/versions/${versionId}`,
      )
      // CDP omits multipart bodies containing files; observe only the precondition at native send.
      const upload = await page.evaluateHandle(() => {
        const expectedRevisionIds: string[] = []
        const originalSend = XMLHttpRequest.prototype.send
        XMLHttpRequest.prototype.send = function (body) {
          if (body instanceof FormData) {
            const value = body.get('expectedRevisionId')
            if (typeof value === 'string') expectedRevisionIds.push(value)
          }
          originalSend.call(this, body)
        }
        return {
          expectedRevisionIds,
          restore: () => {
            XMLHttpRequest.prototype.send = originalSend
          },
        }
      })
      try {
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        const response = await updating
        expect(response.ok(), 'Version replacement must persist through the real backend').toBe(
          true,
        )
        expect(response.request().headers()['idempotency-key']).toBeUndefined()
        expect(await upload.evaluate((capture) => capture.expectedRevisionIds)).toEqual([
          firstRevisionId,
        ])
        const updated = ((await response.json()) as { result: Version }).result
        expect(updated.id).toBe(versionId)
        secondRevisionId = updated.revisionId
        expect(secondRevisionId).not.toBe(firstRevisionId)
        expect(updated.currentRevisionId).toBe(secondRevisionId)
        expect(updated.revisionCount).toBe(2)
      } finally {
        await upload.evaluate((capture) => capture.restore())
        await upload.dispose()
      }
      await expect(
        page.getByRole('cell', { name: 'Browser replacement', exact: true }),
      ).toBeVisible()
      await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：1 / 5')
      await preview(page, 'Runtime fixture revision two', secondRevisionId)
    })

    await test.step('history opens revision one while the current pointer and old share stay independently bound', async () => {
      const current = await result<Resource>(
        await request.get(`/api/prototype-hub/versions/${versionId}/current-revision`, {
          headers: owned.headers,
        }),
      )
      expect(current.id).toBe(secondRevisionId)
      const stillValid = await request.get(firstRuntimeUrl)
      expect(stillValid.ok(), 'Uploading a revision must not revoke an existing short grant').toBe(
        true,
      )
      expect(await stillValid.text()).toContain('Runtime fixture home')
      await page.getByRole('button', { name: '历史修订', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '历史修订', exact: true })
      await expect(drawer.getByText('当前修订', { exact: true })).toBeVisible()
      const old = drawer
        .getByRole('row')
        .filter({ has: page.getByText(firstRevisionId, { exact: true }) })
      const opening = page.waitForEvent('popup')
      const historyGrant = page
        .context()
        .waitForEvent('request', (outgoing) =>
          outgoing.url().endsWith(`/revisions/${firstRevisionId}/preview-session`),
        )
      await old.getByRole('button', { name: '预览', exact: true }).click()
      const historical = await opening
      await historical.waitForURL(
        (url) =>
          url.origin === new URL(page.url()).origin &&
          url.pathname ===
            `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(versionId)}` &&
          url.searchParams.get('revisionId') === firstRevisionId,
      )
      expect(new URL(historical.url()).searchParams.get('revisionId')).toBe(firstRevisionId)
      await historyGrant
      await expect(
        historical
          .frameLocator('.frame-stage > iframe')
          .getByRole('heading', { name: 'Runtime fixture home', exact: true }),
      ).toBeVisible()
      await historical.close()
      await drawer.getByRole('button', { name: '关闭', exact: true }).click()
      const share = await result<{ revisionId: string }>(
        await request.get(`/api/prototype-hub/public/shares/${shareToken}`),
      )
      expect(share.revisionId).toBe(firstRevisionId)
      const publicPage = await page.context().newPage()
      await publicPage.goto(`/share/${encodeURIComponent(shareToken)}`)
      await expect(
        publicPage
          .frameLocator('.frame-stage > iframe')
          .getByRole('heading', { name: 'Runtime fixture home', exact: true }),
      ).toBeVisible()
      await expect(publicPage.getByText('Browser upload', { exact: true })).toBeVisible()
      await publicPage.close()
    })

    await test.step('check and download the original revision package without scanning the current pointer', async () => {
      await page.getByRole('button', { name: protoLocales.zh.revisionHistory, exact: true }).click()
      const history = page.getByRole('dialog', {
        name: protoLocales.zh.revisionHistory,
        exact: true,
      })
      const old = history
        .getByRole('row')
        .filter({ has: page.getByText(firstRevisionId, { exact: true }) })
      const scanning = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
          `/api/prototype-hub/versions/${versionId}/revisions/${firstRevisionId}/quality`,
      )
      await old.getByRole('button', { name: protoLocales.zh.qualityCheck, exact: true }).click()
      const report = await result<RevisionQuality>(await scanning)
      expect(report.versionId).toBe(versionId)
      expect(report.revisionId).toBe(firstRevisionId)
      expect(report.manifestSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(report.summary.scannedDocuments).toBeGreaterThan(0)
      expect(report.summary.checkedReferences).toBeGreaterThan(0)
      expect(report.summary.omittedFindings).toBe(0)
      const dialog = page.getByRole('dialog', { name: protoLocales.zh.qualityCheck, exact: true })
      await expect(dialog.getByText(`修订: ${firstRevisionId}`, { exact: true })).toBeVisible()
      const downloading = page.waitForEvent('download')
      await dialog
        .getByRole('button', { name: protoLocales.zh.qualityDownload, exact: true })
        .click()
      const saved = await downloading
      expect(saved.suggestedFilename()).toBe(
        `prototype-quality-${versionId}-${firstRevisionId}.json`,
      )
      expect(JSON.parse(readFileSync((await saved.path())!, 'utf8'))).toEqual(report)
      await page.screenshot({
        path: testInfo.outputPath('live-revision-quality-desktop.png'),
        animations: 'disabled',
        fullPage: true,
      })
      const reportWrapper = page.locator('.revision-quality-drawer .ant-drawer-content-wrapper')
      const desktopBounds = await reportWrapper.boundingBox()
      await page.setViewportSize({ width: 390, height: 844 })
      const resizeStart = await reportWrapper.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          x: bounds.x,
          width: bounds.width,
          right: bounds.right,
          transition: getComputedStyle(element).transition,
        }
      })
      // Drawer transitions width as well as position; measure after the open drawer finishes resizing.
      await expect
        .poll(async () => {
          const bounds = await reportWrapper.boundingBox()
          return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390
        })
        .toBe(true)
      const button = await dialog
        .getByRole('button', { name: protoLocales.zh.qualityDownload, exact: true })
        .boundingBox()
      expect(button!.x).toBeGreaterThanOrEqual(0)
      expect(button!.x + button!.width).toBeLessThanOrEqual(390)
      await testInfo.attach('live-quality-resize-layout', {
        body: JSON.stringify({
          desktopBounds,
          resizeStart,
          settled: await reportWrapper.boundingBox(),
          download: button,
        }),
        contentType: 'application/json',
      })
      await page.screenshot({
        path: testInfo.outputPath('live-revision-quality-mobile.png'),
        animations: 'disabled',
        fullPage: true,
      })
      await page.setViewportSize({ width: 1440, height: 1000 })
      await dialog.getByRole('button', { name: '关闭', exact: true }).click()
      await history.getByRole('button', { name: '关闭', exact: true }).click()
    })

    await test.step('compare two fixed revisions through history without moving current or exposing grants', async () => {
      await page.getByRole('button', { name: '历史修订', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '历史修订', exact: true })
      for (const id of [firstRevisionId, secondRevisionId])
        await drawer
          .getByRole('checkbox', {
            name: protoLocales.zh.selectRevision.replace('{id}', id),
            exact: true,
          })
          .locator('..')
          .click()
      const opening = page.waitForEvent('popup')
      const comparing = page
        .context()
        .waitForEvent(
          'response',
          (response) =>
            new URL(response.url()).pathname ===
            `/api/prototype-hub/versions/${versionId}/revisions/_compare`,
        )
      await drawer
        .getByRole('button', { name: protoLocales.zh.compareRevisions, exact: true })
        .click()
      const comparison = await opening
      try {
        const metadata = await result<RevisionComparison>(await comparing)
        expect(metadata.versionId).toBe(versionId)
        expect(metadata.left.id).toBe(firstRevisionId)
        expect(metadata.right.id).toBe(secondRevisionId)
        expect(metadata.summary.pages.changed).toBeGreaterThan(0)
        expect(metadata.summary.files.changed).toBeGreaterThan(0)
        const entry = metadata.pages.data.find((row) => row.path === metadata.left.entryFile)
        expect(entry?.left?.pageId).toBeTruthy()
        expect(entry?.right?.pageId).toBeTruthy()
        await comparison
          .getByRole('region', { name: protoLocales.zh.comparePages, exact: true })
          .getByRole('row')
          .filter({ has: comparison.getByText(entry!.path, { exact: true }) })
          .getByRole('button', { name: protoLocales.zh.compareOpenPage, exact: true })
          .click()
        for (const [side, heading] of [
          ['left', 'Runtime fixture home'],
          ['right', 'Runtime fixture revision two'],
        ] as const) {
          const pane = comparison.locator(`[data-pane=${side}]`)
          await expect(
            pane.frameLocator('iframe').getByRole('heading', { name: heading, exact: true }),
          ).toBeVisible()
          await expect(pane.locator('iframe')).toHaveAttribute(
            'sandbox',
            'allow-scripts allow-forms',
          )
          await expect(pane.locator('iframe')).toHaveAttribute('referrerpolicy', 'no-referrer')
        }
        const query = new URL(comparison.url()).searchParams
        expect([...query.keys()]).toEqual([
          'leftRevisionId',
          'rightRevisionId',
          'leftPageId',
          'rightPageId',
        ])
        expect(query.get('leftRevisionId')).toBe(firstRevisionId)
        expect(query.get('rightRevisionId')).toBe(secondRevisionId)
        expect(query.get('leftPageId')).toBe(entry!.left!.pageId)
        expect(query.get('rightPageId')).toBe(entry!.right!.pageId)
        await comparison.screenshot({
          path: testInfo.outputPath('live-revision-comparison-desktop.png'),
          animations: 'disabled',
          fullPage: true,
        })
        await comparison.setViewportSize({ width: 390, height: 844 })
        await expect(
          comparison.getByRole('button', { name: protoLocales.zh.compareCopyLink, exact: true }),
        ).toBeVisible()
        for (const side of ['left', 'right']) {
          const box = await comparison.locator(`[data-pane=${side}]`).boundingBox()
          expect(box!.width).toBeGreaterThan(300)
          expect(box!.x + box!.width).toBeLessThanOrEqual(390)
        }
        await comparison.screenshot({
          path: testInfo.outputPath('live-revision-comparison-mobile.png'),
          animations: 'disabled',
          fullPage: true,
        })
      } finally {
        await comparison.close()
      }
      await drawer.getByRole('button', { name: '关闭', exact: true }).click()
      const current = await result<Resource>(
        await request.get(`/api/prototype-hub/versions/${versionId}/current-revision`, {
          headers: owned.headers,
        }),
      )
      expect(current.id).toBe(secondRevisionId)
    })

    await test.step('manage share lifecycle through real UI and invalidate old canonical grants', async () => {
      const oldGrant = await result<PublicShare>(
        await request.get(`/api/prototype-hub/public/shares/${shareToken}`),
      )
      expect(oldGrant.revisionId).toBe(firstRevisionId)
      await page.getByRole('button', { name: '分享管理', exact: true }).click()
      const main = page.getByRole('dialog', { name: '分享管理', exact: true })
      const row = main.locator('tbody tr.ant-table-row').first()
      await expect(row.locator('.share-revision-mode')).toHaveText('固定修订')
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      const editor = page.getByRole('dialog', { name: '编辑分享', exact: true })
      await editor.getByLabel('分享描述', { exact: true }).fill('Live lifecycle review')
      await editor.getByText('跟随最新', { exact: true }).click()
      await editor.getByText('保留原密码', { exact: true }).click()
      await page.getByText('设置新密码', { exact: true }).click()
      const password = `F03-${randomUUID()}`
      await editor.getByLabel('分享密码', { exact: true }).fill(password)
      const saving = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          new URL(response.url()).pathname === `/api/prototype-hub/shares/${owned.shares[0]}`,
      )
      await editor.getByRole('button', { name: '保存', exact: true }).click()
      let changed = await result<Share>(await saving)
      expect(changed).toMatchObject({
        revisionMode: 'latest',
        revisionId: null,
        passwordRequired: true,
        configVersion: 2,
      })
      await expect(editor).not.toBeVisible()
      await expect(row.locator('.share-revision-mode')).toHaveText('跟随最新')
      expect((await request.get(oldGrant.pagesUrl!)).ok()).toBe(false)
      expect((await request.get(oldGrant.previewUrl!)).ok()).toBe(false)
      const publicPage = await page.context().newPage()
      let grant: PublicShare
      try {
        await publicPage.goto(`/share/${encodeURIComponent(shareToken)}`)
        await expect(publicPage.locator('.frame-stage > iframe')).toHaveCount(0)
        await publicPage.getByLabel('分享密码', { exact: true }).fill(password)
        const verified = publicPage.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith(`/public/shares/${shareToken}/verify`),
        )
        await publicPage.getByRole('button', { name: '打开原型', exact: true }).click()
        const verification = await verified
        expect(verification.request().headers()['x-access-token']).toBeUndefined()
        grant = await result<PublicShare>(verification)
        expect(grant.revisionId).toBe(secondRevisionId)
        expect(grant.pagesUrl).toContain(`/revisions/${secondRevisionId}/pages`)
        await expect(
          publicPage
            .frameLocator('.frame-stage > iframe')
            .getByRole('heading', { name: 'Runtime fixture revision two', exact: true }),
        ).toBeVisible()
        await expect(publicPage.locator('.frame-stage > iframe')).toHaveAttribute(
          'sandbox',
          'allow-scripts allow-forms',
        )
      } finally {
        await publicPage.close()
      }
      async function action(
        label: string,
        suffix: string,
        confirmation: string,
        expectedVersion: number,
      ) {
        expect(changed).toMatchObject({
          id: owned.shares[0],
          configVersion: expectedVersion,
          revoked: false,
        })
        await expect(row.locator('.share-url')).toHaveText(
          new URL(`/share/${encodeURIComponent(changed.token)}`, page.url()).href,
        )
        await expect(row.locator('.share-status')).toHaveText(
          changed.enabled ? '永久有效' : '已暂停',
        )
        const button = row.getByRole('button', { name: label, exact: true })
        await expect(button).toBeEnabled()
        await button.click()
        const pending = page.waitForResponse(
          (response) =>
            ['PUT', 'POST'].includes(response.request().method()) &&
            response.url().endsWith(`/shares/${changed.id}/${suffix}`),
        )
        const prompt = page
          .getByRole('tooltip')
          .filter({ has: page.getByText(confirmation, { exact: true }) })
        await expect(prompt).toBeVisible()
        await prompt.getByRole('button', { name: '确定', exact: true }).click()
        const response = await pending
        expect(response.request().postDataJSON()).toMatchObject({ expectedVersion })
        changed = await result<Share>(response)
        expect(changed.configVersion).toBe(expectedVersion + 1)
      }
      await action('暂停分享', 'enabled', '确认暂停分享？已有访问授权将失效。', 2)
      await expect(row.locator('.share-status')).toHaveText('已暂停')
      expect((await request.get(grant!.pagesUrl!)).ok()).toBe(false)
      expect((await request.get(grant!.previewUrl!)).ok()).toBe(false)
      await action('恢复分享', 'enabled', '确认恢复分享？暂停前的访问授权不会恢复。', 3)
      expect((await request.get(grant!.pagesUrl!)).ok()).toBe(false)
      await action(
        '轮换链接',
        'rotate-link',
        '确认轮换链接？原链接和已有访问授权将永久失效，请重新分发新链接。',
        4,
      )
      expect(changed.token).not.toBe(shareToken)
      expect((await request.get(`/api/prototype-hub/public/shares/${shareToken}`)).ok()).toBe(false)
      shareToken = changed.token
      const fresh = await result<PublicShare>(
        await request.post(`/api/prototype-hub/public/shares/${shareToken}/verify`, {
          data: { password },
        }),
      )
      expect(fresh.revisionId).toBe(secondRevisionId)
      await action(
        '永久撤销',
        'revoke',
        '确认永久撤销？此操作不可恢复，链接和已有访问授权将失效。',
        5,
      )
      await expect(row.locator('.share-status')).toHaveText('已撤销')
      expect((await request.get(fresh.pagesUrl!)).ok()).toBe(false)
      expect((await request.get(fresh.previewUrl!)).ok()).toBe(false)
      await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
      await expect(row.getByRole('button', { name: '恢复分享', exact: true })).toHaveCount(0)
      await main.getByRole('button', { name: 'Close', exact: true }).click()
    })

    await test.step('verify a local SMTP visitor identity in the trusted public shell and sign out', async () => {
      const mail = `review-${randomUUID()}@example.invalid`
      const password = `Review-${randomUUID()}`
      const created = await result<Share>(
        await request.post(`/api/prototype-hub/versions/${versionId}/shares`, {
          headers: owned.headers,
          data: { password },
        }),
      )
      owned.shares.push(created.id)
      const publicPage = await page.context().newPage()
      try {
        const policy = await result<{ configVersion: number }>(
          await request.get(`/api/prototype-hub/shares/${created.id}/review`, {
            headers: owned.headers,
          }),
        )
        const updated = await result<{ enabled: boolean; mailAvailable: boolean }>(
          await request.put(`/api/prototype-hub/shares/${created.id}/review`, {
            headers: owned.headers,
            data: { enabled: true, expectedVersion: policy.configVersion },
          }),
        )
        expect(updated).toMatchObject({ enabled: true, mailAvailable: true })
        await publicPage.goto(`/share/${encodeURIComponent(created.token)}`)
        await expect(
          publicPage.getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true }),
        ).toHaveCount(0)
        await publicPage.getByLabel('分享密码', { exact: true }).fill(password)
        await publicPage.getByRole('button', { name: '打开原型', exact: true }).click()
        await expect(publicPage.locator('.frame-stage > iframe')).toHaveAttribute(
          'sandbox',
          'allow-scripts allow-forms',
        )
        let sends = 0
        publicPage.on('request', (outgoing) => {
          if (outgoing.url().endsWith('/review/challenges')) sends++
        })
        await publicPage
          .getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true })
          .click()
        const drawer = publicPage.getByRole('dialog', {
          name: protoLocales.zh.reviewIdentity,
          exact: true,
        })
        await drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true }).fill(mail)
        await drawer
          .getByLabel(protoLocales.zh.reviewName, { exact: true })
          .fill('Local SMTP visitor')
        await drawer
          .getByRole('button', { name: protoLocales.zh.reviewSendCode, exact: true })
          .click()
        await expect(
          drawer.getByText(protoLocales.zh.reviewCodeSent, { exact: true }),
        ).toBeVisible()
        const readCode = () => {
          const mailbox = JSON.parse(readFileSync(environment.reviewMailboxPath, 'utf8')) as {
            recipient: string
            code: string
          }[]
          return mailbox.find((item) => item.recipient === mail && /^[0-9]{6}$/.test(item.code))
            ?.code
        }
        // Poll only a boolean so assertion output cannot disclose mailbox codes.
        await expect.poll(() => !!readCode()).toBe(true)
        await drawer.getByLabel(protoLocales.zh.reviewCode, { exact: true }).fill(readCode()!)
        const verifying = publicPage.waitForResponse((response) =>
          response.url().endsWith('/review/verify'),
        )
        await drawer
          .getByRole('button', { name: protoLocales.zh.reviewVerify, exact: true })
          .click()
        const verified = await verifying
        expect(verified.request().headers()['x-access-token']).toBeUndefined()
        expect(verified.request().headers()['x-review-csrf']).toBeTruthy()
        await expect(
          drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true }),
        ).toBeVisible()
        await expect(drawer.getByText('Local SMTP visitor', { exact: true })).toBeVisible()
        const cookies = await publicPage.context().cookies()
        const reviewCookie = cookies.find(
          (cookie) => cookie.path === `/api/prototype-hub/public/shares/${created.token}/review`,
        )
        expect(!!reviewCookie).toBe(true)
        expect(reviewCookie?.httpOnly).toBe(true)
        expect(reviewCookie?.sameSite).toBe('Strict')
        expect(sends).toBe(1)
        await drawer.getByRole('button', { name: '关闭', exact: true }).click()
        await publicPage
          .getByRole('button', { name: protoLocales.zh.reviewIdentity, exact: true })
          .click()
        await expect(
          drawer.getByText(protoLocales.zh.reviewEmailVerified, { exact: true }),
        ).toBeVisible()
        await drawer
          .getByRole('button', { name: protoLocales.zh.reviewLogout, exact: true })
          .click()
        await expect(drawer.getByLabel(protoLocales.zh.reviewEmail, { exact: true })).toBeVisible()
      } finally {
        await publicPage.close()
        const removed = await request.delete(`/api/prototype-hub/shares/${created.id}`, {
          headers: owned.headers,
        })
        expect(removed.ok()).toBe(true)
        owned.shares = owned.shares.filter((id) => id !== created.id)
      }
    })

    await test.step('enforce version capacity while existing previews remain usable', async () => {
      for (let number = 2; number <= 5; number++) {
        const version = await result<Version>(
          await request.post(`/api/prototype-hub/projects/${projectId}/versions`, {
            headers: owned.headers,
            multipart: {
              versionName: `Capacity version ${number}`,
              file: {
                name: 'runtime-site.zip',
                mimeType: 'application/zip',
                buffer: readFileSync(environment.zipPath),
              },
            },
          }),
        )
        owned.versions.push(version.id)
      }
      await page.reload()
      await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：5 / 5')
      await expect(page.getByRole('button', { name: '上传版本', exact: true })).toBeDisabled()
      await expect(
        page.getByRole('button', { name: '上传新修订', exact: true }).first(),
      ).toBeEnabled()
      await preview(page, 'Runtime fixture revision two', secondRevisionId, 'Browser replacement')
      const usage = await result<{ versions: Capacity }>(
        await request.get(`/api/prototype-hub/versions/_usage?projectId=${projectId}`, {
          headers: owned.headers,
        }),
      )
      expect(usage.versions).toMatchObject({ used: 5, limit: 5, canCreate: false })
      const overflow = await request.post(`/api/prototype-hub/projects/${projectId}/versions`, {
        headers: owned.headers,
        multipart: {
          versionName: 'Rejected overflow',
          file: {
            name: 'runtime-site.zip',
            mimeType: 'application/zip',
            buffer: readFileSync(environment.zipPath),
          },
        },
      })
      expect(overflow.status()).toBe(409)
      expect(((await overflow.json()) as { code: string }).code).toBe(
        'PROTOTYPE_HUB_VERSION_LIMIT_REACHED',
      )
    })

    await test.step('enforce project capacity without hiding existing projects', async () => {
      for (let number = 2; number <= 5; number++) {
        const project = await result<Resource>(
          await request.post('/api/prototype-hub/projects', {
            headers: owned.headers,
            data: { name: `${name} ${number}` },
          }),
        )
        owned.projects.push(project.id)
      }
      await page.goto('/prototype-hub')
      await expect(page.locator('.capacity-notice')).toContainText('项目用量：5 / 5')
      await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeDisabled()
      await expect(page.getByRole('link', { name: `详情：${name}`, exact: true })).toBeVisible()
      const overflow = await request.post('/api/prototype-hub/projects', {
        headers: owned.headers,
        data: { name: `${name} rejected` },
      })
      expect(overflow.status()).toBe(409)
      expect(((await overflow.json()) as { code: string }).code).toBe(
        'PROTOTYPE_HUB_PROJECT_LIMIT_REACHED',
      )
    })

    await test.step('query project and version pages through the real typed endpoints without legacy list fallback', async () => {
      const legacy: string[] = []
      const observe = (outgoing: import('@playwright/test').Request) => {
        const path = new URL(outgoing.url()).pathname
        if (
          outgoing.method() === 'GET' &&
          ['/api/prototype-hub/projects', '/api/prototype-hub/versions'].includes(path)
        )
          legacy.push(path)
      }
      page.on('request', observe)
      const queryResponse = (path: string, keyword?: string) =>
        page.waitForResponse((response) => {
          const outgoing = response.request()
          return (
            outgoing.method() === 'POST' &&
            new URL(response.url()).pathname === path &&
            outgoing.postDataJSON().keyword === keyword
          )
        })
      const projectSearch = page
        .getByRole('region', { name: '搜索名称', exact: true })
        .getByRole('textbox')
      await projectSearch.fill(`${name} 2`)
      const searchedProject = queryResponse('/api/prototype-hub/projects/_query', `${name} 2`)
      await projectSearch.press('Enter')
      const projectPage = await result<{
        data: Resource[]
        total: number
        pageIndex: number
        pageSize: number
      }>(await searchedProject)
      expect(projectPage).toMatchObject({ total: 1, pageIndex: 0, pageSize: 20 })
      expect(projectPage.data.map((row) => row.id)).toEqual([owned.projects[1]])
      await expect(page.locator('.project-card')).toHaveCount(1)
      const resetProjects = queryResponse('/api/prototype-hub/projects/_query')
      await page.getByRole('button', { name: '重置', exact: true }).click()
      expect((await result<{ total: number }>(await resetProjects)).total).toBe(5)
      await expect(page.locator('.project-card')).toHaveCount(5)
      await page.getByRole('link', { name: `详情：${name}`, exact: true }).click()
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      const versionSearch = page
        .getByRole('region', { name: '搜索名称', exact: true })
        .getByRole('textbox')
      await versionSearch.fill('Browser replacement')
      const searchedVersions = queryResponse(
        '/api/prototype-hub/versions/_query',
        'Browser replacement',
      )
      await versionSearch.press('Enter')
      const versionResponse = await searchedVersions
      expect(new URL(versionResponse.url()).searchParams.get('projectId')).toBe(projectId)
      const versionPage = await result<{ data: Version[]; total: number; pageIndex: number }>(
        versionResponse,
      )
      expect(versionPage).toMatchObject({ total: 1, pageIndex: 0 })
      expect(versionPage.data.map((row) => row.id)).toEqual([versionId])
      await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(1)
      await page.locator('.prototype-list-order .ant-select-selector').click()
      const sorted = queryResponse('/api/prototype-hub/versions/_query', 'Browser replacement')
      await page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        .getByText('名称升序', { exact: true })
        .click()
      const sortedResponse = await sorted
      expect(sortedResponse.request().postDataJSON()).toMatchObject({
        sortBy: 'name',
        sortOrder: 'asc',
        pageIndex: 0,
      })
      expect((await result<{ total: number }>(sortedResponse)).total).toBe(1)
      const resetVersions = queryResponse('/api/prototype-hub/versions/_query')
      await page.getByRole('button', { name: '重置', exact: true }).click()
      expect((await result<{ total: number }>(await resetVersions)).total).toBe(5)
      await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(5)
      page.off('request', observe)
      expect(legacy).toEqual([])
    })

    await test.step('soft delete through the UI, release usage and keep old grants denied after replacement', async () => {
      const shared = await result<Share>(
        await request.post(`/api/prototype-hub/versions/${versionId}/shares`, {
          headers: owned.headers,
          data: { revisionMode: 'fixed' },
        }),
      )
      owned.shares.push(shared.id)
      const retainedShares = await result<Share[]>(
        await request.get(`/api/prototype-hub/versions/${versionId}/shares`, {
          headers: owned.headers,
        }),
      )
      const grant = await result<PublicShare>(
        await request.get(`/api/prototype-hub/public/shares/${shared.token}`),
      )
      const internal = await result<{ previewUrl: string }>(
        await request.post(
          `/api/prototype-hub/versions/${versionId}/revisions/${secondRevisionId}/preview-session`,
          {
            headers: owned.headers,
          },
        ),
      )
      expect((await request.get(grant.previewUrl!)).ok()).toBe(true)
      expect((await request.get(internal.previewUrl)).ok()).toBe(true)
      const row = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: 'Browser replacement', exact: true }) })
      await row.getByRole('button', { name: '删除', exact: true }).click()
      const prompt = page.locator('.ant-popconfirm')
      await expect(prompt).toContainText(protoLocales.zh.versionDeleteConfirm)
      await expect(prompt).toContainText('30 天')
      await expect(prompt).toContainText('到期自动永久清理')
      const deleting = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          new URL(response.url()).pathname === `/api/prototype-hub/versions/${versionId}`,
      )
      await prompt.getByRole('button', { name: '确定', exact: true }).click()
      expect((await deleting).status()).toBe(200)
      // Retained shares become inaccessible with their parent; teardown tracks only live resources.
      owned.versions = owned.versions.filter((id) => id !== versionId)
      owned.shares = owned.shares.filter((id) => !retainedShares.some((share) => share.id === id))
      await expect(row).toHaveCount(0)
      await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：4 / 5')
      await expect(page.getByRole('button', { name: '上传版本', exact: true })).toBeEnabled()
      const usage = await result<{ versions: Capacity }>(
        await request.get(`/api/prototype-hub/versions/_usage?projectId=${projectId}`, {
          headers: owned.headers,
        }),
      )
      expect(usage.versions).toMatchObject({ used: 4, limit: 5, canCreate: true })
      expect((await request.get(internal.previewUrl)).status()).toBe(403)
      for (const url of [
        grant.previewUrl!,
        grant.pagesUrl!,
        `/api/prototype-hub/public/shares/${shared.token}`,
      ])
        expect((await request.get(url)).status()).toBe(404)
      for (const suffix of [
        '',
        `/revisions/${firstRevisionId}`,
        `/revisions/${secondRevisionId}/pages`,
        '/shares',
      ])
        expect(
          (
            await request.get(`/api/prototype-hub/versions/${versionId}${suffix}`, {
              headers: owned.headers,
            })
          ).status(),
        ).toBe(404)
      expect(
        (
          await request.post(
            `/api/prototype-hub/versions/${versionId}/revisions/${secondRevisionId}/preview-session`,
            { headers: owned.headers },
          )
        ).status(),
      ).toBe(404)
      const fresh = await result<Version>(
        await request.post(`/api/prototype-hub/projects/${projectId}/versions`, {
          headers: owned.headers,
          multipart: {
            versionName: 'Browser replacement',
            file: {
              name: 'replacement.zip',
              mimeType: 'application/zip',
              buffer: readFileSync(environment.zipPath),
            },
          },
        }),
      )
      owned.versions.push(fresh.id)
      expect(fresh.id).not.toBe(versionId)
      expect((await request.get(grant.previewUrl!)).status()).toBe(404)
      const stalePage = await page.context().newPage()
      try {
        for (const path of [
          `/preview/${projectId}/${versionId}?revisionId=${secondRevisionId}`,
          `/share/${shared.token}`,
        ]) {
          await stalePage.goto(path)
          await expect(stalePage.getByRole('button', { name: '重试', exact: true })).toBeVisible()
          await expect(stalePage.locator('.frame-stage > iframe')).toHaveCount(0)
        }
      } finally {
        await stalePage.close()
      }
      await page.reload()
      await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：5 / 5')
      const emptyProjectId = owned.projects[1]!
      await page.goto('/prototype-hub')
      const card = page.getByRole('link', { name: `详情：${name} 2`, exact: true })
      await card.getByRole('button', { name: '删除', exact: true }).click()
      await expect(prompt).toContainText(protoLocales.zh.projectDeleteConfirm)
      await expect(prompt).toContainText('30 天')
      await expect(prompt).toContainText('到期自动永久清理')
      const deletingProject = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          new URL(response.url()).pathname === `/api/prototype-hub/projects/${emptyProjectId}`,
      )
      await prompt.getByRole('button', { name: '确定', exact: true }).click()
      expect((await deletingProject).status()).toBe(200)
      owned.projects = owned.projects.filter((id) => id !== emptyProjectId)
      await expect(card).toHaveCount(0)
      await expect(page.locator('.capacity-notice')).toContainText('项目用量：4 / 5')
      await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeEnabled()
      const replacementProject = await result<Resource>(
        await request.post('/api/prototype-hub/projects', {
          headers: owned.headers,
          data: { name: `${name} 2` },
        }),
      )
      owned.projects.push(replacementProject.id)
      expect(replacementProject.id).not.toBe(emptyProjectId)
      expect(
        (
          await request.get(`/api/prototype-hub/projects/${emptyProjectId}`, {
            headers: owned.headers,
          })
        ).status(),
      ).toBe(404)
      const projectUsage = await result<{ projects: Capacity }>(
        await request.get('/api/prototype-hub/projects/_usage', { headers: owned.headers }),
      )
      expect(projectUsage.projects).toMatchObject({ used: 5, limit: 5, canCreate: false })
    })

    await test.step('restore through project and version recycle bins without reviving old grants', async () => {
      // Free this test's active version slots; retained revisions remain available for explicit restore.
      for (const id of [...owned.versions]) {
        await result(
          await request.delete(`/api/prototype-hub/versions/${id}`, { headers: owned.headers }),
        )
        owned.versions = owned.versions.filter((entry) => entry !== id)
      }
      await page.goto(`/prototype-hub/projects/${projectId}`)
      await page.locator('.prototype-list-mode').getByText('回收站', { exact: true }).click()
      await expect(page.getByRole('radio', { name: '回收站', exact: true })).toBeChecked()
      await expect(page.locator('.ant-alert-info')).toContainText(protoLocales.zh.recycleHint)
      await expect(page.locator('.ant-alert-info')).toContainText('30 天，到期不可恢复')
      const row = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: 'Browser replacement', exact: true }) })
        .filter({ has: page.getByRole('cell', { name: '2 个修订', exact: true }) })
      const restoringVersion = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/prototype-hub/versions/${versionId}/_restore`,
      )
      await row.getByRole('button', { name: '恢复', exact: true }).click()
      await page
        .locator('.ant-popconfirm')
        .getByRole('button', { name: '确定', exact: true })
        .click()
      const restored = await result<Version>(await restoringVersion)
      expect(restored.id).toBe(versionId)
      expect(restored.currentRevisionId).toBe(secondRevisionId)
      owned.versions.push(versionId)
      const revoked = await result<Share[]>(
        await request.get(`/api/prototype-hub/versions/${versionId}/shares`, {
          headers: owned.headers,
        }),
      )
      expect(revoked.length).toBeGreaterThan(0)
      for (const share of revoked) {
        expect(share.revoked).toBe(true)
        expect(
          (await request.get(`/api/prototype-hub/public/shares/${share.token}`)).status(),
        ).toBe(404)
      }
      const freshSession = await result<{ previewUrl: string }>(
        await request.post(
          `/api/prototype-hub/versions/${versionId}/revisions/${secondRevisionId}/preview-session`,
          { headers: owned.headers },
        ),
      )
      expect((await request.get(freshSession.previewUrl)).status()).toBe(200)
      await result(
        await request.delete(`/api/prototype-hub/versions/${versionId}`, {
          headers: owned.headers,
        }),
      )
      owned.versions = owned.versions.filter((id) => id !== versionId)
      await result(
        await request.delete(`/api/prototype-hub/projects/${projectId}`, {
          headers: owned.headers,
        }),
      )
      owned.projects = owned.projects.filter((id) => id !== projectId)
      expect((await request.get(freshSession.previewUrl)).status()).toBe(403)
      await page.goto('/prototype-hub/recycle-bin')
      await expect(page.getByRole('heading', { name: '回收站', exact: true })).toBeVisible()
      await expect(page.locator('.prototype-list-mode')).toHaveCount(0)
      const card = page
        .locator('.project-card')
        .filter({ hasText: name })
        .filter({ hasNotText: `${name} 2` })
        .filter({ hasNotText: `${name} 3` })
        .filter({ hasNotText: `${name} 4` })
        .filter({ hasNotText: `${name} 5` })
      const restoringProject = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/prototype-hub/projects/${projectId}/_restore`,
      )
      await card.getByRole('button', { name: '恢复', exact: true }).click()
      await page
        .locator('.ant-popconfirm')
        .getByRole('button', { name: '确定', exact: true })
        .click()
      expect((await result<Resource>(await restoringProject)).id).toBe(projectId)
      owned.projects.push(projectId)
      expect(
        (
          await request.get(`/api/prototype-hub/versions/${versionId}`, { headers: owned.headers })
        ).status(),
      ).toBe(404)
      await page.getByRole('button', { name: '查看该项目的版本回收站', exact: true }).click()
      await expect(page).toHaveURL(
        new RegExp(`/prototype-hub/projects/${projectId}\\?recycle=versions$`),
      )
      await expect(page.getByRole('radio', { name: '回收站', exact: true })).toBeChecked()
      const secondRestore = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/prototype-hub/versions/${versionId}/_restore`,
      )
      await row.getByRole('button', { name: '恢复', exact: true }).click()
      await page
        .locator('.ant-popconfirm')
        .getByRole('button', { name: '确定', exact: true })
        .click()
      expect((await result<Version>(await secondRestore)).id).toBe(versionId)
      owned.versions.push(versionId)
      const freshShare = await result<Share>(
        await request.post(`/api/prototype-hub/versions/${versionId}/shares`, {
          headers: owned.headers,
          data: { revisionMode: 'fixed' },
        }),
      )
      owned.shares.push(freshShare.id)
      const granted = await result<PublicShare>(
        await request.get(`/api/prototype-hub/public/shares/${freshShare.token}`),
      )
      expect((await request.get(granted.previewUrl!)).status()).toBe(200)
      for (const old of revoked)
        expect((await request.get(`/api/prototype-hub/public/shares/${old.token}`)).status()).toBe(
          404,
        )
    })
  },
)
