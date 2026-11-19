import { expect, test, type Page, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
const origin = 'http://127.0.0.1:5187'
async function openShares(page: Page) {
  await login(page)
  await page
    .getByRole('link', { name: `${protoLocales.zh.openProject}：Contract project`, exact: true })
    .click()
  const manage = page.locator('details[data-share-manage="v1"]')
  if (!(await manage.evaluate((element) => (element as HTMLDetailsElement).open)))
    await manage.locator('summary').click()
  await manage.getByRole('button', { name: '分享管理', exact: true }).click()
  return page.getByRole('dialog', { name: '分享管理', exact: true })
}
async function more(page: Page, row: Locator, name: string) {
  await row.getByRole('button', { name: /^更多操作：/ }).click()
  await page.getByRole('menuitem', { name, exact: true }).focus()
  await page.keyboard.press('Space')
  return page.locator('.ant-modal-confirm')
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})
test('share editing and lifecycle keep exact password, CAS and terminal revoke behind object-specific confirmations', async ({
  page,
  request,
}) => {
  const main = await openShares(page)
  const row = main.locator('.share-row').first()
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
  await expect(row.locator('.share-revision-mode')).toContainText('跟随最新')
  let confirmation = await more(page, row, '暂停分享')
  await expect(confirmation).toContainText('Updated review')
  await expect(confirmation).toContainText('已有访问授权将失效')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(row.getByRole('button', { name: /^更多操作：/ })).toBeFocused()
  await expect(row.locator('.share-status')).toHaveText('永久有效')
  confirmation = await more(page, row, '暂停分享')
  await confirmation.getByRole('button', { name: '暂停分享', exact: true }).click()
  await expect(row.locator('.share-status')).toHaveText('已暂停')
  await expect(row.getByRole('button', { name: '复制', exact: true })).toHaveCount(0)
  confirmation = await more(page, row, '恢复分享')
  await confirmation.getByRole('button', { name: '恢复分享', exact: true }).click()
  await expect(row.locator('.share-status')).toHaveText('永久有效')
  confirmation = await more(page, row, '轮换链接')
  await confirmation.getByRole('button', { name: '轮换链接', exact: true }).click()
  await expect(row.locator('.share-url')).toContainText('/share/rotated-')
  await row.getByRole('button', { name: '复制', exact: true }).click()
  const proof = page.getByRole('dialog', { name: '复制分享', exact: true })
  await expect(proof.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await proof.getByRole('button', { name: 'Close', exact: true }).click()
  confirmation = await more(page, row, '永久撤销')
  await confirmation.getByRole('button', { name: '永久撤销', exact: true }).click()
  await expect(row.locator('.share-status')).toHaveText('已撤销')
  await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: /^更多操作：/ }).click()
  for (const name of ['恢复分享', '轮换链接', '永久撤销'])
    await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toBeVisible()
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
test('unknown creation keeps input, blocks repeated POST and provides an explicit list reconciliation', async ({
  page,
}) => {
  const main = await openShares(page)
  await main.getByRole('button', { name: '创建分享', exact: true }).click()
  await main.getByLabel('分享描述', { exact: true }).fill('Retain unknown draft')
  await main.getByLabel('分享密码', { exact: true }).fill(' exact unknown secret ')
  let posts = 0
  await page.route('**/api/prototype-hub/versions/v1/shares', (route) => {
    if (route.request().method() === 'POST') {
      posts++
      return route.abort('failed')
    }
    return route.continue()
  })
  await main.locator('form').getByRole('button', { name: '创建分享', exact: true }).click()
  await expect(main.getByRole('alert')).toContainText('服务器可能已创建分享')
  await expect(
    main.locator('form').getByRole('button', { name: '创建分享', exact: true }),
  ).toBeDisabled()
  await main.getByLabel('分享密码', { exact: true }).press('Enter')
  expect(posts).toBe(1)
  await main.getByRole('button', { name: '核对分享列表', exact: true }).click()
  await expect(
    main.locator('form').getByRole('button', { name: '创建分享', exact: true }),
  ).toBeEnabled()
  await expect(main.getByLabel('分享描述', { exact: true })).toHaveValue('Retain unknown draft')
  await expect(main.getByLabel('分享密码', { exact: true })).toHaveValue(' exact unknown secret ')
  expect(posts).toBe(1)
  await main.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(main.getByLabel('分享描述', { exact: true })).toHaveValue('Retain unknown draft')
})
