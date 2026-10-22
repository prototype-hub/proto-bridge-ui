import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
const origin = 'http://127.0.0.1:5187'
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})
test('share editing, password policy, confirmations and terminal revoke use current configuration versions', async ({
  page,
  request,
}) => {
  await login(page)
  await page.goto('protohub/projects/p1')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const main = page.getByRole('dialog', { name: '分享管理', exact: true })
  const row = main.locator('tbody tr.ant-table-row').first()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑分享', exact: true })
  await expect(editor.getByRole('radio', { name: '固定修订', exact: true })).toBeChecked()
  await editor.getByLabel('分享描述', { exact: true }).fill('Updated review')
  await editor.getByText('跟随最新', { exact: true }).click()
  await editor.getByText('保留原密码', { exact: true }).click()
  await page.getByText('设置新密码', { exact: true }).click()
  await editor.getByLabel('分享密码', { exact: true }).fill(' precise secret ')
  const updating = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/shares/open'),
  )
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  expect((await updating).postDataJSON()).toMatchObject({
    expectedVersion: 1,
    revisionMode: 'latest',
    description: 'Updated review',
    passwordAction: 'replace',
    password: ' precise secret ',
    expiresAt: null,
  })
  await expect(editor).not.toBeVisible()
  await expect(row.locator('.share-revision-mode')).toHaveText('跟随最新')
  await row.getByRole('button', { name: '暂停分享', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '取消', exact: true }).click()
  await expect(row.locator('.share-status')).toHaveText('永久有效')
  await row.getByRole('button', { name: '暂停分享', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(row.locator('.share-status')).toHaveText('已暂停')
  await expect(row.getByRole('button', { name: '复制', exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: '恢复分享', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await row.getByRole('button', { name: '轮换链接', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(row.locator('.share-url')).toContainText('/share/rotated-')
  await row.getByRole('button', { name: '复制', exact: true }).click()
  const proof = page.getByRole('dialog', { name: '复制分享', exact: true })
  await expect(proof.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await proof.getByRole('button', { name: 'Close', exact: true }).click()
  await row.getByRole('button', { name: '永久撤销', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(row.locator('.share-status')).toHaveText('已撤销')
  for (const name of ['复制', '编辑', '恢复分享', '轮换链接', '永久撤销'])
    await expect(row.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(row.getByRole('button', { name: '删除', exact: true })).toBeVisible()
  const shares = (
    await (
      await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, {
        headers: { 'X-Access-Token': 'mock-admin' },
      })
    ).json()
  ).result
  expect(shares[0]).toMatchObject({
    configVersion: 6,
    revoked: true,
    revisionMode: 'latest',
    description: 'Updated review',
  })
})
