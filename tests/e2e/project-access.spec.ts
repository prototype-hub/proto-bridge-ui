import { expect, test } from '@playwright/test'
import { login, select } from './system-helpers'
import { ownerProjectAccess } from '../fixtures/project-access'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('project viewer controls intersect server scope even when platform actions are granted', async ({
  page,
}) => {
  await page.route('**/api/prototype-hub/projects/p1', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          id: 'p1',
          name: 'Viewer project',
          createdBy: 'u1',
          createdAt: 1,
          updatedAt: 1,
          ...ownerProjectAccess,
          role: 'viewer',
          capabilities: {
            read: true,
            edit: false,
            manageMembers: false,
            deleteProject: false,
            manageShares: false,
          },
        },
      },
    }),
  )
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await expect(page.getByRole('heading', { name: 'Viewer project', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
  for (const name of ['上传版本', '更新版本', '项目成员', '分享管理', '删除'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
})

test('owner manages members without global user administration and member changes revoke internal preview only', async ({
  page,
  context,
  request,
}, testInfo) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  const popupReady = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const popup = await popupReady
  const frame = popup.locator('.frame-stage > iframe')
  await expect(frame).toHaveAttribute('src', /\/runtime\/v1\/[^/]+\/index\.html$/)
  const internalUrl = await frame.getAttribute('src')
  expect(internalUrl).not.toBeNull()
  expect((await request.get(internalUrl!)).status()).toBe(200)
  const userQueries: string[] = []
  page.on('request', (outgoing) => {
    if (/\/api\/user\/(?:detail\/)?_query/.test(outgoing.url()))
      userQueries.push(new URL(outgoing.url()).pathname)
  })
  await page.getByRole('button', { name: '项目成员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '项目成员', exact: true })
  await expect(dialog.getByText('所有者', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '移除成员', exact: true })).toHaveCount(0)
  await select(page, '成员', 'Operator (operator)')
  await select(page, '项目角色', '编辑者')
  await dialog.getByRole('button', { name: '添加或更新成员', exact: true }).click()
  await expect(dialog.getByText('Operator', { exact: true })).toBeVisible()
  const operatorRow = dialog.locator('tr').filter({ hasText: 'Operator' })
  await expect(operatorRow.getByText('编辑者', { exact: true })).toBeVisible()
  expect(userQueries).toEqual([])
  expect((await request.get(internalUrl!)).status()).toBe(404)
  // Public shares are separate grants and remain usable after membership changes.
  expect(
    (
      await request.get('/api/prototype-hub/public/shares/open/access-key/runtime/index.html')
    ).status(),
  ).toBe(200)
  await page.screenshot({
    path: testInfo.outputPath('project-members.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await operatorRow.getByRole('button', { name: '移除成员', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('Operator', { exact: true })).toHaveCount(0)
  await popup.close()
})

test('short preview expiry removes the real sandbox and renews only after an explicit click', async ({
  page,
}, testInfo) => {
  let exchanges = 0
  await page.route('**/api/prototype-hub/versions/v1/preview-session', async (route) => {
    const response = await route.fetch()
    const result = await response.json()
    result.result.expiresAt = Date.now() + 1600
    exchanges++
    await route.fulfill({ response, json: result })
  })
  await login(page)
  await page.goto('preview/p1/v1')
  const frame = page.locator('.frame-stage > iframe')
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
  await expect(
    page.getByText('本次预览授权已到期，请重新授权后继续查看。', { exact: true }),
  ).toBeVisible()
  await expect(frame).toHaveCount(0)
  expect(exchanges).toBe(1)
  await page.screenshot({
    path: testInfo.outputPath('preview-expired.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await page.getByRole('button', { name: '重新授权预览', exact: true }).click()
  await expect(frame).toBeVisible()
  expect(exchanges).toBe(2)
})

test('mixed project and version URLs never exchange an internal preview credential', async ({
  page,
}) => {
  let exchanges = 0
  await page.route('**/api/prototype-hub/projects/p2', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          id: 'p2',
          name: 'Different project',
          createdBy: 'u1',
          createdAt: 1,
          updatedAt: 1,
          ...ownerProjectAccess,
        },
      },
    }),
  )
  page.on('request', (outgoing) => {
    if (outgoing.url().endsWith('/preview-session')) exchanges++
  })
  await login(page)
  await page.goto('preview/p2/v1')
  await expect(page.getByText('项目不可用或无访问权限', { exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(exchanges).toBe(0)
})
