import { test, expect } from '@playwright/test'
import { login } from './system-helpers'
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('password steps reject old failure, revalidate after back and preserve the raw final DTO on retry', async ({
  page,
}) => {
  await login(page)
  await page.goto('account/center')
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const modal = page.getByRole('dialog')
  let oldChecks = 0,
    finalWrites = 0
  let releaseWrite!: () => void
  const firstWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  const newChecks: string[] = [],
    saved: unknown[] = []
  await page.route('**/api/user/me/password/_validate', (route) => {
    oldChecks++
    return route.fulfill({
      json: { success: true, status: 200, result: { passed: oldChecks !== 1 } },
    })
  })
  await page.route('**/api/user/password/_validate', (route) => {
    newChecks.push(route.request().postData() || '')
    return route.fulfill({ json: { success: true, status: 200, result: { passed: true } } })
  })
  await page.route('**/api/user/passwd', async (route) => {
    saved.push(route.request().postDataJSON())
    finalWrites++
    if (finalWrites === 1) await firstWrite
    return finalWrites === 1
      ? route.fulfill({
          status: 400,
          json: { success: false, status: 400, message: '最终旧密码校验失败' },
        })
      : route.fulfill({ json: { success: true, status: 200, result: true } })
  })
  await modal.getByLabel('旧密码', { exact: true }).fill(' old ')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(modal.getByText('旧密码不正确，请重新输入', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('新密码', { exact: true })).toHaveCount(0)
  expect(oldChecks).toBe(1)
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(modal.getByLabel('新密码', { exact: true })).toBeVisible()
  await modal.getByRole('button', { name: '上一步', exact: true }).click()
  await modal.getByLabel('旧密码', { exact: true }).fill(' old again ')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  expect(oldChecks).toBe(3)
  const newer = ' ' + 'x'.repeat(126) + ' '
  await modal.getByLabel('新密码', { exact: true }).fill(newer)
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('确认密码', { exact: true }).fill(newer)
  const writing = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/user/passwd'),
  )
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await writing
  await expect(modal.locator('form button[type="submit"]')).toBeDisabled()
  await expect(modal.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
  await expect(modal.getByLabel('确认密码', { exact: true })).toBeDisabled()
  await expect(modal.locator('.ant-modal-close')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  await modal.locator('form').dispatchEvent('submit')
  expect(finalWrites).toBe(1)
  releaseWrite()
  await expect(modal.getByText('最终旧密码校验失败', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeTruthy()
  expect(saved).toEqual([{ oldPassword: ' old again ', newPassword: newer }])
  await page.screenshot({
    path: test.info().outputPath('password-confirm-step.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(saved).toEqual([
    { oldPassword: ' old again ', newPassword: newer },
    { oldPassword: ' old again ', newPassword: newer },
  ])
  expect(newChecks).toEqual([newer, newer, newer])
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})

test('a cancelled old-password request cannot advance a reopened mobile password draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('account/center')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/user/me/password/_validate', async (route) => {
    await gate
    if (route.request().failure()) return
    await route.fulfill({
      json: { success: true, status: 200, result: { passed: false, reason: '迟到校验错误' } },
    })
  })
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('旧密码', { exact: true }).fill('old')
  const checking = page.waitForRequest((request) =>
    request.url().endsWith('/user/me/password/_validate'),
  )
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await checking
  await expect(modal.getByLabel('旧密码', { exact: true })).toBeDisabled()
  await expect(modal.locator('form button[type="submit"]')).toBeDisabled()
  const cancelled = page.waitForEvent('requestfailed', (request) =>
    request.url().endsWith('/user/me/password/_validate'),
  )
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  expect((await cancelled).failure()?.errorText).toContain('ERR_ABORTED')
  await expect(modal).toHaveCount(0)
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  release()
  await expect(modal.getByLabel('旧密码', { exact: true })).toHaveValue('')
  await expect(modal.getByLabel('新密码', { exact: true })).toHaveCount(0)
  await expect(modal.getByText('迟到校验错误', { exact: true })).toHaveCount(0)
  await expect(modal.getByLabel('旧密码', { exact: true })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeTruthy()
})
