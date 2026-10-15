import { test, expect } from '@playwright/test'
import { login } from './system-helpers'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})
test('personal center profile edit and password change', async ({ page }) => {
  await login(page)
  await page.goto('account/center')
  const profile = page.locator('.ant-descriptions')
  await expect(profile.getByText('admin', { exact: true })).toBeVisible()
  await expect(profile.getByText('Admin', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog')
  await editor.getByLabel('名称', { exact: true }).fill('个人资料测试')
  await editor.getByLabel('联系电话', { exact: true }).fill('13800138000')
  await editor.getByLabel('电子邮箱', { exact: true }).fill('profile@example.com')
  const save = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/user/detail'),
  )
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  expect((await save).postDataJSON()).toEqual({
    name: '个人资料测试',
    telephone: '13800138000',
    email: 'profile@example.com',
  })
  await expect(editor).toHaveCount(0)
  await expect(profile.getByText('个人资料测试', { exact: true })).toBeVisible()
  await expect(profile.getByText('13800138000', { exact: true })).toBeVisible()
  await expect(profile.getByText('profile@example.com', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('旧密码', { exact: true }).fill('old-password')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('新密码', { exact: true }).fill('Newpassword123')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('确认密码', { exact: true }).fill('Newpassword123')
  const password = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/user/passwd'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  expect((await password).postDataJSON()).toEqual({
    oldPassword: 'old-password',
    newPassword: 'Newpassword123',
  })
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})
