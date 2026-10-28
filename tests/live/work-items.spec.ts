import { expect, test, type APIResponse } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, strToU8 } from 'fflate'
import { liveEnvironment } from './environment'
import type {
  Project,
  Version,
  WorkItem,
  PrototypePage,
} from '../../src/modules/protohub-manager-ui/types'

async function result<T>(response: Pick<APIResponse, 'ok' | 'json'>): Promise<T> {
  expect(response.ok(), 'Real backend operation must succeed').toBe(true)
  const body = (await response.json()) as { success: boolean; result: T }
  expect(body.success).toBe(true)
  return body.result
}

test('F16a real database persists member links on a fixed old revision through the UI', async ({
  page,
  request,
}) => {
  const environment = liveEnvironment()
  let headers: Record<string, string> = {},
    projectId = '',
    versionId = ''
  try {
    await page.goto('/login')
    await page.getByLabel('用户名', { exact: true }).fill(environment.username)
    await page.getByLabel('密码', { exact: true }).fill(environment.password)
    const loggingIn = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/authorize/login',
    )
    await page.getByRole('button', { name: '登录', exact: true }).click()
    const login = await result<{ token: string }>(await loggingIn)
    headers = { 'X-Access-Token': login.token, 'Accept-Language': 'zh-CN' }
    const name = `Work item acceptance ${randomUUID()}`
    const project = await result<Project>(
      await request.post('/api/prototype-hub/projects', {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { name, description: 'Isolated fixed-revision work-item acceptance' },
      }),
    )
    projectId = project.id
    const file = readFileSync(environment.zipPath)
    const version = await result<Version>(
      await request.post(`/api/prototype-hub/projects/${projectId}/versions`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        multipart: {
          versionName: 'Initial delivery',
          description: 'Immutable original content',
          file: { name: 'initial.zip', mimeType: 'application/zip', buffer: file },
        },
      }),
    )
    versionId = version.id
    const oldRevision = version.currentRevisionId!
    expect(oldRevision).toBeTruthy()
    const replacement = unzipSync(file)
    replacement['f16a-new-revision.txt'] = strToU8('New revision must not move old work items')
    const updated = await result<Version>(
      await request.put(`/api/prototype-hub/versions/${version.id}`, {
        headers,
        multipart: {
          versionName: 'Current delivery',
          description: 'A later revision',
          expectedRevisionId: oldRevision,
          file: {
            name: 'replacement.zip',
            mimeType: 'application/zip',
            buffer: Buffer.from(zipSync(replacement)),
          },
        },
      }),
    )
    expect(updated.currentRevisionId).not.toBe(oldRevision)
    const pages = await result<PrototypePage[]>(
      await request.get(
        `/api/prototype-hub/versions/${version.id}/revisions/${oldRevision}/pages`,
        { headers },
      ),
    )
    const flatten = (items: PrototypePage[]): PrototypePage[] =>
      items.flatMap((item) => [item, ...flatten(item.children || [])])
    const firstPage = flatten(pages).find((item) => !item.folder && item.pageId && item.path)!
    expect(firstPage?.pageId).toBeTruthy()
    const base = `/api/prototype-hub/versions/${version.id}/work-items`
    const pageScope = { revisionId: oldRevision, pageId: firstPage.pageId! }
    const open = async () => {
      await page.getByRole('button', { name: '历史修订', exact: true }).click()
      const history = page.getByRole('dialog', { name: '历史修订', exact: true })
      await history
        .getByRole('row')
        .filter({ has: page.getByText(oldRevision, { exact: true }) })
        .getByRole('button', { name: '页面工作项', exact: true })
        .click()
      await expect(history).toHaveCount(0)
      const drawer = page.getByRole('dialog', { name: '页面工作项', exact: true })
      await expect(drawer.getByText(oldRevision, { exact: true })).toBeVisible()
      return drawer
    }
    await page.goto(`/prototype-hub/projects/${projectId}`)
    await expect(page.locator('.version-name')).toHaveText('Current delivery')
    let drawer = await open()
    await drawer.getByRole('button', { name: '关联工作项', exact: true }).click()
    await drawer
      .getByLabel('工作项链接', { exact: true })
      .fill('https://example.com/tasks/live-acceptance')
    const literal = '<script>window.__workItemLiveXss=1</script>\nOriginal page follow-up'
    await drawer.getByLabel('备注（可选）', { exact: true }).fill(literal)
    const creating = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === base,
    )
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    const created = await result<WorkItem>(await creating)
    expect(created).toMatchObject({
      projectId,
      versionId: version.id,
      ...pageScope,
      configVersion: 0,
      note: literal,
    })
    await expect(drawer.locator('.work-item-note')).toHaveText(literal)
    await expect(drawer.locator('script')).toHaveCount(0)
    expect(await page.evaluate(() => Reflect.get(window, '__workItemLiveXss'))).toBeUndefined()
    await expect(drawer.locator('.work-item-link')).toHaveAttribute('rel', 'noopener noreferrer')
    await drawer.getByRole('button', { name: '编辑', exact: true }).click()
    await drawer.getByLabel('备注（可选）', { exact: true }).fill('Persisted after editing')
    const saving = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname === `${base}/${created.id}`,
    )
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    const edited = await result<WorkItem>(await saving)
    expect(edited).toMatchObject({
      id: created.id,
      ...pageScope,
      configVersion: 1,
      note: 'Persisted after editing',
    })
    await expect(drawer.locator('.work-item-note')).toHaveText('Persisted after editing')
    await drawer.getByRole('button', { name: '关闭', exact: true }).click()
    await page.reload()
    drawer = await open()
    await expect(drawer.locator('.work-item-note')).toHaveText('Persisted after editing')
    const saved = await result<{ data: WorkItem[]; total: number }>(
      await request.post(`${base}/_query`, {
        headers,
        data: { ...pageScope, pageIndex: 0, pageSize: 20 },
      }),
    )
    expect(saved.total).toBe(1)
    expect(saved.data[0]).toMatchObject({
      id: created.id,
      ...pageScope,
      note: 'Persisted after editing',
    })
    const currentPages = await result<PrototypePage[]>(
      await request.get(
        `/api/prototype-hub/versions/${version.id}/revisions/${updated.currentRevisionId}/pages`,
        { headers },
      ),
    )
    const currentPage = flatten(currentPages).find(
      (item) => !item.folder && item.path === firstPage.path,
    )!
    const currentItems = await result<{ total: number }>(
      await request.post(`${base}/_query`, {
        headers,
        data: {
          revisionId: updated.currentRevisionId,
          pageId: currentPage.pageId,
          pageIndex: 0,
          pageSize: 20,
        },
      }),
    )
    expect(currentItems.total).toBe(0)
    const anonymous = await request.post(`${base}/_query`, {
      data: { ...pageScope, pageIndex: 0, pageSize: 20 },
    })
    expect([401, 403]).toContain(anonymous.status())
    await drawer.getByRole('button', { name: '取消关联', exact: true }).click()
    const deleting = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `${base}/${created.id}/_delete`,
    )
    await page
      .locator('.ant-popconfirm')
      .getByRole('button', { name: '取消关联', exact: true })
      .click()
    expect(await result<boolean>(await deleting)).toBe(true)
    await expect(drawer.locator('.work-item-row')).toHaveCount(0)
    const removed = await result<{ total: number }>(
      await request.post(`${base}/_query`, {
        headers,
        data: { ...pageScope, pageIndex: 0, pageSize: 20 },
      }),
    )
    expect(removed.total).toBe(0)
  } finally {
    if (versionId)
      expect(
        (await request.delete(`/api/prototype-hub/versions/${versionId}`, { headers })).ok(),
        'Only this test version is soft-deleted before its project',
      ).toBe(true)
    if (projectId)
      expect(
        (await request.delete(`/api/prototype-hub/projects/${projectId}`, { headers })).ok(),
        'Only this test project is soft-deleted',
      ).toBe(true)
  }
})
