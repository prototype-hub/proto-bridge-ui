import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
const origin = 'http://127.0.0.1:5187'
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

test('public and newly created password shares copy project-version text and clear passwords on main close', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page)
  await page.goto('protohub/projects/p1')
  await expect(page.locator('.ant-table-tbody .ant-tag')).toHaveText('可预览')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const main = page.getByRole('dialog').filter({ has: page.getByText('分享管理', { exact: true }) })
  await main
    .locator('tbody tr.ant-table-row')
    .first()
    .getByRole('button', { name: '复制', exact: true })
    .click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `Contract project-V1：${origin}/tools/share/open`,
  )
  await main.getByLabel('分享描述', { exact: true }).fill('  Design review round two  ')
  await main.getByLabel('分享密码', { exact: true }).fill(' new secret ')
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/versions/v1/shares'),
  )
  await main.getByRole('button', { name: '创建分享', exact: true }).click()
  const value = (await (await created).json()).result as {
    token: string
    description?: string
    passwordRequired: boolean
  }
  expect(value.passwordRequired).toBe(true)
  expect(value.description).toBe('Design review round two')
  await expect(main.getByLabel('分享描述', { exact: true })).toHaveValue('')
  await expect(main.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await main.getByLabel('分享密码', { exact: true }).fill('unrelated current form value')
  await main
    .locator('tbody tr.ant-table-row')
    .last()
    .getByRole('button', { name: '复制', exact: true })
    .click()
  await expect(
    main.locator('tbody tr.ant-table-row').last().locator('.share-description-text'),
  ).toHaveText('Design review round two')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `Contract project-V1：${origin}/tools/share/${value.token}\n密码： new secret `,
  )
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(JSON.stringify(storage)).not.toContain(' new secret ')
  for (const token of ['expired', 'disabled']) {
    const row = main.locator('tbody tr.ant-table-row').filter({ hasText: '/share/' + token })
    await expect(row.getByRole('button', { name: '复制', exact: true })).toHaveCount(0)
    await expect(row.getByRole('button', { name: '删除', exact: true })).toHaveCount(1)
  }
  await main.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(main).not.toBeVisible()
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  await main
    .locator('tbody tr.ant-table-row')
    .last()
    .getByRole('button', { name: '复制', exact: true })
    .click()
  const proof = page
    .getByRole('dialog')
    .filter({ has: page.getByText('复制分享', { exact: true }) })
  await expect(proof.getByLabel('分享密码', { exact: true })).toHaveValue('')
  await proof.getByLabel('分享密码', { exact: true }).fill('wrong')
  await proof.getByRole('button', { name: '校验密码', exact: true }).click()
  await expect(proof.getByText('分享密码错误，请重新输入', { exact: true })).toBeVisible()
  await proof.getByLabel('分享密码', { exact: true }).fill(' new secret ')
  const verify = page.waitForRequest((request) => request.url().endsWith('/verify-password'))
  await proof.getByRole('button', { name: '校验密码', exact: true }).click()
  const verifyRequest = await verify
  expect(verifyRequest.method()).toBe('POST')
  expect(verifyRequest.postDataJSON()).toEqual({ password: ' new secret ' })
  expect(verifyRequest.headers()['x-access-token']).toBeTruthy()
  await expect(proof.getByRole('textbox', { name: '分享内容', exact: true })).toHaveValue(
    `Contract project-V1：${origin}/tools/share/${value.token}\n密码： new secret `,
  )
  await page.evaluate(() => navigator.clipboard.writeText('before-second-click'))
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('before-second-click')
  await proof.getByRole('button', { name: '复制', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `Contract project-V1：${origin}/tools/share/${value.token}\n密码： new secret `,
  )
})

