import { expect, test, type Page } from '@playwright/test'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'

async function login(page: Page, locale: 'zh' | 'en', user = 'admin') {
  await page.goto('login')
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), locale)
  await page.reload()
  await page.getByLabel(locale === 'zh' ? '用户名' : 'Username', { exact: true }).fill(user)
  await page
    .getByLabel(locale === 'zh' ? '密码' : 'Password', { exact: true })
    .fill('test-login-password')
  await page
    .getByRole('button', { name: locale === 'zh' ? '登录' : 'Sign in', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: locale === 'zh' ? '原型项目' : 'Prototype projects',
      exact: true,
    }),
  ).toBeVisible()
}
async function openItems(page: Page, locale: 'zh' | 'en', revisionId = 'r-v1') {
  const labels = protoLocales[locale]
  await page.getByRole('button', { name: labels.revisionHistory, exact: true }).first().click()
  const history = page.getByRole('dialog', { name: labels.revisionHistory, exact: true })
  await history
    .getByRole('row')
    .filter({ has: page.getByText(revisionId, { exact: true }) })
    .getByRole('button', { name: labels.workItems, exact: true })
    .click()
  await expect(history).toHaveCount(0)
  const drawer = page.getByRole('dialog', { name: labels.workItems, exact: true })
  await expect(drawer.getByText(revisionId, { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: labels.workItemAdd, exact: true })).toBeEnabled()
  return drawer
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const locale of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F16a fixed page work-item journey ${locale} ${width}`, async ({
      page,
      request,
    }, testInfo) => {
      const labels = protoLocales[locale],
        save = locale === 'zh' ? '保存' : 'Save',
        close = locale === 'zh' ? '关闭' : 'Close',
        edit = locale === 'zh' ? '编辑' : 'Edit'
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await request.put('/api/prototype-hub/versions/v1', {
        headers: { 'X-Access-Token': 'mock-admin' },
        multipart: {
          versionName: 'Current V2',
          description: 'New pointer',
          expectedRevisionId: 'r-v1',
          file: {
            name: 'update.zip',
            mimeType: 'application/zip',
            buffer: Buffer.from('new content'),
          },
        },
      })
      await login(page, locale)
      await page
        .getByRole('link', { name: `${labels.openProject}：Contract project`, exact: true })
        .click()
      const drawer = await openItems(page, locale)
      await drawer.getByRole('button', { name: labels.workItemAdd, exact: true }).click()
      const url = drawer.getByLabel(labels.workItemUrl, { exact: true }),
        note = drawer.getByLabel(labels.workItemNote, { exact: true })
      await expect(url).toBeFocused()
      await url.fill('https://user:password@example.com/tasks/1')
      await drawer.getByRole('button', { name: save, exact: true }).click()
      await expect(drawer.getByText(labels.workItemInputInvalid, { exact: true })).toBeVisible()
      await expect(url).toBeFocused()
      await url.fill('https://example.com/tasks/1')
      await note.fill('<script>window.__workItemXss=1</script>\nDelivery task')
      const back = page.goBack()
      const confirmation = page.locator('.ant-modal-confirm')
      await expect(confirmation.getByText(labels.workItemLeaveTitle, { exact: true })).toBeVisible()
      await confirmation
        .getByRole('button', { name: locale === 'zh' ? '取消' : 'Cancel', exact: true })
        .click()
      await back
      await expect(note).toHaveValue('<script>window.__workItemXss=1</script>\nDelivery task')
      await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1$/)

      await drawer.screenshot({
        path: testInfo.outputPath('work-items-editor.png'),
        animations: 'disabled',
      })
      await drawer.getByRole('button', { name: save, exact: true }).click()
      await expect(drawer.locator('.work-item-row')).toHaveCount(1)
      await expect(drawer.locator('.work-item-note')).toHaveText(
        '<script>window.__workItemXss=1</script>\nDelivery task',
      )
      await expect(drawer.locator('script')).toHaveCount(0)
      const external = drawer.locator('.work-item-link')
      await expect(external).toHaveAttribute('target', '_blank')
      await expect(external).toHaveAttribute('rel', 'noopener noreferrer')
      expect(await page.evaluate(() => Reflect.get(window, '__workItemXss'))).toBeUndefined()
      await external.focus()
      await expect(external).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(drawer.getByRole('button', { name: edit, exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(url).toBeFocused()
      await note.fill('Updated plain-text task')
      await drawer.getByRole('button', { name: save, exact: true }).click()
      await expect(drawer.locator('.work-item-note')).toHaveText('Updated plain-text task')
      await drawer.getByRole('button', { name: close, exact: true }).click()
      await expect(
        page.getByRole('button', { name: labels.revisionHistory, exact: true }).first(),
      ).toBeFocused()
      const reopened = await openItems(page, locale)
      await expect(reopened.locator('.work-item-note')).toHaveText('Updated plain-text task')
      await reopened.locator('.ant-select-selector').click()
      await page.getByTitle('Child page · child.html', { exact: true }).click()
      await expect(reopened.getByText(labels.workItemEmpty, { exact: true })).toBeVisible()
      await reopened.locator('.ant-select-selector').click()
      await page.getByTitle('Home · index.html', { exact: true }).click()
      await expect(reopened.locator('.work-item-note')).toHaveText('Updated plain-text task')

      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      const bounds = await reopened.boundingBox()
      expect(bounds?.width).toBeLessThanOrEqual(width)
      await reopened.screenshot({
        path: testInfo.outputPath('work-items-list.png'),
        animations: 'disabled',
      })
      await reopened.getByRole('button', { name: labels.workItemRemove, exact: true }).click()
      await page
        .locator('.ant-popconfirm')
        .getByRole('button', { name: labels.workItemRemove, exact: true })
        .click()
      await expect(reopened.locator('.work-item-row')).toHaveCount(0)
      await expect(reopened.getByText(labels.workItemEmpty, { exact: true })).toBeVisible()
      await reopened.getByRole('button', { name: labels.workItemAdd, exact: true }).click()
      await reopened
        .getByLabel(labels.workItemUrl, { exact: true })
        .fill('https://example.com/unsaved')
      const leaving = page.goBack()
      const prompt = page.locator('.ant-modal-confirm')
      await expect(prompt.getByText(labels.workItemLeaveTitle, { exact: true })).toBeVisible()
      await prompt.getByRole('button', { name: labels.workItemLeave, exact: true }).click()
      await leaving
      await expect(
        page.getByRole('heading', {
          name: locale === 'zh' ? '原型项目' : 'Prototype projects',
          exact: true,
        }),
      ).toBeVisible()
    })
  }
test('F16a unconfirmed create retains the exact request and is retried only by the user', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'zh')
  await page.getByRole('link', { name: '打开项目：Contract project', exact: true }).click()
  const drawer = await openItems(page, 'zh')
  const requests: unknown[] = []
  let release!: () => void
  await page.route('**/api/prototype-hub/versions/v1/work-items', async (route) => {
    requests.push(route.request().postDataJSON())
    if (requests.length > 1) return route.continue()
    await route.fetch()
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({
      status: 503,
      json: { success: false, status: 503, message: 'Response lost after commit' },
    })
  })
  await drawer.getByRole('button', { name: '关联工作项', exact: true }).click()
  await drawer.getByLabel('工作项链接', { exact: true }).fill('https://example.com/tasks/retry')
  await drawer.getByLabel('备注（可选）', { exact: true }).fill('Keep this exact input')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  await expect(drawer.getByLabel('备注（可选）', { exact: true })).toBeDisabled()
  await page.goBack()
  await expect(page).toHaveURL(/\/prototype-hub\/projects\/p1$/)
  await expect(page.locator('.ant-modal-confirm')).toHaveCount(0)
  release()
  await expect(drawer.getByText(protoLocales.zh.workItemUnknown, { exact: true })).toBeVisible()
  const notice = drawer.locator('.ant-alert-message')
  const noticeBounds = await notice.boundingBox()
  expect(noticeBounds?.width).toBeGreaterThan(250)
  const retryBounds = await drawer
    .getByRole('button', { name: '重试原操作', exact: true })
    .boundingBox()
  expect(retryBounds!.x + retryBounds!.width).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  const back = page.goBack()
  const confirmation = page.locator('.ant-modal-confirm')
  await expect(
    confirmation.getByText(protoLocales.zh.workItemLeaveTitle, { exact: true }),
  ).toBeVisible()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await back

  await expect(drawer.getByLabel('工作项链接', { exact: true })).toBeDisabled()
  await expect(drawer.getByLabel('备注（可选）', { exact: true })).toHaveValue(
    'Keep this exact input',
  )
  expect(requests).toHaveLength(1)
  await drawer.getByRole('button', { name: '刷新列表核对', exact: true }).click()
  await expect(drawer.locator('.work-item-row')).toHaveCount(1)
  await expect(drawer.getByLabel('备注（可选）', { exact: true })).toHaveValue(
    'Keep this exact input',
  )
  expect(requests).toHaveLength(1)
  await drawer.getByRole('button', { name: '重试原操作', exact: true }).click()
  await expect(drawer.locator('.work-item-row')).toHaveCount(1)
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
})
test('F16a viewer can read a fixed page and has no link editing controls', async ({ page }) => {
  await page.route('**/api/prototype-hub/projects/p1', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.result.role = 'viewer'
    body.result.capabilities = {
      read: true,
      edit: false,
      manageMembers: false,
      deleteProject: false,
      manageShares: false,
    }
    await route.fulfill({ response, json: body })
  })
  await login(page, 'zh')
  await page.getByRole('link', { name: '打开项目：Contract project', exact: true }).click()
  await page.getByRole('button', { name: '历史修订', exact: true }).click()
  await page
    .getByRole('dialog', { name: '历史修订', exact: true })
    .getByRole('button', { name: '页面工作项', exact: true })
    .click()
  const drawer = page.getByRole('dialog', { name: '页面工作项', exact: true })
  await expect(drawer.getByText(protoLocales.zh.workItemEmpty, { exact: true })).toBeVisible()
  for (const name of ['关联工作项', '编辑', '取消关联', '保存'])
    await expect(drawer.getByRole('button', { name, exact: true })).toHaveCount(0)
})

test('F16a work items use bounded server pages and clamp after unlinking the last row', async ({
  page,
  request,
}) => {
  const headers = { 'X-Access-Token': 'mock-admin' }
  const response = await request.get('/api/prototype-hub/versions/v1/revisions/r-v1/pages', {
    headers,
  })
  const pages = (await response.json()).result as { children: { pageId: string }[] }[]
  const pageId = pages[0]!.children[0]!.pageId
  for (let index = 0; index < 21; index++)
    await request.post('/api/prototype-hub/versions/v1/work-items', {
      headers,
      data: {
        revisionId: 'r-v1',
        pageId,
        url: `https://example.com/tasks/${index}`,
        note: `Task ${index}`,
        clientRequestId: `seed-${index}`,
      },
    })
  await login(page, 'zh')
  await page.getByRole('link', { name: '打开项目：Contract project', exact: true }).click()
  const drawer = await openItems(page, 'zh')
  await expect(drawer.locator('.work-item-row')).toHaveCount(20)
  const querying = page.waitForRequest(
    (request) =>
      request.url().endsWith('/work-items/_query') && request.postDataJSON().pageIndex === 1,
  )
  await drawer.locator('.ant-pagination-next').click()
  expect((await querying).postDataJSON()).toMatchObject({
    pageIndex: 1,
    pageSize: 20,
    revisionId: 'r-v1',
    pageId,
  })
  await expect(drawer.locator('.work-item-row')).toHaveCount(1)
  await drawer.getByRole('button', { name: '取消关联', exact: true }).click()
  await page
    .locator('.ant-popconfirm')
    .getByRole('button', { name: '取消关联', exact: true })
    .click()
  await expect(drawer.locator('.work-item-row')).toHaveCount(20)
  await expect(drawer.locator('.work-item-pagination')).toHaveCount(0)
})
