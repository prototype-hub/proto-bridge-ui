import { expect, test, type Page } from '@playwright/test'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'

async function login(page: Page, locale: 'zh' | 'en') {
  await page.goto('login')
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
}
async function openPreview(page: Page, locale: 'zh' | 'en', pageId: string) {
  await page.goto(`preview/p1/v1?revisionId=r-v1&pageId=${encodeURIComponent(pageId)}`)
  await page.getByRole('button', { name: protoLocales[locale].pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: protoLocales[locale].pageDelivery, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: protoLocales[locale].pageDelivery, exact: true })
  await expect(drawer.locator('#delivery-state')).toBeVisible()
  return drawer
}
async function homeId(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/prototype-hub/versions/v1/revisions/r-v1/pages', {
    headers: { 'X-Access-Token': 'mock-admin' },
  })
  const pages = (await response.json()).result as { children: { pageId: string }[] }[]
  return pages[0]!.children[0]!.pageId
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const locale of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F28 fixed page delivery ${locale} ${width}`, async ({ page, request }, testInfo) => {
      const l = protoLocales[locale],
        save = locale === 'zh' ? '保存' : 'Save',
        close = locale === 'zh' ? '关闭' : 'Close'
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const pageId = await homeId(request)
      await login(page, locale)
      const drawer = await openPreview(page, locale, pageId)
      await expect(drawer.getByRole('heading', { name: 'Home', exact: true })).toBeFocused()
      await expect(
        drawer
          .getByLabel(l.deliveryCurrent, { exact: true })
          .getByText(l.deliveryUnset, { exact: true }),
      ).toBeVisible()
      const status = drawer.getByLabel(l.deliveryState, { exact: true }),
        assignee = drawer.getByLabel(l.deliveryAssignee, { exact: true }),
        note = drawer.getByLabel(l.deliveryReason, { exact: true })
      await status.focus()
      await expect(status).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Tab')
      await expect(assignee).toBeFocused()
      await status.selectOption('READY')
      await assignee.selectOption('member')
      let searchSaves = 0
      const countSaves = (request: import('@playwright/test').Request) => {
        if (request.method() === 'PUT' && request.url().includes('/page-deliveries/')) searchSaves++
      }
      page.on('request', countSaves)
      const memberSearch = drawer.getByLabel(l.deliveryCandidates, { exact: true })
      await memberSearch.fill('no matching member')
      await memberSearch.press('Enter')
      await expect(assignee.locator('option')).toHaveCount(2)
      await expect(assignee).toHaveValue('member')
      await memberSearch.fill('')
      await memberSearch.press('Enter')
      await expect(assignee.locator('option')).toHaveCount(3)
      expect(searchSaves).toBe(0)
      page.off('request', countSaves)
      await note.fill('<script>window.__deliveryXss=1</script>\nBuild this fixed page')
      await drawer.getByRole('button', { name: close, exact: true }).click()
      const confirmation = page.locator('.ant-modal-confirm')
      await expect(confirmation.getByText(l.deliveryLeaveTitle, { exact: true })).toBeVisible()
      await confirmation
        .getByRole('button', { name: locale === 'zh' ? '取消' : 'Cancel', exact: true })
        .click()
      await expect(note).toHaveValue(
        '<script>window.__deliveryXss=1</script>\nBuild this fixed page',
      )
      await drawer.screenshot({
        path: testInfo.outputPath('delivery-editor.png'),
        animations: 'disabled',
      })
      await drawer.getByRole('button', { name: save, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(drawer.getByText(l.deliverySaved, { exact: true })).toBeVisible()
      await expect(drawer.locator('.delivery-reason')).toHaveText(
        '<script>window.__deliveryXss=1</script>\nBuild this fixed page',
      )
      expect(await page.evaluate(() => Reflect.get(window, '__deliveryXss'))).toBeUndefined()
      await drawer.getByRole('button', { name: l.deliveryBack, exact: true }).click()
      await expect(drawer.locator('.delivery-row')).toHaveCount(1)
      await drawer.getByLabel(l.deliveryFilter, { exact: true }).selectOption('DONE')
      await expect(drawer.getByText(l.deliveryEmpty, { exact: true })).toBeVisible()
      await drawer.getByLabel(l.deliveryFilter, { exact: true }).selectOption('')
      await expect(drawer.locator('.delivery-row')).toHaveCount(1)
      await drawer.locator('.delivery-page-button').focus()
      await page.keyboard.press('Enter')
      await expect(status).toHaveValue('READY')
      await status.selectOption('DONE')
      await drawer.getByRole('button', { name: save, exact: true }).click()
      await expect(drawer.getByText(l.deliverySaved, { exact: true })).toBeVisible()
      await drawer.getByRole('button', { name: close, exact: true }).click()
      await expect(page.getByRole('button', { name: l.pageResources, exact: true })).toBeFocused()
      await page.goto('prototype-hub/projects')
      await page
        .getByRole('link', { name: `${l.openProject}：Contract project`, exact: true })
        .click()
      await page.getByRole('button', { name: l.revisionHistory, exact: true }).first().click()
      const history = page.getByRole('dialog', { name: l.revisionHistory, exact: true })
      await history.getByRole('button', { name: l.pageResources, exact: true }).first().click()
      await page.getByRole('menuitem', { name: l.pageDelivery, exact: true }).click()
      const list = page.getByRole('dialog', { name: l.pageDelivery, exact: true })
      await expect(list.locator('.delivery-row')).toHaveCount(1)
      await expect(list.getByText('r-v1', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      expect((await list.boundingBox())!.width).toBeLessThanOrEqual(width)
      await list.screenshot({
        path: testInfo.outputPath('delivery-list.png'),
        animations: 'disabled',
      })
      await list.locator('.delivery-page-button').click()
      await list.getByLabel(l.deliveryReason, { exact: true }).fill('Unsaved route draft')
      const leaving = page.goBack()
      await expect(confirmation.getByText(l.deliveryLeaveTitle, { exact: true })).toBeVisible()
      await confirmation
        .getByRole('button', { name: locale === 'zh' ? '取消' : 'Cancel', exact: true })
        .click()
      await leaving
      await expect(list.getByLabel(l.deliveryReason, { exact: true })).toHaveValue(
        'Unsaved route draft',
      )
      await list.getByRole('button', { name: close, exact: true }).click()
      await confirmation.getByRole('button', { name: l.deliveryLeave, exact: true }).click()
      await expect(
        page.getByRole('button', { name: l.revisionHistory, exact: true }).first(),
      ).toBeFocused()
    })
  }
test('F28 unknown outcome blocks switching, GET does not confirm, exact user retry does', async ({
  page,
  request,
}) => {
  await login(page, 'zh')
  const drawer = await openPreview(page, 'zh', await homeId(request)),
    l = protoLocales.zh
  const payloads: unknown[] = []
  await page.route('**/api/prototype-hub/versions/v1/page-deliveries/*', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    payloads.push(route.request().postDataJSON())
    if (payloads.length > 1) return route.continue()
    await route.fetch()
    await route.fulfill({
      status: 503,
      json: { success: false, status: 503, message: 'Response lost' },
    })
  })
  await drawer.locator('#delivery-state').selectOption('READY')
  await drawer.getByLabel(l.deliveryReason, { exact: true }).fill('Retained exact draft')
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect(drawer.getByText(l.deliveryUnknown, { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: l.deliveryBack, exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: l.deliveryCheck, exact: true }).click()
  await expect(drawer.getByText(l.deliveryUnknown, { exact: true })).toBeVisible()
  await expect(drawer.getByLabel(l.deliveryReason, { exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: l.deliveryRetry, exact: true }).click()
  await expect(drawer.getByText(l.deliverySaved, { exact: true })).toBeVisible()
  expect(payloads).toHaveLength(2)
  expect(payloads[1]).toEqual(payloads[0])
})
test('F28 viewer sees current record without editor or candidate enumeration', async ({
  page,
  request,
}) => {
  let candidates = 0
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
  await page.route('**/page-deliveries/_candidates', async (route) => {
    candidates++
    await route.continue()
  })
  await login(page, 'zh')
  const pageId = await homeId(request)
  await page.goto(`preview/p1/v1?revisionId=r-v1&pageId=${encodeURIComponent(pageId)}`)
  await page.getByRole('button', { name: '页面资料', exact: true }).click()
  await page.getByRole('menuitem', { name: '页面交付', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '页面交付', exact: true })
  await expect(drawer.getByText(protoLocales.zh.deliveryReadOnly, { exact: true })).toBeVisible()
  await expect(drawer.locator('#delivery-state')).toHaveCount(0)
  expect(candidates).toBe(0)
})

test('F28 member paging and select Enter never submit the delivery form', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'zh')
  const queried: number[] = []
  await page.route(
    '**/api/prototype-hub/versions/v1/page-deliveries/_candidates',
    async (route) => {
      const input = route.request().postDataJSON()
      queried.push(input.pageIndex)
      const people = Array.from({ length: 21 }, (_, index) => ({
        userId: `candidate-${index}`,
        name: `Member ${index}`,
      }))
      await route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            data: people.slice(input.pageIndex * 20, (input.pageIndex + 1) * 20),
            total: 21,
            pageIndex: input.pageIndex,
            pageSize: 20,
          },
        },
      })
    },
  )
  const drawer = await openPreview(page, 'zh', await homeId(request))
  let saves = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/page-deliveries/')) saves++
  })
  const status = drawer.locator('#delivery-state'),
    assignee = drawer.locator('#delivery-assignee')
  await status.selectOption('READY')
  await status.focus()
  await page.keyboard.press('Enter')
  await expect(status).toHaveValue('READY')
  await assignee.selectOption('candidate-0')
  await assignee.focus()
  await page.keyboard.press('Enter')
  await expect(assignee).toHaveValue('candidate-0')
  const pagination = drawer.getByLabel(protoLocales.zh.deliveryCandidatePage, { exact: true })
  const pageNumber = pagination.locator('.ant-pagination-simple-pager input')
  await pageNumber.focus()
  await page.keyboard.press('Tab')
  await expect(pagination.locator('.ant-pagination-next')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => queried.at(-1)).toBe(1)
  await expect(assignee).toHaveValue('candidate-0')
  await pageNumber.fill('1')
  await pageNumber.press('Enter')
  await expect.poll(() => queried.at(-1)).toBe(0)
  expect(saves).toBe(0)
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
})