test('share creation fields use a two-row desktop layout and status wording switches with locale', async ({
  page,
}, testInfo) => {
  const longToken = `long-${'share-token-'.repeat(12)}`
  await page.route('**/api/prototype-hub/versions/v1/shares', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: [
          {
            id: 'long-share',
            projectId: 'p1',
            versionId: 'v1',
            token: longToken,
            description: 'Description ' + 'review-'.repeat(20),
            passwordRequired: false,
            enabled: true,
            createdAt: 1700000000000,
            sharePath: `/share/${longToken}`,
          },
        ],
      },
    }),
  )
  await login(page)
  await page.goto('protohub/projects/p1')
  await expect(page.locator('.ant-table-tbody .ant-tag')).toHaveText('可预览')
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const dialog = page.getByRole('dialog')
  // Compare control shells in one settled layout frame, rather than during the modal zoom animation.
  await expect
    .poll(() => dialog.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none')
  const dialogWidth = await dialog.evaluate((element) => element.getBoundingClientRect().width)
  expect(dialogWidth).toBeGreaterThanOrEqual(1000)
  await expect(dialog.locator('thead th')).toHaveText([
    '分享链接',
    '分享描述',
    '状态',
    '分享密码',
    '分享时间',
    '失效时间',
    '操作',
  ])
  const shareRow = dialog.locator('tbody tr.ant-table-row').first()
  await expect(shareRow.locator('.share-password-state')).toHaveText('无密码')
  await expect(shareRow.locator('.share-created-time')).toHaveText(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  )
  await expect(shareRow.locator('.share-expiry-time')).toHaveText('—')
  expect(
    await shareRow
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(['复制', '删除'])
  const tableViewport = dialog.locator('.ant-table-content')
  const desktopTable = await tableViewport.evaluate((element) => {
    const viewport = element.getBoundingClientRect()
    const actions = element.querySelector('tbody td:last-child')!.getBoundingClientRect()
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      actionsRight: actions.right,
      viewportRight: viewport.right,
    }
  })
  expect(desktopTable.scrollWidth).toBeLessThanOrEqual(desktopTable.clientWidth)
  expect(desktopTable.actionsRight).toBeLessThanOrEqual(desktopTable.viewportRight + 1)
  const ellipsis = shareRow.locator('.share-url')
  expect(
    await ellipsis.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        clipped: element.scrollWidth > element.clientWidth,
      }
    }),
  ).toEqual({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', clipped: true })
  await ellipsis.hover()
  await expect(page.locator('.ant-tooltip-inner')).toHaveText(`${origin}/tools/share/${longToken}`)
  const description = shareRow.locator('.share-description-text')
  await description.hover()
  await expect(
    page.getByRole('tooltip', {
      name: 'Description ' + 'review-'.repeat(20),
      exact: true,
    }),
  ).toBeVisible()
  const form = dialog.locator('.share-create')
  const fields = await form.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      bounds: { x: bounds.x, right: bounds.right },
      fields: [
        '.share-password .ant-input-affix-wrapper',
        '.share-expiry .ant-picker',
        '.share-description textarea',
        '.share-create-button',
      ].map((selector) => {
        const rect = element.querySelector(selector)!.getBoundingClientRect()
        return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom }
      }),
    }
  })
  const [password, expiry, descriptionField, create] = fields.fields
  expect(Math.abs(password!.y - expiry!.y)).toBeLessThan(2)
  expect(password!.right).toBeLessThan(expiry!.x)
  expect(Math.abs(expiry!.right - fields.bounds.right)).toBeLessThan(2)
  expect(descriptionField!.y).toBeGreaterThan(password!.bottom)
  expect(descriptionField!.right).toBeLessThan(create!.x)
  expect(Math.abs(descriptionField!.bottom - create!.bottom)).toBeLessThan(2)
  const passwordInput = dialog.getByLabel('分享密码', { exact: true })
  const expiryInput = dialog.getByLabel('过期时间', { exact: true })
  const descriptionInput = dialog.getByLabel('分享描述', { exact: true })
  const createButton = dialog.getByRole('button', { name: '创建分享', exact: true })
  await passwordInput.focus()
  await page.keyboard.press('Tab')
  await expect(expiryInput).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(descriptionInput).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(createButton).toBeFocused()
  await page.screenshot({
    path: testInfo.outputPath('share-create-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await expect(page.locator('.ant-table-tbody .ant-tag')).toHaveText('Preview available')
  await page.route('**/api/prototype-hub/versions?*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.result = body.result.map((version: { status: string }) => ({
      ...version,
      status: 'failed',
    }))
    await route.fulfill({ response, json: body })
  })
  await page.reload()
  await expect(page.locator('.ant-table-tbody .ant-tag')).toHaveText('Processing failed')
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled()
})

test('share creation wraps on narrow screens without overflowing its modal', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('protohub/projects/p1')
  const pageWidthBeforeOpen = await page.evaluate(() => document.documentElement.scrollWidth)
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const form = dialog.locator('.share-create')
  await expect
    .poll(() => dialog.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none')
  const layout = await form.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      bounds: { x: rect.x, width: rect.width },
      fields: [
        '.share-password .ant-input-affix-wrapper',
        '.ant-picker',
        '.share-description textarea',
        '.share-create-button',
      ].map((selector) => {
        const field = element.querySelector(selector)!.getBoundingClientRect()
        return { x: field.x, y: field.y, width: field.width, height: field.height }
      }),
    }
  })
  for (const field of layout.fields) {
    expect(field.x).toBeGreaterThanOrEqual(layout.bounds.x)
    expect(field.x + field.width).toBeLessThanOrEqual(layout.bounds.x + layout.bounds.width + 1)
  }
  const [password, expiry, description, create] = layout.fields
  expect(expiry!.y).toBeGreaterThan(password!.y + password!.height)
  expect(description!.y).toBeGreaterThan(expiry!.y + expiry!.height)
  expect(create!.y).toBeGreaterThan(description!.y + description!.height)
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const tableViewport = dialog.locator('.ant-table-content')
  const tableWidths = await tableViewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  const modalBodyWidth = await dialog
    .locator('.ant-modal-body')
    .evaluate((element) => element.clientWidth)
  expect(tableWidths.clientWidth).toBeLessThanOrEqual(modalBodyWidth)
  expect(tableWidths.scrollWidth).toBeGreaterThan(tableWidths.clientWidth)
  const modalBounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right }
  })
  expect(modalBounds.left).toBeGreaterThanOrEqual(0)
  expect(modalBounds.right).toBeLessThanOrEqual(390)
  const pageWidths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(pageWidths.document).toBeLessThanOrEqual(pageWidthBeforeOpen)
  expect(pageWidths.body).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('share-create-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
})

test('HTTP history password verification requires a second gesture that copies exact multiline text natively', async ({
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
  await page.goto(`${insecure}/tools/login`)
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
  expect(await page.evaluate(() => typeof navigator.clipboard)).toBe('undefined')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await page.goto(`${insecure}/tools/protohub/projects/p1`)
  await page.getByRole('button', { name: '分享管理', exact: true }).click()
  await page
    .getByRole('dialog')
    .locator('tbody tr.ant-table-row')
    .filter({ has: page.locator('.share-url').filter({ hasText: '/share/locked' }) })
    .getByRole('button', { name: '复制', exact: true })
    .click()
  const proof = page
    .getByRole('dialog')
    .filter({ has: page.getByText('复制分享', { exact: true }) })
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
