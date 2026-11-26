import { expect, test, type Page } from '@playwright/test'
import { functionalSpecLocales } from '../../src/modules/protohub-manager-ui/locales/functional-spec'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'

async function open(page: Page, language: 'zh' | 'en' = 'zh') {
  await login(page)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  await expect(
    page.frameLocator('.frame-stage > iframe').locator('[data-review-anchor-surface]'),
  ).toHaveCount(1)
  const labels = functionalSpecLocales[language]
  const trigger = page.getByRole('button', {
    name: protoLocales[language].pageResources,
    exact: true,
  })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const item = page.getByRole('menuitem', { name: labels.functionalSpecs, exact: true })
  await item.focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.functional-sidebar')
  await expect(panel.locator('#spec-heading')).toBeFocused()
  return { panel, labels, trigger }
}
test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:5303/__test/reset')).ok()).toBe(true)
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F27 full sidebar journey ${language} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const { panel, labels, trigger } = await open(page, language)
      await expect(panel.getByText(labels.specEmpty, { exact: true })).toBeVisible()
      if (width === 390) {
        await page.keyboard.press('Shift+Tab')
        expect(
          await page.evaluate(() => !!document.activeElement?.closest('.functional-sidebar')),
        ).toBe(true)
        await page.keyboard.press('Tab')
        expect(
          await page.evaluate(() => !!document.activeElement?.closest('.functional-sidebar')),
        ).toBe(true)
      }
      await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
      await expect(panel.locator('#spec-title')).toBeFocused()
      await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
      await expect(panel.locator('#spec-title')).toBeFocused()
      await expect(panel.getByText(labels.specTitleRequired)).toBeVisible()
      const title = language === 'zh' ? '提交订单按钮' : 'Submit order button'
      await panel.locator('#spec-title').fill(title)
      await panel
        .locator('#spec-purpose')
        .fill(
          language === 'zh'
            ? '校验订单后提交，保留失败时的输入。'
            : 'Validate and submit the order, keeping input on failure.',
        )
      await panel
        .locator('#spec-inputRules')
        .fill('Required fields are validated before submission.')
      await panel.locator('#spec-permissionRules').fill('Project editors only.')
      await panel.locator('#spec-navigationRules').fill('/orders/result — plain text only')
      await panel.locator('#spec-notes').fill('<script>literal business note</script>')
      const surface = page
        .frameLocator('.frame-stage > iframe')
        .locator('[data-review-anchor-surface]')
      for (const [name, shape] of [
        [labels.specPoint, 'point'],
        [labels.specRect, 'rect'],
        [labels.specEllipse, 'ellipse'],
      ] as const) {
        await panel.getByRole('button', { name, exact: true }).click()
        await expect(surface).toBeVisible()
        await surface.focus()
        await page.keyboard.press('ArrowRight')
        if (shape !== 'point') {
          await page.keyboard.press('Enter')
          await page.keyboard.press('Shift+ArrowRight')
          await page.keyboard.press('Shift+ArrowDown')
        }
        await page.keyboard.press('Enter')
        await expect(panel.locator('.spec-geometry')).toContainText(shape)
        await expect(panel.locator('#spec-title')).toHaveValue(title)
      }
      await panel.getByRole('button', { name: labels.specRect, exact: true }).click()
      await surface.focus()
      await page.keyboard.press('Escape')
      await expect(panel.locator('.spec-geometry')).toContainText('ellipse')
      await expect(panel.locator('#spec-title')).toHaveValue(title)
      await panel.getByRole('button', { name: labels.specRemoveArea, exact: true }).click()
      await expect(panel.locator('#spec-purpose')).not.toHaveValue('')
      await panel.getByRole('button', { name: labels.specRect, exact: true }).click()
      await surface.focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Shift+ArrowRight')
      await page.keyboard.press('Shift+ArrowDown')
      await page.keyboard.press('Enter')
      await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
      await expect(panel.getByText(labels.specSaved, { exact: true })).toBeVisible()
      await expect(panel.locator('#spec-notice')).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: info.outputPath(`after-${language}-${width}.png`),
        animations: 'disabled',
      })
      await panel.getByRole('button', { name: labels.specLocate, exact: true }).click()
      await expect(
        page.frameLocator('.frame-stage > iframe').locator('[data-review-anchor-marker]'),
      ).toBeVisible()
      await page.screenshot({
        path: info.outputPath(`located-${language}-${width}.png`),
        animations: 'disabled',
      })
      await panel.getByRole('button', { name: labels.specReturn, exact: true }).click()
      await expect(panel.locator('#spec-notes')).toHaveValue(
        '<script>literal business note</script>',
      )
      if (width === 390)
        await panel.getByRole('button', { name: labels.specBack, exact: true }).click()
      await panel.locator('#spec-search').fill('unmatched-title')
      await panel.getByRole('button', { name: labels.specFilter, exact: true }).click()
      await expect(panel.getByText(labels.specNoMatches, { exact: true })).toBeVisible()
      await panel.locator('#spec-search').fill(title)
      await panel.getByRole('button', { name: labels.specFilter, exact: true }).click()
      await panel.locator('.spec-record').click()
      await panel.getByRole('button', { name: labels.specDelete, exact: true }).click()
      const confirmation = page.getByRole('dialog').filter({ hasText: labels.specDeleteHint })
      await expect(confirmation).toContainText(title)
      await confirmation.getByRole('button', { name: labels.specDelete, exact: true }).click()
      await expect(panel.getByText(labels.specDeleted, { exact: true })).toBeVisible()
      await panel.locator('#spec-heading').focus()
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      expect(page.url()).not.toContain('literal')
      expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
        'literal business note',
      )
    })
  }
