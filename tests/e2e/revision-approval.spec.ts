import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
const evidence = process.env.F06_UI_EVIDENCE
async function shot(page: Page, name: string) {
  if (evidence) {
    mkdirSync(evidence, { recursive: true })
    await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' })
  }
}
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
  await expect(
    page.getByRole('link', {
      name: `${protoLocales[locale].openProject}：Contract project`,
      exact: true,
    }),
  ).toBeVisible()
}
async function open(page: Page, locale: 'zh' | 'en') {
  const l = protoLocales[locale]
  await page.goto('preview/p1/v1?revisionId=r-v1')
  const trigger = page.getByRole('button', { name: l.pageResources, exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: l.approvalTitle, exact: true }).click()
  const panel = page.getByRole('dialog', { name: l.approvalTitle, exact: true })
  await expect(panel.getByLabel(l.approvalNote, { exact: true })).toBeVisible()
  return panel
}
async function act(
  page: Page,
  panel: ReturnType<Page['locator']>,
  locale: 'zh' | 'en',
  action: 'approve' | 'publish' | 'withdraw' | 'revoke',
) {
  const l = protoLocales[locale]
  await panel.getByRole('button', { name: l[`approvalAction_${action}`], exact: true }).focus()
  await page.keyboard.press('Enter')
  const confirm = page.locator('.ant-modal-confirm')
  await expect(
    confirm.getByRole('button', { name: locale === 'zh' ? '取消' : 'Cancel', exact: true }),
  ).toBeFocused()
  await expect(confirm.getByText('V1 · r-v1', { exact: true })).toBeVisible()
  await confirm.getByRole('button', { name: l[`approvalAction_${action}`], exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(panel.getByText(l.approvalSaved, { exact: true })).toBeVisible()
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const locale of ['zh', 'en'] as const)
  for (const width of [1440, 390])
    test(`F06 approval publication ${locale} ${width}`, async ({ page }) => {
      const l = protoLocales[locale],
        close = locale === 'zh' ? '关闭' : 'Close'
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      await login(page, locale)
      await page.goto('preview/p1/v1?revisionId=r-v1')
      const trigger = page.getByRole('button', { name: l.pageResources, exact: true })
      await trigger.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('menuitem', { name: l.approvalTitle, exact: true })).toBeVisible()
      await shot(page, `${locale}-${width}-preview`)
      await page.getByRole('menuitem', { name: l.approvalTitle, exact: true }).click()
      const panel = page.getByRole('dialog', { name: l.approvalTitle, exact: true })
      const note = panel.getByLabel(l.approvalNote, { exact: true })
      await expect(note).toBeVisible()
      await shot(page, `${locale}-${width}-pending`)
      await note.fill('<script>window.__approvalXss=1</script>\nFixed revision accepted')
      await panel.getByRole('button', { name: l.approvalAction_approve, exact: true }).click()
      await page
        .locator('.ant-modal-confirm')
        .getByRole('button', { name: locale === 'zh' ? '取消' : 'Cancel', exact: true })
        .click()
      await expect(page.locator('.ant-modal-confirm')).toHaveCount(0)
      await expect(note).toHaveValue(
        '<script>window.__approvalXss=1</script>\nFixed revision accepted',
      )
      await act(page, panel, locale, 'approve')
      await act(page, panel, locale, 'publish')
      await panel.locator('.approval-history summary').focus()
      await page.keyboard.press('Enter')
      await expect(panel.locator('.approval-events li')).toHaveCount(2)
      await shot(page, `${locale}-${width}-published`)
      expect(await page.evaluate(() => Reflect.get(window, '__approvalXss'))).toBeUndefined()
      await panel.getByRole('button', { name: l.approvalSnapshot, exact: true }).click()
      await expect(
        panel.getByRole('heading', { name: l.approvalSnapshotTitle, exact: true }),
      ).toBeFocused()
      await expect(
        panel.getByRole('link', { name: l.approvalOpenExact, exact: false }),
      ).toHaveAttribute('href', '/preview/p1/v1?revisionId=r-v1')
      await panel.getByRole('button', { name: l.approvalBack, exact: true }).click()
      await expect(panel.locator('.approval-history summary')).toBeFocused()
      await act(page, panel, locale, 'withdraw')
      await expect(
        panel.getByRole('heading', { name: l.approvalApproved, exact: true }),
      ).toBeVisible()
      await act(page, panel, locale, 'revoke')
      await expect(
        panel.getByRole('heading', { name: l.approvalPending, exact: true }),
      ).toBeVisible()
      await panel.getByRole('button', { name: close, exact: true }).click()
      await expect(trigger).toBeFocused()
      await page.goto('prototype-hub/projects')
      await page
        .getByRole('link', { name: `${l.openProject}：Contract project`, exact: true })
        .click()
      await page.getByRole('button', { name: l.revisionHistory, exact: true }).first().click()
      const history = page.getByRole('dialog', { name: l.revisionHistory, exact: true })
      const historyTrigger = history
        .getByRole('button', { name: l.pageResources, exact: true })
        .first()
      await historyTrigger.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('menuitem', { name: l.approvalTitle, exact: true })).toBeVisible()
      await shot(page, `${locale}-${width}-history`)
      await page.getByRole('menuitem', { name: l.approvalTitle, exact: true }).click()
      const historyPanel = page.getByRole('dialog', { name: l.approvalTitle, exact: true })
      await expect(historyPanel.getByText('r-v1', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      expect((await historyPanel.boundingBox())!.width).toBeLessThanOrEqual(width)
      await historyPanel.getByRole('button', { name: close, exact: true }).click()
      await expect(historyTrigger).toBeFocused()
      expect(errors).toEqual([])
    })
test('F06 unknown retains original request while current state may move on', async ({
  page,
  request,
}) => {
  const l = protoLocales.zh
  await login(page, 'zh')
  const panel = await open(page, 'zh')
  const payloads: unknown[] = []
  await page.route('**/approval/_act', async (route) => {
    payloads.push(route.request().postDataJSON())
    if (payloads.length > 1) return route.continue()
    await route.fetch()
    await route.fulfill({ status: 503, json: { success: false, status: 503, message: 'lost' } })
  })
  await panel.getByLabel(l.approvalNote, { exact: true }).fill('original')
  await panel.getByRole('button', { name: l.approvalAction_approve, exact: true }).click()
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: l.approvalAction_approve, exact: true })
    .click()
  await expect(panel.getByText(l.approvalUnknown, { exact: true })).toBeVisible()
  await expect(panel.getByLabel(l.approvalNote, { exact: true })).toBeDisabled()
  await panel.getByRole('button', { name: l.approvalCheck, exact: true }).click()
  await expect(panel.getByRole('heading', { name: l.approvalApproved, exact: true })).toBeVisible()
  await expect(panel.getByText(l.approvalUnknown, { exact: true })).toBeVisible()
  await shot(page, 'zh-unknown')
  await request.post('/api/prototype-hub/versions/v1/revisions/r-v1/approval/_act', {
    headers: { 'X-Access-Token': 'mock-admin' },
    data: { action: 'revoke', expectedVersion: 1, clientRequestId: 'another-action', note: '' },
  })
  await panel.getByRole('button', { name: l.approvalRetry, exact: true }).click()
  await expect(panel.getByText(l.approvalSaved, { exact: true })).toBeVisible()
  await expect(panel.getByRole('heading', { name: l.approvalPending, exact: true })).toBeVisible()
  expect(payloads[1]).toEqual(payloads[0])
})
test('F06 stale state preserves note until explicit refresh', async ({ page, request }) => {
  const l = protoLocales.zh
  await login(page, 'zh')
  const panel = await open(page, 'zh')
  await panel.getByLabel(l.approvalNote, { exact: true }).fill('kept')
  await request.post('/api/prototype-hub/versions/v1/revisions/r-v1/approval/_act', {
    headers: { 'X-Access-Token': 'mock-admin' },
    data: { action: 'approve', expectedVersion: 0, clientRequestId: 'other', note: '' },
  })
  await panel.getByRole('button', { name: l.approvalAction_approve, exact: true }).click()
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: l.approvalAction_approve, exact: true })
    .click()
  await expect(panel.getByText(l.approvalConflict, { exact: true })).toBeVisible()
  await expect(panel.getByLabel(l.approvalNote, { exact: true })).toHaveValue('kept')
  await shot(page, 'zh-conflict')
  await panel.getByRole('button', { name: l.approvalRefresh, exact: true }).click()
  await expect(
    panel.getByRole('button', { name: l.approvalAction_publish, exact: true }),
  ).toBeEnabled()
  await expect(panel.getByLabel(l.approvalNote, { exact: true })).toHaveValue('kept')
})
test('F06 guest sees only redacted status even with feedback disabled', async ({
  page,
  request,
}) => {
  const l = protoLocales.en
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'en')
  await request.post('/api/prototype-hub/versions/v1/revisions/r-v1/approval/_act', {
    headers: { 'X-Access-Token': 'mock-admin' },
    data: {
      action: 'approve',
      expectedVersion: 0,
      clientRequestId: 'public-approve',
      note: 'PRIVATE NOTE',
    },
  })
  let context: Record<string, unknown> | undefined
  await page.route('**/public/shares/*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.result) {
      body.result.reviewEnabled = false
    }
    await route.fulfill({ response, json: body })
  })
  await page.route('**/approval/context', async (route) => {
    expect(route.request().headers()['x-access-token']).toBeUndefined()
    const response = await route.fetch()
    const body = await response.json()
    context = body.result
    await route.fulfill({ response, json: body })
  })
  await page.goto('share/open')
  await page.getByRole('button', { name: l.approvalTitle, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: l.approvalTitle, exact: true })
  await expect(drawer.getByText(l.approvalApproved, { exact: true })).toBeVisible()
  expect(Object.keys(context!).sort()).toEqual([
    'approved',
    'approvedAt',
    'published',
    'publishedAt',
    'revisionId',
  ])
  await expect(drawer.getByText('PRIVATE NOTE')).toHaveCount(0)
  await expect(drawer.locator('textarea')).toHaveCount(0)
  await shot(page, 'en-390-public')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('F06 latest share reads its resolved grant without following a later current revision', async ({
  page,
  request,
}) => {
  const l = protoLocales.en
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'en')
  const headers = { 'X-Access-Token': 'mock-admin' }
  await request.put('/api/prototype-hub/shares/open', {
    headers,
    data: {
      expectedVersion: 1,
      revisionMode: 'latest',
      passwordAction: 'keep',
      description: null,
      expiresAt: null,
    },
  })
  await request.post('/api/prototype-hub/versions/v1/revisions/r-v1/approval/_act', {
    headers,
    data: {
      action: 'approve',
      expectedVersion: 0,
      clientRequestId: 'latest-old-approved',
      note: 'PRIVATE NOTE',
    },
  })
  const bodies: { revisionId: string; accessKey: string }[] = []
  await page.route('**/approval/context', async (route) => {
    expect(route.request().headers()['x-access-token']).toBeUndefined()
    bodies.push(route.request().postDataJSON())
    return route.continue()
  })
  await page.goto('share/open')
  await expect(page.getByRole('button', { name: l.approvalTitle, exact: true })).toBeVisible()
  const changed = await request.put('/api/prototype-hub/versions/v1', {
    headers,
    multipart: {
      expectedRevisionId: 'r-v1',
      versionName: 'V2',
      file: { name: 'new.zip', mimeType: 'application/zip', buffer: Buffer.from('new revision') },
    },
  })
  const next = (await changed.json()).result.currentRevisionId as string
  expect(next).not.toBe('r-v1')
  await page.getByRole('button', { name: l.approvalTitle, exact: true }).click()
  let drawer = page.getByRole('dialog', { name: l.approvalTitle, exact: true })
  await expect(drawer.getByText(l.approvalApproved, { exact: true })).toBeVisible()
  await expect(drawer.getByText('r-v1', { exact: true })).toBeVisible()
  expect(bodies[0]).toEqual({ revisionId: 'r-v1', accessKey: 'access-2-r-v1' })
  await expect(drawer.getByText('PRIVATE NOTE')).toHaveCount(0)
  await shot(page, 'en-390-latest-resolved')
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: l.approvalTitle, exact: true })).toBeFocused()
  await page.reload()
  await expect(page.getByText(l.sharePageChanged, { exact: true })).toBeVisible()
  await page.goto('share/open')
  await page.getByRole('button', { name: l.approvalTitle, exact: true }).click()
  drawer = page.getByRole('dialog', { name: l.approvalTitle, exact: true })
  await expect(drawer.getByText(l.approvalPending, { exact: true })).toBeVisible()
  await expect(drawer.getByText(next, { exact: true })).toBeVisible()
  expect(bodies[1]).toEqual({ revisionId: next, accessKey: `access-2-${next}` })
  await shot(page, 'en-390-latest-next-visit')
})
