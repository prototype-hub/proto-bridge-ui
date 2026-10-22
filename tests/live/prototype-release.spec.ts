import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { liveEnvironment } from './environment'
import type { Share, PublicShare } from '../../src/modules/protohub-manager-ui/types'

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
  await scope.getByRole('button', { name: 'Preview', exact: true }).first().click()
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
  async ({ page, request, owned }) => {
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
      await old.getByRole('button', { name: 'Preview', exact: true }).click()
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
      async function action(label: string, suffix: string) {
        await row.getByRole('button', { name: label, exact: true }).click()
        const pending = page.waitForResponse(
          (response) =>
            ['PUT', 'POST'].includes(response.request().method()) &&
            response.url().endsWith(`/shares/${changed.id}/${suffix}`),
        )
        await page
          .locator('.ant-popconfirm')
          .getByRole('button', { name: '确定', exact: true })
          .click()
        changed = await result<Share>(await pending)
      }
      await action('暂停分享', 'enabled')
      await expect(row.locator('.share-status')).toHaveText('已暂停')
      expect((await request.get(grant!.pagesUrl!)).ok()).toBe(false)
      expect((await request.get(grant!.previewUrl!)).ok()).toBe(false)
      await action('恢复分享', 'enabled')
      expect((await request.get(grant!.pagesUrl!)).ok()).toBe(false)
      await action('轮换链接', 'rotate-link')
      expect(changed.token).not.toBe(shareToken)
      expect((await request.get(`/api/prototype-hub/public/shares/${shareToken}`)).ok()).toBe(false)
      shareToken = changed.token
      const fresh = await result<PublicShare>(
        await request.post(`/api/prototype-hub/public/shares/${shareToken}/verify`, {
          data: { password },
        }),
      )
      expect(fresh.revisionId).toBe(secondRevisionId)
      await action('永久撤销', 'revoke')
      await expect(row.locator('.share-status')).toHaveText('已撤销')
      expect((await request.get(fresh.pagesUrl!)).ok()).toBe(false)
      expect((await request.get(fresh.previewUrl!)).ok()).toBe(false)
      await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
      await expect(row.getByRole('button', { name: '恢复分享', exact: true })).toHaveCount(0)
      await main.getByRole('button', { name: 'Close', exact: true }).click()
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
  },
)