test('F27 preserves drafts on close, record switch and page transition and rejects drawing on the previous page', async ({
  page,
}) => {
  const { panel, labels } = await open(page)
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  await panel.locator('#spec-title').fill('Saved object')
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await expect(panel.getByText(labels.specSaved, { exact: true })).toBeVisible()
  await panel.locator('#spec-purpose').fill('Unsaved private draft')
  await panel.getByRole('button', { name: labels.specClose, exact: true }).click()
  let confirmation = page.getByRole('dialog').filter({ hasText: labels.specDiscardHint })
  await confirmation.getByRole('button', { name: labels.specKeep, exact: true }).click()
  await expect(panel.locator('#spec-purpose')).toHaveValue('Unsaved private draft')
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  confirmation = page.getByRole('dialog').filter({ hasText: labels.specDiscardHint })
  await confirmation.getByRole('button', { name: labels.specKeep, exact: true }).click()
  await page.locator('.workspace-nav').getByText('Child page', { exact: true }).click()
  confirmation = page.getByRole('dialog').filter({ hasText: labels.specDiscardHint })
  await confirmation.getByRole('button', { name: labels.specKeep, exact: true }).click()
  await expect(panel.locator('#spec-purpose')).toHaveValue('Unsaved private draft')
  await page.locator('.workspace-nav').getByText('Child page', { exact: true }).click()
  confirmation = page.getByRole('dialog').filter({ hasText: labels.specDiscardHint })
  await confirmation.getByRole('button', { name: labels.specDiscard, exact: true }).click()
  await expect(panel.getByText(labels.specEmpty, { exact: true })).toBeVisible()
})
test('F27 recovers an unknown write with exactly the same request and offers a usable exit after deleted-create conflict', async ({
  page,
}) => {
  const { panel, labels } = await open(page)
  const bodies: unknown[] = []
  await page.route('**/element-descriptions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    bodies.push(route.request().postDataJSON())
    if (bodies.length === 1) {
      await route.fetch()
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, status: 503 }),
      })
    } else await route.continue()
  })
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  await panel.locator('#spec-title').fill('Unknown original request')
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await expect(panel.getByRole('button', { name: labels.specRetry, exact: true })).toBeVisible()
  await expect(panel.locator('#spec-title')).toBeDisabled()
  await panel.getByRole('button', { name: labels.specRetry, exact: true }).click()
  await expect(panel.getByText(labels.specSaved, { exact: true })).toBeVisible()
  expect(bodies[1]).toEqual(bodies[0])
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  await panel.locator('#spec-title').fill('Deleted create draft')
  await page.unroute('**/element-descriptions')
  await page.route('**/element-descriptions', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        status: 409,
        code: 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT',
      }),
    }),
  )
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await panel.getByRole('button', { name: labels.specCheckList, exact: true }).click()
  await expect(panel.locator('.spec-record')).toHaveCount(1)
  await expect(panel.locator('#spec-title')).toHaveValue('Deleted create draft')
})
test('F27 compares a fresh CAS row without replacing the draft until explicit adoption', async ({
  page,
}) => {
  const { panel, labels } = await open(page)
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  await panel.locator('#spec-title').fill('CAS object')
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await expect(panel.getByText(labels.specSaved, { exact: true })).toBeVisible()
  await panel.locator('#spec-purpose').fill('My retained draft')
  await page.route('**/element-descriptions/*', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          status: 409,
          code: 'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_CONFLICT',
        }),
      })
    else if (route.request().method() === 'GET') {
      const response = await route.fetch()
      const data = await response.json()
      data.result.purpose = 'Server text'
      data.result.configVersion++
      await route.fulfill({ response, json: data })
    } else await route.continue()
  })
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await panel.getByRole('button', { name: labels.specReadServer, exact: true }).click()
  await expect(panel.locator('.spec-server')).toContainText('Server text')
  await expect(panel.locator('#spec-purpose')).toHaveValue('My retained draft')
  await panel.getByRole('button', { name: labels.specUseServer, exact: true }).click()
  await expect(panel.locator('#spec-purpose')).toHaveValue('Server text')
})

