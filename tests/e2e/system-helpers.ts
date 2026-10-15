import { expect, type Page } from '@playwright/test'
export async function login(page: Page) {
  await page.goto('login')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
}
export async function select(page: Page, label: string, option: string) {
  const field = page
    .locator('.ant-form-item')
    .filter({ has: page.locator('.ant-form-item-label').getByText(label, { exact: true }) })
    .last()
  await field.locator('.ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .filter({ hasText: option })
    .last()
    .click()
}
