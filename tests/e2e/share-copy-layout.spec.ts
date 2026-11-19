import { expect, test, type Page } from '@playwright/test'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
const origin = 'http://127.0.0.1:5187'
async function openShares(page: Page, locale: 'zh' | 'en' = 'zh', host = origin) {
  await page.goto(`${host}/tools/login`)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), locale)
  await page.reload()
  await page.getByLabel(locale === 'zh' ? '用户名' : 'Username', { exact: true }).fill('admin')
  await page
    .getByLabel(locale === 'zh' ? '密码' : 'Password', { exact: true })
    .fill('test-login-password')
  await page
    .getByRole('button', { name: locale === 'zh' ? '登录' : 'Sign in', exact: true })
    .click()
  await page
    .getByRole('link', {
      name: `${protoLocales[locale].openProject}：Contract project`,
      exact: true,
    })
    .click()
  const manage = page.locator('details[data-share-manage="v1"]')
  if (!(await manage.evaluate((element) => (element as HTMLDetailsElement).open)))
    await manage.locator('summary').click()
  await manage.getByRole('button', { name: protoLocales[locale].share, exact: true }).click()
  const main = page.getByRole('dialog', { name: protoLocales[locale].share, exact: true })
  await expect(main.locator('.share-row').first()).toBeVisible()
  await expect
    .poll(() =>
      main.locator('.ant-modal-content').evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe('none')
  return main
}
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})
test('created shares offer the intended link and exact password, clear input and require history proof after closing', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const main = await openShares(page)
  await main
    .locator('.share-row')
    .first()
    .getByRole('button', { name: '复制', exact: true })
    .click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `Contract project-V1：${origin}/tools/share/open`,
  )
  await main.getByRole('button', { name: '创建分享', exact: true }).click()
  await main.getByLabel('分享描述', { exact: true }).fill('  Design review round two  ')
  await main.getByLabel('分享密码', { exact: true }).fill(' new secret ')
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/versions/v1/shares'),
  )
  await main.locator('form').getByRole('button', { name: '创建分享', exact: true }).click()
  const value = (await (await created).json()).result as {
    token: string
    description?: string
    passwordRequired: boolean
  }
  expect(value).toMatchObject({ passwordRequired: true, description: 'Design review round two' })
  await expect(main.getByText('分享已创建', { exact: true })).toBeVisible()
  await expect(main.getByRole('button', { name: '复制分享', exact: true })).toBeFocused()
  await main.getByRole('button', { name: '复制分享', exact: true }).click()
  const content = `Contract project-V1：${origin}/tools/share/${value.token}\n密码： new secret `
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content)
  const client = await context.newPage()
  await client.goto(
    (await main
      .getByRole('link', { name: '打开客户视图', exact: true })
      .getAttribute('href')) as string,
  )
  await expect(client.getByLabel('分享密码', { exact: true })).toBeVisible()
  await client.close()
  await main.getByRole('button', { name: '创建分享', exact: true }).click()
  await expect(main.getByLabel('分享描述', { exact: true })).toHaveValue('')
  await expect(main.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await main.getByLabel('分享密码', { exact: true }).fill('unrelated current value')
  await main.locator('.share-row').last().getByRole('button', { name: '复制', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content)
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(JSON.stringify(storage)).not.toContain(' new secret ')
  await main.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '放弃输入并关闭', exact: true }).click()
  await page
    .locator('details[data-share-manage="v1"]')
    .getByRole('button', { name: '分享管理', exact: true })
    .click()
  await main.locator('.share-row').last().getByRole('button', { name: '复制', exact: true }).click()
  const proof = page.getByRole('dialog', { name: '复制分享', exact: true })
  await expect(proof.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await proof.getByLabel('分享密码', { exact: true }).fill('wrong')
  await proof.getByRole('button', { name: '校验密码', exact: true }).click()
  await expect(proof.getByText('分享密码错误，请重新输入', { exact: true })).toBeVisible()
  await proof.getByLabel('分享密码', { exact: true }).fill(' new secret ')
  const verifying = page.waitForRequest((request) => request.url().endsWith('/verify-password'))
  await proof.getByRole('button', { name: '校验密码', exact: true }).click()
  const verification = await verifying
  expect(verification.method()).toBe('POST')
  expect(verification.postDataJSON()).toEqual({ password: ' new secret ' })
  expect(verification.headers()['x-access-token']).toBeTruthy()
  await expect(proof.getByRole('textbox', { name: '分享内容', exact: true })).toHaveValue(content)
  await expect(proof.getByRole('button', { name: '复制', exact: true })).toBeFocused()
  await page.evaluate(() => navigator.clipboard.writeText('before-second-click'))
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('before-second-click')
  await proof.getByRole('button', { name: '复制', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content)
})
for (const locale of ['zh', 'en'] as const)
  for (const width of [1440, 390])
    test(`UI5 share ledger and creation ${locale} ${width}`, async ({ page }, testInfo) => {
      const l = protoLocales[locale]
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 })
      const main = await openShares(page, locale)
      await expect(main.locator('.share-context')).toContainText('Contract project')
      await expect(main.locator('.share-context')).toContainText('V1')
      await expect(main.locator('.share-create-region')).toBeHidden()
      const row = main.locator('.share-row').first()
      await expect(
        row.getByRole('button', { name: locale === 'zh' ? '复制' : 'Copy', exact: true }),
      ).toBeVisible()
      const geometry = await main.locator('.ant-modal-content').evaluate((element) => {
        const box = element.getBoundingClientRect()
        const body = element.querySelector('.ant-modal-body')!
        return {
          left: box.left,
          right: box.right,
          width: body.clientWidth,
          scrollWidth: body.scrollWidth,
        }
      })
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(width)
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1)
      await row
        .getByRole('button', { name: locale === 'zh' ? '复制' : 'Copy', exact: true })
        .focus()
      await page.keyboard.press('Tab')
      await expect(
        row.getByRole('button', { name: locale === 'zh' ? '编辑' : 'Edit', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      const more = row.getByRole('button', {
        name: locale === 'zh' ? /^更多操作：/ : /^More actions:/,
      })
      await expect(more).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('menuitem', { name: l.pauseShare, exact: true })).toBeVisible()
      await expect(
        page.getByRole('menuitem', { name: l.reviewInvitations, exact: true }),
      ).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(
        page.getByRole('menuitem', { name: locale === 'zh' ? '删除' : 'Delete', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Home')
      await page.keyboard.press('Shift+Tab')
      await expect(
        row.getByRole('button', { name: locale === 'zh' ? '编辑' : 'Edit', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(more).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(
        page.getByRole('menuitem', { name: l.reviewInvitations, exact: true }),
      ).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(
        page.getByRole('menuitem', { name: l.reviewSettings, exact: true }),
      ).toBeFocused()
      await page.keyboard.press('End')
      await expect(
        page.getByRole('menuitem', { name: locale === 'zh' ? '删除' : 'Delete', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Home')
      await expect(
        page.getByRole('menuitem', { name: l.reviewInvitations, exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        main
          .locator('.share-row')
          .nth(1)
          .getByRole('button', { name: locale === 'zh' ? '复制' : 'Copy', exact: true }),
      ).toBeFocused()
      await expect(page.getByRole('menuitem', { name: l.pauseShare, exact: true })).toBeHidden()
      await page.keyboard.press('Shift+Tab')
      await expect(more).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(
        page.getByRole('menuitem', { name: l.reviewInvitations, exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(main).toBeVisible()
      await expect(more).toBeFocused()
      await expect(page.getByRole('menuitem', { name: l.pauseShare, exact: true })).toBeHidden()
      await main.getByRole('button', { name: l.createShare, exact: true }).click()
      const description = main.getByLabel(l.shareDescription, { exact: true })
      await expect(description).toBeFocused()
      await description.fill('Long description '.repeat(20))
      await main.getByText(l.shareLatest, { exact: true }).click()
      await expect(main.getByRole('radio', { name: l.shareLatest, exact: true })).toBeChecked()
      await expect(main.getByText(l.shareLatestHint, { exact: true })).toBeVisible()
      await expect(main.getByRole('radio', { name: l.shareFixed, exact: true })).not.toBeChecked()
      const submit = main.locator('form').getByRole('button', { name: l.createShare, exact: true })
      await submit.focus()
      const focused = await submit.evaluate((element) => {
        const box = element.getBoundingClientRect(),
          body = element.closest('.ant-modal-body')!.getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, bodyTop: body.top, bodyBottom: body.bottom }
      })
      expect(focused.top).toBeGreaterThanOrEqual(focused.bodyTop)
      expect(focused.bottom).toBeLessThanOrEqual(focused.bodyBottom)
      await page.screenshot({
        path: testInfo.outputPath('share-create.png'),
        fullPage: true,
        animations: 'disabled',
      })
      await page.keyboard.press('Escape')
      const guard = page.locator('.ant-modal-confirm')
      await expect(guard).toContainText(l.shareDiscardTitle)
      await guard.getByRole('button', { name: l.shareKeepEditing, exact: true }).click()
      await expect(description).toHaveValue('Long description '.repeat(20))
    })
test('HTTP history password verification still needs a second native copy gesture with selectable exact multiline text', async ({
  page,
  context,
}) => {
  const insecure = 'http://clipboard.test'
  await page.route(`${insecure}/**`, async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
  await page.addInitScript(() => {
    const nativeCopy = document.execCommand.bind(document)
    document.execCommand = (command, showUI, value) => {
      const field = document.activeElement
      const result = nativeCopy(command, showUI, value)
      if (command === 'copy')
        Reflect.set(window, '__legacyCopy', {
          result,
          inDialog: !!field?.closest('[role="dialog"]'),
          text: field instanceof HTMLTextAreaElement ? field.value : '',
        })
      return result
    }
  })
  const main = await openShares(page, 'zh', insecure)
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
  expect(await page.evaluate(() => typeof navigator.clipboard)).toBe('undefined')
  await main
    .locator('.share-row')
    .filter({ has: page.locator('.share-url').filter({ hasText: '/share/locked' }) })
    .getByRole('button', { name: '复制', exact: true })
    .click()
  const proof = page.getByRole('dialog', { name: '复制分享', exact: true })
  await proof.getByLabel('分享密码', { exact: true }).fill('test-share-password')
  await proof.getByRole('button', { name: '校验密码', exact: true }).click()
  const content = `Contract project-V1：${insecure}/tools/share/locked\n密码：test-share-password`
  await expect(proof.getByRole('textbox', { name: '分享内容', exact: true })).toHaveValue(content)
  expect(await page.evaluate(() => Reflect.get(window, '__legacyCopy'))).toBeUndefined()
  const button = proof.getByRole('button', { name: '复制', exact: true })
  await button.click()
  await expect(page.getByText('已复制', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__legacyCopy'))).toEqual({
    result: true,
    inDialog: true,
    text: content,
  })
  await expect(proof.locator('textarea')).toHaveCount(1)
  await expect(button).toBeFocused()
  await context.grantPermissions(['clipboard-read'], { origin })
  const reader = await context.newPage()
  await reader.goto(`${origin}/tools/login`)
  expect(await reader.evaluate(() => navigator.clipboard.readText())).toBe(content)
  await reader.close()
})
