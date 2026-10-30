import { expect, test, type APIResponse, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { Version, PublicShare } from '../../src/modules/protohub-manager-ui/types'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
const file = { name: 'site.zip', mimeType: 'application/zip', buffer: Buffer.from('fixture') }
async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { result: T }).result
}
async function usable(prompt: Locator, confirmName = '确定') {
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
  await prompt.getByRole('button', { name: confirmName, exact: true }).click({ trial: true })
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})
test('opens the scoped old link in recycle tabs and explicitly clears to one global authorized query at 390px', async ({
  page,
  request,
}, testInfo) => {
  await request.delete(`${origin}/api/prototype-hub/versions/v1`, { headers })
  await login(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const details: string[] = []
  page.on('request', (event) => {
    if (new URL(event.url()).pathname === '/api/prototype-hub/projects/p1')
      details.push(event.url())
  })
  await page.goto('prototype-hub/projects/p1?recycle=versions')
  await expect(page).toHaveURL(/\/prototype-hub\/recycle-bin\?tab=versions&projectId=p1$/)
  await expect(page.getByRole('tab', { name: '版本回收站', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('cell', { name: 'V1', exact: true })).toBeVisible()
  expect(details).toEqual([])
  const global = page.waitForResponse((event) => {
    const url = new URL(event.url())
    return (
      url.pathname === '/api/prototype-hub/versions/_deleted/_query' &&
      !url.searchParams.has('projectId')
    )
  })
  await page.getByRole('button', { name: '查看全部授权项目', exact: true }).click()
  expect((await global).status()).toBe(200)
  await expect(page).toHaveURL(/\/prototype-hub\/recycle-bin\?tab=versions$/)
  await expect(page.getByRole('cell', { name: 'V1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  const projects = page.getByRole('tab', { name: 'Project recycle bin', exact: true })
  await projects.focus()
  await projects.press('Enter')
  await expect(projects).toHaveAttribute('aria-selected', 'true')
  const versions = page.getByRole('tab', { name: 'Version recycle bin', exact: true })
  await versions.focus()
  await versions.press('Enter')
  await expect(versions).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('cell', { name: 'V1', exact: true })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('version-recycle-mobile-en.png'),
    animations: 'disabled',
  })
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
  await page
    .getByRole('complementary', { name: '二三级菜单' })
    .getByRole('menuitem', { name: '回收站', exact: true })
    .click()
  await expect(page).toHaveURL(/\/prototype-hub\/recycle-bin$/)
  await expect(page.locator('.prototype-list-mode')).toHaveCount(0)
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
  await expect(page.locator('.capacity-notice')).toContainText('已用 1 / 5')
  expect((await request.get(`${origin}/api/prototype-hub/versions/v1`, { headers })).status()).toBe(
    404,
  )
  await page.getByRole('button', { name: '查看该项目的版本回收站', exact: true }).click()
  await expect(page).toHaveURL(/\/prototype-hub\/recycle-bin\?tab=versions&projectId=p1$/)
  await expect(page.getByRole('tab', { name: '版本回收站', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
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
  expect(
    (
      await result<{ versions: { used: number } }>(
        await request.get(`${origin}/api/prototype-hub/versions/_usage?projectId=p1`, { headers }),
      )
    ).versions.used,
  ).toBe(1)
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
  await page.goto('prototype-hub/recycle-bin?tab=versions&projectId=p1')
  await expect(page.getByRole('tab', { name: '版本回收站', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
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
  expect(
    (
      await result<{ versions: { used: number } }>(
        await request.get(`${origin}/api/prototype-hub/versions/_usage?projectId=p1`, { headers }),
      )
    ).versions.used,
  ).toBe(5)
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
  await expect(prompt).toContainText(protoLocales.zh.projectDeleteConfirm)
  await expect(prompt).toContainText('30 天')
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
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await card.getByRole('button', { name: 'Delete', exact: true }).click()
  await usable(prompt, 'OK')
  await expect(prompt).toContainText(protoLocales.en.projectDeleteConfirm)
  await expect(prompt).toContainText('30 days')
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(deleted).toEqual([])
})

for (const kind of ['projects', 'versions'] as const)
  test(`expires a ${kind} tombstone while confirmation is open and refreshes after the real 404`, async ({
    page,
    request,
  }) => {
    const epoch = 2_000_000_000_000
    await request.post(`${origin}/__test/clock`, { data: { now: epoch } })
    await request.delete(`${origin}/api/prototype-hub/versions/v1`, { headers })
    if (kind === 'projects')
      await request.delete(`${origin}/api/prototype-hub/projects/p1`, { headers })
    await login(page)
    if (kind === 'versions') {
      await page.goto('prototype-hub/recycle-bin?tab=versions&projectId=p1')
    } else await page.goto('prototype-hub/recycle-bin')
    await expect(
      page.locator('.ant-alert-info').filter({ hasText: protoLocales.zh.recycleHint }),
    ).toBeVisible()
    const row =
      kind === 'projects'
        ? page.locator('.project-card').filter({ hasText: 'Contract project' })
        : page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'V1', exact: true }) })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '恢复', exact: true }).click()
    await request.post(`${origin}/__test/clock`, {
      data: { now: epoch + 30 * 24 * 60 * 60 * 1000 },
    })
    const response = page.waitForResponse((value) =>
      value.url().endsWith(`/${kind}/${kind === 'projects' ? 'p1' : 'v1'}/_restore`),
    )
    await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
    expect((await response).status()).toBe(404)
    await expect(row).toHaveCount(0)
    await expect(page.locator('.ant-alert-error')).toHaveText('Resource unavailable')
    if (kind === 'projects')
      await expect(page.locator('.capacity-notice')).toContainText('已用 0 / 5')
    else
      expect(
        (
          await result<{ versions: { used: number } }>(
            await request.get(`${origin}/api/prototype-hub/versions/_usage?projectId=p1`, {
              headers,
            }),
          )
        ).versions.used,
      ).toBe(0)
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await expect(
      page.locator('.ant-alert-info').filter({ hasText: protoLocales.en.recycleHint }),
    ).toBeVisible()
    await expect(page.locator('.ant-alert-error')).toHaveText('Resource unavailable')
  })
