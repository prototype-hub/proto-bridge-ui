import { expect, test, type APIResponse, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { PublicShare, Version, Project } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
const file = { name: 'site.zip', mimeType: 'application/zip', buffer: Buffer.from('fixture') }
async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { result: T }).result
}
async function expectUsableConfirmation(prompt: Locator) {
  await expect(prompt).toBeVisible()
  await expect
    .poll(() =>
      prompt.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.width > 100 &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        )
      }),
    )
    .toBe(true)
  const confirm = prompt.getByRole('button', { name: '确定', exact: true })
  await expect(confirm).toBeInViewport({ ratio: 1 })
  await confirm.click({ trial: true })
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('soft deletion releases usage while replacement IDs cannot revive old member or public links', async ({
  page,
  request,
}, testInfo) => {
  await login(page)
  const oldGrant = await result<PublicShare>(
    await request.get(`${origin}/api/prototype-hub/public/shares/open`),
  )
  const session = await result<{ previewUrl: string }>(
    await request.post(`${origin}/api/prototype-hub/versions/v1/revisions/r-v1/preview-session`, {
      headers,
    }),
  )
  const created: string[] = []
  for (let number = 2; number <= 5; number++) {
    const value = await result<Version>(
      await request.post(`${origin}/api/prototype-hub/projects/p1/versions`, {
        headers,
        multipart: { versionName: `Capacity ${number}`, file },
      }),
    )
    created.push(value.id)
  }
  await page.goto('prototype-hub/projects/p1')
  await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：5 / 5')
  await expect(page.getByRole('button', { name: '上传版本', exact: true })).toBeDisabled()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
  await row.getByRole('button', { name: '删除', exact: true }).click()
  const prompt = page
    .getByRole('tooltip')
    .filter({ has: page.getByText(protoLocales.zh.versionDeleteConfirm, { exact: true }) })
  await expect(prompt).toContainText(protoLocales.zh.versionDeleteConfirm)
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  await expect(prompt).toBeHidden()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await expectUsableConfirmation(prompt)
  await page.screenshot({
    path: testInfo.outputPath('soft-delete-confirm.png'),
    animations: 'disabled',
  })
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  await expect(prompt).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await expectUsableConfirmation(prompt)
  await page.screenshot({
    path: testInfo.outputPath('soft-delete-confirm-mobile.png'),
    animations: 'disabled',
  })
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(row).toHaveCount(0)
  await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：4 / 5')
  await expect(page.getByRole('button', { name: '上传版本', exact: true })).toBeEnabled()
  expect((await request.get(`${origin}${session.previewUrl}`)).status()).toBe(403)
  for (const path of [
    '/api/prototype-hub/versions/v1',
    '/api/prototype-hub/versions/v1/revisions/r-v1',
    '/api/prototype-hub/versions/v1/revisions/r-v1/pages',
    '/api/prototype-hub/versions/v1/shares',
  ])
    expect((await request.get(`${origin}${path}`, { headers })).status()).toBe(404)
  for (const path of [
    oldGrant.pagesUrl!,
    oldGrant.previewUrl!,
    '/api/prototype-hub/public/shares/open',
  ])
    expect((await request.get(`${origin}${path}`)).status()).toBe(404)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  await expect(page.getByText('Resource unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('.frame-stage > iframe')).toHaveCount(0)
  await page.goto('share/open')
  await expect(page.getByText('Share unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('.frame-stage > iframe')).toHaveCount(0)
  const replacement = await result<Version>(
    await request.post(`${origin}/api/prototype-hub/projects/p1/versions`, {
      headers,
      multipart: { versionName: 'V1', file },
    }),
  )
  expect(replacement.id).not.toBe('v1')
  created.push(replacement.id)
  expect((await request.get(`${origin}${oldGrant.previewUrl!}`)).status()).toBe(404)
  expect(
    (await request.delete(`${origin}/api/prototype-hub/projects/p1`, { headers })).status(),
  ).toBe(409)
  for (const id of created)
    expect(
      (await request.delete(`${origin}/api/prototype-hub/versions/${id}`, { headers })).ok(),
    ).toBe(true)
  await page.goto('prototype-hub')
  await page.setViewportSize({ width: 390, height: 844 })
  const card = page.locator('.project-card').filter({ hasText: 'Contract project' })
  await card.getByRole('button', { name: '删除', exact: true }).click()
  const projectPrompt = page
    .getByRole('tooltip')
    .filter({ has: page.getByText(protoLocales.zh.projectDeleteConfirm, { exact: true }) })
  await expectUsableConfirmation(projectPrompt)
  await page.screenshot({
    path: testInfo.outputPath('soft-delete-project-confirm-mobile.png'),
    animations: 'disabled',
  })
  await projectPrompt.getByRole('button', { name: '确定', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(card).toHaveCount(0)
  await expect(page.locator('.capacity-notice')).toContainText('项目用量：0 / 5')
  for (const path of [
    '/api/prototype-hub/projects/p1',
    '/api/prototype-hub/projects/p1/members',
    '/api/prototype-hub/versions/_usage?projectId=p1',
  ])
    expect((await request.get(`${origin}${path}`, { headers })).status()).toBe(404)
  const project = await result<Project>(
    await request.post(`${origin}/api/prototype-hub/projects`, {
      headers,
      data: { name: 'Contract project' },
    }),
  )
  expect(project.id).not.toBe('p1')
  expect((await request.get(`${origin}/api/prototype-hub/projects/p1`, { headers })).status()).toBe(
    404,
  )
  expect((await request.get(`${origin}${oldGrant.previewUrl!}`)).status()).toBe(404)
})

test('retained creation receipts reject replay after deleting versions and their parent project', async ({
  request,
}) => {
  const projectOptions = {
    headers: { ...headers, 'Idempotency-Key': 'soft-project' },
    data: { name: 'Retained' },
  }
  const project = await result<Project>(
    await request.post(`${origin}/api/prototype-hub/projects`, projectOptions),
  )
  const versionOptions = {
    headers: { ...headers, 'Idempotency-Key': 'soft-version' },
    multipart: { versionName: 'Retained', file },
  }
  const versionPath = `${origin}/api/prototype-hub/projects/${project.id}/versions`
  const version = await result<Version>(await request.post(versionPath, versionOptions))
  expect(
    (await request.delete(`${origin}/api/prototype-hub/versions/${version.id}`, { headers })).ok(),
  ).toBe(true)
  expect((await request.post(versionPath, versionOptions)).status()).toBe(409)
  const fresh = await result<Version>(
    await request.post(versionPath, { headers, multipart: versionOptions.multipart }),
  )
  expect(fresh.id).not.toBe(version.id)
  expect(
    (await request.get(`${origin}/api/prototype-hub/versions/${version.id}`, { headers })).status(),
  ).toBe(404)
  expect(
    (await request.delete(`${origin}/api/prototype-hub/versions/${fresh.id}`, { headers })).ok(),
  ).toBe(true)
  expect(
    (await request.delete(`${origin}/api/prototype-hub/projects/${project.id}`, { headers })).ok(),
  ).toBe(true)
  expect(
    (await request.post(`${origin}/api/prototype-hub/projects`, projectOptions)).status(),
  ).toBe(409)
  expect((await request.post(versionPath, versionOptions)).status()).toBe(409)
  expect(
    (
      await request.post(versionPath, {
        headers: { 'X-Access-Token': 'mock-member', 'Idempotency-Key': 'soft-version' },
        multipart: versionOptions.multipart,
      })
    ).status(),
  ).toBe(404)
  expect(
    (
      await request.post(versionPath, {
        headers: { ...headers, 'Idempotency-Key': 'fresh-key' },
        multipart: versionOptions.multipart,
      })
    ).status(),
  ).toBe(404)
  expect(
    (await request.post(versionPath, { headers, multipart: versionOptions.multipart })).status(),
  ).toBe(404)
})
