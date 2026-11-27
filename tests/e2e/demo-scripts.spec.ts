import { expect, test, type Page } from '@playwright/test'
import { demoScriptLocales } from '../../src/modules/protohub-manager-ui/locales/demo-script'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { login } from './system-helpers'
const fixed = new Date('2026-11-27T03:00:00.000Z')
async function open(page: Page, language: 'zh' | 'en' = 'zh') {
  await page.clock.setFixedTime(fixed)
  await login(page)
  await page.evaluate((value) => localStorage.setItem('proto-bridge-ui:language', value), language)
  await page.goto('preview/p1/v1?revisionId=r-v1')
  const trigger = page.getByRole('button', {
    name: protoLocales[language].pageResources,
    exact: true,
  })
  await trigger.click()
  await page
    .getByRole('menuitem', { name: demoScriptLocales[language].demoScripts, exact: true })
    .click()
  const panel = page.locator('.demo-workspace')
  await expect(panel.locator('#demo-heading')).toBeFocused()
  return { panel, trigger, labels: demoScriptLocales[language] }
}
async function fill(page: Page, language: 'zh' | 'en' = 'zh') {
  const result = await open(page, language),
    { panel, labels } = result
  await panel.getByRole('button', { name: labels.demoNew, exact: true }).click()
  await panel.locator('#demo-title').fill('Demo <script>ordinary text</script>')
  await panel.locator('#demo-objective').fill('Explain a complete journey')
  await panel.locator('#demo-prerequisites').fill('A prepared account')
  await panel.locator('#demo-reset').fill('Reset manually before starting')
  for (const narration of ['First visit', 'Revisit independently', 'Child detail']) {
    await panel.locator('[data-demo-add]').click()
    await panel.locator('[data-demo-step]').last().locator('textarea').fill(narration)
  }
  const steps = panel.locator('[data-demo-step]')
  const child = await steps.last().locator('option').last().getAttribute('value')
  await steps.last().locator('select').selectOption(child!)
  return result
}
test.beforeEach(async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin
  expect((await request.post(`${origin}/__test/reset`)).ok()).toBe(true)
  expect((await request.post(`${origin}/__test/clock`, { data: { now: +fixed } })).ok()).toBe(true)
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F29 list edit reorder revisit rehearse share ${language} ${width}`, async ({
      page,
      browser,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const { panel, trigger, labels } = await fill(page, language)
      const steps = panel.locator('[data-demo-step]')
      const firstIds = await steps.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-demo-step')),
      )
      await steps.nth(1).locator('[data-demo-up]').focus()
      await page.keyboard.press('Enter')
      await expect(steps.first().locator('textarea')).toHaveValue('Revisit independently')
      expect(await steps.first().getAttribute('data-demo-step')).toBe(firstIds[1])
      await steps
        .last()
        .getByRole('button', { name: labels.demoRemoveStep.replace('{index}', '3'), exact: true })
        .click()
      await expect(steps).toHaveCount(2)
      await panel.locator('[data-demo-add]').click()
      await steps.last().locator('textarea').fill('Child detail')
      await steps.last().locator('select').selectOption({ index: 1 })
      await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
      await expect(panel.getByText(labels.demoSaved, { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: labels.demoRehearse, exact: true }).click()
      const jump = panel.locator('#demo-jump')
      await jump.selectOption({ index: 0 })
      await expect(panel.locator('.demo-spoken')).toHaveText('Revisit independently')
      const player = panel.locator('.demo-player iframe')
      await expect(player).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
      await expect(player).toHaveAttribute('referrerpolicy', 'no-referrer')
      await expect(panel.frameLocator('.demo-player iframe').locator('body')).toContainText(
        'Contract element',
      )
      const frame = await (await player.elementHandle())!.contentFrame()
      let navigations = 0
      page.on('framenavigated', (current) => {
        if (current === frame) navigations++
      })
      await panel.getByRole('button', { name: labels.demoNext, exact: true }).click()
      await expect(panel.locator('.demo-spoken')).toHaveText('First visit')
      expect(navigations).toBe(0)
      await panel.getByRole('button', { name: labels.demoNext, exact: true }).click()
      await expect(player).toHaveAttribute('src', /child\.html$/)
      await panel.getByRole('button', { name: labels.demoCopy, exact: true }).click()
      await expect(panel.getByText(labels.demoCopied, { exact: true })).toBeVisible()
      const memberLocator = await page.evaluate(() => navigator.clipboard.readText())
      expect(memberLocator).toContain('/preview/p1/v1?')
      expect(memberLocator).toContain('stepId=')
      expect(memberLocator).not.toMatch(/accessKey|runtime|narration|ordinary/)
      await page.screenshot({
        path: info.outputPath(`rehearse-${language}-${width}.png`),
        animations: 'disabled',
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await panel.getByRole('button', { name: labels.demoReturnEdit, exact: true }).click()
      await panel.locator('input[type=checkbox]').check()
      await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
      await expect(panel.getByText(labels.demoSaved, { exact: true })).toBeVisible()
      const visitor = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 960 },
        permissions: ['clipboard-read', 'clipboard-write'],
      })
      const publicPage = await visitor.newPage()
      await publicPage.clock.setFixedTime(fixed)
      await publicPage.addInitScript((value) => {
        if (window.top === window) localStorage.setItem('proto-bridge-ui:language', value)
      }, language)
      const memberHeaders: string[] = []
      publicPage.on('request', (request) => {
        if (request.url().includes('/demo-scripts') && request.headers()['x-access-token'])
          memberHeaders.push(request.url())
      })
      await publicPage.goto(`${new URL(baseURL!).origin}/share/open?revisionId=r-v1`)
      await publicPage.getByRole('button', { name: labels.demoScripts, exact: true }).click()
      const publicPanel = publicPage.locator('.demo-workspace')
      await publicPanel.locator('.demo-record').click()
      await expect(publicPanel.locator('.demo-spoken')).toBeVisible()
      await expect(
        publicPanel.getByRole('button', { name: labels.demoSave, exact: true }),
      ).toHaveCount(0)
      await publicPanel.locator('#demo-jump').selectOption({ index: 1 })
      await publicPanel.getByRole('button', { name: labels.demoCopy, exact: true }).click()
      const locator = await publicPage.evaluate(() => navigator.clipboard.readText())
      expect(locator).toContain('/share/open?')
      expect(locator).not.toMatch(/accessKey|runtime|objective|actor/)
      await publicPage.goto(locator)
      await expect(publicPage.locator('.demo-spoken')).toHaveText('First visit')
      expect(memberHeaders).toEqual([])
      await publicPage.screenshot({
        path: info.outputPath(`public-${language}-${width}.png`),
        animations: 'disabled',
      })
      await panel.locator('input[type=checkbox]').uncheck()
      await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
      await expect(panel.getByText(labels.demoSaved, { exact: true })).toBeVisible()
      await publicPage.reload()
      await expect(
        publicPage.locator('.demo-workspace').getByText(labels.demoUnavailable, { exact: true }),
      ).toBeVisible()
      await visitor.close()
      await panel.getByRole('button', { name: labels.demoClose, exact: true }).click()
      await expect(trigger).toBeFocused()
      expect(errors).toEqual([])
    })
  }
test('F29 preserves drafts and retries the exact original key/payload before conflict refresh', async ({
  page,
}) => {
  const { panel, labels } = await fill(page)
  const bodies: unknown[] = []
  await page.route('**/demo-scripts', async (route) => {
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
  await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
  await expect(panel.getByRole('button', { name: labels.demoRetry, exact: true })).toBeVisible()
  await expect(panel.locator('#demo-title')).toBeDisabled()
  await panel.getByRole('button', { name: labels.demoRetry, exact: true }).click()
  await expect(panel.getByText(labels.demoSaved, { exact: true })).toBeVisible()
  expect(bodies[1]).toEqual(bodies[0])
  await panel.locator('#demo-objective').fill('Retained private draft')
  await panel.getByRole('button', { name: labels.demoClose, exact: true }).click()
  const confirmation = page.getByRole('dialog').filter({ hasText: labels.demoDiscardTitle })
  await expect(
    confirmation.getByRole('button', { name: labels.demoKeep, exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(panel.locator('#demo-objective')).toHaveValue('Retained private draft')
  let intercepted = false
  await page.route('**/demo-scripts/*', async (route) => {
    if (route.request().method() !== 'PUT' || intercepted) return route.continue()
    intercepted = true
    await route.fetch()
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, status: 409 }),
    })
  })
  await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
  await expect(
    panel.getByRole('button', { name: labels.demoRefreshVersion, exact: true }),
  ).toBeVisible()
  await panel.getByRole('button', { name: labels.demoRefreshVersion, exact: true }).click()
  await expect(panel.getByText(labels.demoRefreshed, { exact: true })).toBeVisible()
  await expect(panel.locator('#demo-objective')).toHaveValue('Retained private draft')
  await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
  await expect(panel.getByText(labels.demoSaved, { exact: true })).toBeVisible()
})

test('F29 validates empty input, verifies password deep links and confirms a named deletion with cancel focus', async ({
  page,
  browser,
}) => {
  const { panel, labels } = await fill(page)
  const title = await panel.locator('#demo-title').inputValue()
  await panel.locator('#demo-objective').fill('')
  await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
  await expect(panel.locator('#demo-objective')).toBeFocused()
  await expect(panel.getByText(labels.demoInvalid, { exact: true })).toBeVisible()
  await panel.locator('#demo-objective').fill('Goal')
  await panel.locator('input[type=checkbox]').check()
  await panel.getByRole('button', { name: labels.demoSave, exact: true }).click()
  await expect(panel.getByText(labels.demoSaved, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: labels.demoRehearse, exact: true }).click()
  await panel.getByRole('button', { name: labels.demoCopy, exact: true }).click()
  const locator = (await page.evaluate(() => navigator.clipboard.readText())).replace(
    '/preview/p1/v1?',
    '/share/locked?',
  )
  const visitor = await browser.newContext(),
    publicPage = await visitor.newPage()
  await publicPage.clock.setFixedTime(fixed)
  await publicPage.goto(locator)
  await expect(
    publicPage.getByText(protoLocales.zh.sharePasswordProtected, { exact: true }),
  ).toBeVisible()
  await publicPage.getByLabel(protoLocales.zh.password, { exact: true }).fill('test-share-password')
  await publicPage.getByRole('button', { name: protoLocales.zh.open, exact: true }).click()
  await expect(publicPage.locator('.demo-spoken')).toHaveText('Child detail')
  const invalid = new URL(locator)
  invalid.searchParams.set('stepId', 'unknown-step')
  await publicPage.goto(invalid.href)
  await publicPage.getByLabel(protoLocales.zh.password, { exact: true }).fill('test-share-password')
  await publicPage.getByRole('button', { name: protoLocales.zh.open, exact: true }).click()
  await expect(
    publicPage.locator('.demo-workspace').getByText(labels.demoUnavailable, { exact: true }),
  ).toBeVisible()
  await expect(publicPage.locator('.demo-spoken')).toHaveCount(0)
  await visitor.close()
  await panel.getByRole('button', { name: labels.demoReturnEdit, exact: true }).click()
  await panel.getByRole('button', { name: labels.demoDelete, exact: true }).click()
  let confirmation = page.getByRole('dialog').filter({ hasText: labels.demoDeleteTitle })
  await expect(confirmation).toContainText(title)
  await expect(
    confirmation.getByRole('button', { name: labels.demoKeep, exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(panel.locator('#demo-title')).toHaveValue(title)
  await panel.getByRole('button', { name: labels.demoDelete, exact: true }).click()
  confirmation = page.getByRole('dialog').filter({ hasText: labels.demoDeleteTitle })
  await confirmation.getByRole('button', { name: labels.demoDelete, exact: true }).click()
  await expect(panel.getByText(labels.demoDeleted, { exact: true })).toBeVisible()
  await expect(panel.locator('.demo-record')).toHaveCount(0)
})
