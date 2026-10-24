import { expect, test, type APIResponse, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import type { Version, PublicShare } from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
const file = { name: 'site.zip', mimeType: 'application/zip', buffer: Buffer.from('fixture') }
async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { result: T }).result
}
async function usable(prompt: Locator) {
  await expect(prompt).toBeVisible()
  await expect
    .poll(() =>
      prompt.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        )
      }),
    )
    .toBe(true)
  // Being inside the viewport alone does not catch a narrow column of wrapped confirmation text.
  const title = prompt.locator('.ant-popconfirm-message-title')
  await expect
    .poll(() =>
      title.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width / Number.parseFloat(style.fontSize)
      }),
    )
    .toBeGreaterThanOrEqual(16)
  await expect
    .poll(() =>
      title.evaluate((element) => {
        const style = getComputedStyle(element)
        return Math.ceil(
          element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
        )
      }),
    )
    .toBeLessThanOrEqual(6)
  await prompt.getByRole('button', { name: '确定', exact: true }).click({ trial: true })
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})
test('restores the same parent and child identities separately while old grants stay revoked', async ({
  page,
  request,
}, testInfo) => {
  const grant = await result<PublicShare>(
    await request.get(`${origin}/api/prototype-hub/public/shares/open`),
  )
  await request.delete(`${origin}/api/prototype-hub/versions/v1`, { headers })
  await request.delete(`${origin}/api/prototype-hub/projects/p1`, { headers })
  await login(page)
  await page.locator('.prototype-list-mode').getByText('回收站', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '回收站', exact: true })).toBeChecked()
  const card = page.locator('.project-card').filter({ hasText: 'Contract project' })
  await expect(card.getByRole('button', { name: '详情', exact: true })).toHaveCount(0)
  await card.getByRole('button', { name: '恢复', exact: true }).click()
  const prompt = page.locator('.ant-popconfirm')
  await usable(prompt)
  await page.screenshot({
    path: testInfo.outputPath('project-restore.png'),
    animations: 'disabled',
  })
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  await expect(card).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await card.getByRole('button', { name: '恢复', exact: true }).click()
  await usable(prompt)
  await page.screenshot({
    path: testInfo.outputPath('project-restore-mobile.png'),
    animations: 'disabled',
  })
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator('.capacity-notice')).toContainText('项目用量：1 / 5')
  expect((await request.get(`${origin}/api/prototype-hub/versions/v1`, { headers })).status()).toBe(
    404,
  )
  await page.locator('.prototype-list-mode').getByText('项目', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '项目', exact: true })).toBeChecked()
  await page
    .locator('.project-card')
    .filter({ hasText: 'Contract project' })
    .getByRole('button', { name: '详情', exact: true })
    .click()
  await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(0)
  await page.locator('.prototype-list-mode').getByText('回收站', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '回收站', exact: true })).toBeChecked()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
  await row.getByRole('button', { name: '恢复', exact: true }).click()
  await usable(prompt)
  await page.screenshot({
    path: testInfo.outputPath('version-restore-mobile.png'),
    animations: 'disabled',
  })
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：1 / 5')
  const version = await result<Version>(
    await request.get(`${origin}/api/prototype-hub/versions/v1`, { headers }),
  )
  expect(version.id).toBe('v1')
  expect(version.currentRevisionId).toBe('r-v1')
  expect((await request.get(`${origin}${grant.previewUrl!}`)).status()).toBe(404)
  expect((await request.get(`${origin}/api/prototype-hub/public/shares/open`)).status()).toBe(404)
  const session = await result<{ previewUrl: string }>(
    await request.post(`${origin}/api/prototype-hub/versions/v1/revisions/r-v1/preview-session`, {
      headers,
    }),
  )
  expect((await request.get(`${origin}${session.previewUrl}`)).ok()).toBe(true)
})
test('keeps a full-capacity restore in the recycle bin with a genuine 409 and protects viewer scope', async ({
  page,
  request,
}) => {
  await request.delete(`${origin}/api/prototype-hub/versions/v1`, { headers })
  for (let number = 0; number < 5; number++)
    await result<Version>(
      await request.post(`${origin}/api/prototype-hub/projects/p1/versions`, {
        headers,
        multipart: { versionName: `Slot ${number}`, file },
      }),
    )
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.locator('.prototype-list-mode').getByText('回收站', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '回收站', exact: true })).toBeChecked()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
  await row.getByRole('button', { name: '恢复', exact: true }).click()
  const restore = page.waitForResponse((response) =>
    response.url().endsWith('/versions/v1/_restore'),
  )
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  expect((await restore).status()).toBe(409)
  await expect(row).toBeVisible()
  await expect(page.locator('.capacity-notice')).toContainText('当前项目版本用量：5 / 5')
  expect(
    (
      await request.post(`${origin}/api/prototype-hub/versions/_deleted/_query?projectId=p1`, {
        headers: { 'X-Access-Token': 'mock-member' },
        data: {},
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await request.post(`${origin}/api/prototype-hub/versions/v1/_restore`, {
        headers: { 'X-Access-Token': 'mock-member' },
      })
    ).status(),
  ).toBe(403)
})

test('keeps long project deletion confirmation readable at the viewport edge on desktop and mobile', async ({
  page,
}, testInfo) => {
  await login(page)
  const card = page.locator('.project-card').filter({ hasText: 'Contract project' })
  const deleted: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'DELETE') deleted.push(request.url())
  })
  await card.getByRole('button', { name: '删除', exact: true }).click()
  const prompt = page.locator('.ant-popconfirm')
  await usable(prompt)
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await card.getByRole('button', { name: '删除', exact: true }).click()
  await usable(prompt)
  await page.screenshot({
    path: testInfo.outputPath('project-delete-confirm-mobile.png'),
    animations: 'disabled',
  })
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  await expect(card).toBeVisible()
  expect(deleted).toEqual([])
})