test('F27 keeps description text when the recorded viewport can no longer be located', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { panel, labels } = await open(page)
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  await panel.locator('#spec-title').fill('Fixed geometry')
  await panel.locator('#spec-purpose').fill('Kept when dimensions change')
  await panel.getByRole('button', { name: labels.specPoint, exact: true }).click()
  await page.frameLocator('.frame-stage > iframe').locator('[data-review-anchor-surface]').focus()
  await page.keyboard.press('Enter')
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await expect(panel.getByText(labels.specSaved, { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1200, height: 1000 })
  await panel.getByRole('button', { name: labels.specLocate, exact: true }).click()
  await expect(page.getByText(protoLocales.zh.anchorUnavailable, { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('unavailable-dimensions.png') })
  await panel.getByRole('button', { name: labels.specReturn, exact: true }).click()
  await expect(panel.locator('#spec-purpose')).toHaveValue('Kept when dimensions change')
})

test('F27 read-only access exposes text without writes and clears private records after revocation', async ({
  page,
}) => {
  const { panel, labels } = await open(page)
  await panel.getByRole('button', { name: labels.specNew, exact: true }).click()
  await panel.locator('#spec-title').fill('Readable object')
  await panel.locator('#spec-purpose').fill('Private member text')
  await panel.getByRole('button', { name: labels.specSave, exact: true }).click()
  await expect(panel.getByText(labels.specSaved, { exact: true })).toBeVisible()
  await page.route('**/api/prototype-hub/projects/p1', async (route) => {
    const response = await route.fetch(),
      body = await response.json()
    body.result.role = 'viewer'
    body.result.capabilities.edit = false
    await route.fulfill({ response, json: body })
  })
  await page.reload()
  await page.getByRole('button', { name: protoLocales.zh.pageResources, exact: true }).click()
  await page.getByRole('menuitem', { name: labels.functionalSpecs, exact: true }).click()
  await expect(panel.getByRole('button', { name: labels.specNew, exact: true })).toHaveCount(0)
  await panel.locator('.spec-record').click()
  await expect(panel.locator('#spec-purpose')).toHaveAttribute('readonly', '')
  await expect(panel.getByRole('button', { name: labels.specSave, exact: true })).toHaveCount(0)
  await page.route('**/element-descriptions/_query', (route) =>
    route.fulfill({ status: 403, json: { success: false, status: 403 } }),
  )
  await panel.getByRole('button', { name: labels.specFilter, exact: true }).click()
  await expect(panel.getByText(labels.specUnavailable, { exact: true })).toBeVisible()
  await expect(panel.locator('.spec-record')).toHaveCount(0)
  await expect(panel.locator('#spec-purpose')).toHaveCount(0)
})

test('shared stable page trees retain ordinary member, anonymous share and comparison navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  for (const path of ['preview/p1/v1?revisionId=r-v1', 'share/open']) {
    await page.goto(path)
    const tree = page.locator('.workspace-nav')
    await tree.getByText('Child page', { exact: true }).click()
    await expect(page.locator('.frame-stage > iframe')).toHaveAttribute('src', /child\.html$/)
    await expect(tree.locator('.ant-tree-node-selected .tree-page')).toHaveText('Child page')
    await tree.getByText('Home', { exact: true }).click()
    await expect(page.locator('.frame-stage > iframe')).toHaveAttribute('src', /index\.html$/)
    if (path === 'share/open')
      await expect(
        page.getByRole('menuitem', { name: functionalSpecLocales.zh.functionalSpecs, exact: true }),
      ).toHaveCount(0)
  }
  await page.request.post('http://127.0.0.1:5303/__test/comparison')
  await page.goto(
    'prototype-hub/compare/p1/v1?leftRevisionId=compare-left&rightRevisionId=compare-right',
  )
  const left = page.locator('[data-pane=left]')
  await expect(left.locator('iframe')).toBeVisible()
  await left.getByRole('button', { name: protoLocales.zh.showPages, exact: true }).click()
  const directory = page.getByRole('dialog', { name: protoLocales.zh.pages, exact: true })
  await directory.getByText('Removed page', { exact: true }).click()
  await expect(left.locator('iframe')).toHaveAttribute('src', /old\.html$/)
  await expect(directory).toBeHidden()
  await left.getByRole('button', { name: protoLocales.zh.showPages, exact: true }).click()
  await expect(directory.locator('.ant-tree-node-selected .tree-page')).toHaveText('Removed page')
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('leftPageId') === 'left-only' &&
      url.searchParams.get('rightPageId') === 'right-home',
  )
})
