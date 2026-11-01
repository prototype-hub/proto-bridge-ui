import { expect, test, type Page, type Locator } from '@playwright/test'
import { login } from '../e2e/system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { runtimeHtml } from '../fixtures/runtime'

type Locale = 'zh' | 'en'
const origin = 'http://127.0.0.1:5194'
const words = (locale: Locale = 'zh') => protoLocales[locale]
const runtime = (page: Page) => page.frameLocator('.frame-stage > iframe')
const inspector = (page: Page, locale: Locale = 'zh') =>
  page.getByRole('complementary', { name: words(locale).inspectWorkspace, exact: true })

async function prepare(page: Page, locale: Locale = 'zh', member = false) {
  if (member) await login(page)
  await page.addInitScript(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  await page.goto(member ? 'preview/p1/v1' : 'share/open')
  await expect(runtime(page).locator('#measure-a')).toBeVisible()
  await page
    .locator('.ant-radio-button-wrapper')
    .filter({ has: page.getByRole('radio', { name: words(locale).inspect, exact: true }) })
    .click()
  if (await page.getByRole('button', { name: words(locale).inspectWorkspace, exact: true }).count())
    await page.getByRole('button', { name: words(locale).inspectWorkspace, exact: true }).click()
  const panel = inspector(page, locale)
  await expect(panel).toBeVisible()
  await panel.getByRole('tab', { name: words(locale).inspectMeasure, exact: true }).click()
  await expect(
    panel.getByRole('button', {
      name: words(locale).inspectPick.replace('{slot}', 'A'),
      exact: true,
    }),
  ).toBeEnabled()
  return panel
}

async function beginPick(page: Page, panel: Locator, slot: 'A' | 'B', locale: Locale = 'zh') {
  await panel
    .getByRole('button', { name: words(locale).inspectPick.replace('{slot}', slot), exact: true })
    .click()
  const surface = runtime(page).locator('[data-inspect-tool-surface]')
  await expect(surface).toBeVisible()
  return surface
}

async function pick(
  page: Page,
  panel: Locator,
  slot: 'A' | 'B',
  target: string,
  locale: Locale = 'zh',
) {
  const surface = await beginPick(page, panel, slot, locale)
  const position = await runtime(page)
    .locator(target)
    .evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })
  await surface.click({ position })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.inspect-selection').nth(slot === 'A' ? 0 : 1)).toContainText(
    `#${target.slice(1)}`,
  )
}

async function readStyles(panel: Locator, locale: Locale = 'zh') {
  await panel.getByRole('tab', { name: words(locale).inspectPageStyles, exact: true }).click()
  await panel
    .getByRole('button', {
      name: new RegExp(
        `^(${words(locale).inspectReadStyles}|${words(locale).inspectRefreshStyles})$`,
      ),
    })
    .click()
  await expect(panel.locator('.inspect-style-section')).toHaveCount(2)
}

test.use({ deviceScaleFactor: 2 })
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${origin}/__test/reset`)).ok()).toBe(true)
})

test('measures root CSS rectangles after pointer picking beyond 3 seconds under global div transitions', async ({
  page,
}) => {
  const panel = await prepare(page)
  const surface = await beginPick(page, panel, 'A')
  await page.waitForTimeout(3200)
  await expect(surface).toBeVisible()
  await surface.click({ position: { x: 90, y: 110 } })
  await expect(panel.locator('.inspect-selection').first()).toContainText('DIV#measure-a')
  await pick(page, panel, 'B', '#measure-b')
  await expect(panel.locator('[data-inspect-axis=horizontal]')).toHaveText('40 CSS px')
  await expect(panel.locator('[data-inspect-axis=vertical]')).toHaveText('30 CSS px')
  await expect(panel.getByText('水平 · 间隔', { exact: true })).toBeVisible()
  await expect(panel.getByText('垂直 · 重叠', { exact: true })).toBeVisible()
  await pick(page, panel, 'B', '#measure-a')
  await expect(panel.locator('[data-inspect-axis=horizontal]')).toHaveText('100 CSS px')
  await expect(panel.locator('[data-inspect-axis=vertical]')).toHaveText('60 CSS px')
  await panel.getByRole('button', { name: words().inspectClear, exact: true }).click()
  await expect(panel.locator('[data-inspect-axis]')).toHaveCount(0)
  await expect(panel.locator('.inspect-selection').filter({ hasText: '#measure-' })).toHaveCount(0)
})

test('retains document CSS coordinates through iframe scroll and detects touching rectangles', async ({
  page,
}) => {
  const panel = await prepare(page)
  await runtime(page)
    .locator('html')
    .evaluate(() => window.scrollTo(20, 50))
  await pick(page, panel, 'A', '#measure-a')
  await pick(page, panel, 'B', '#measure-b')
  await expect(panel.locator('[data-inspect-axis=horizontal]')).toHaveText('40 CSS px')
  await runtime(page)
    .locator('#measure-b')
    .evaluate((element) => {
      ;(element as HTMLElement).style.left = '140px'
    })
  await expect(panel.getByText(words().inspectStale, { exact: true })).toBeVisible()
  // Wait for the real page transition to finish before taking a fresh snapshot.
  await page.waitForTimeout(200)
  await pick(page, panel, 'A', '#measure-a')
  await pick(page, panel, 'B', '#measure-b')
  await expect(panel.locator('[data-inspect-axis=horizontal]')).toHaveText('0 CSS px')
  await expect(panel.getByText('水平 · 相接', { exact: true })).toBeVisible()
})

for (const locale of ['zh', 'en'] as const)
  test(`390px ${locale} keyboard picker waits for drawer close and restores the exact A/B control`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const panel = await prepare(page, locale)
    const surface = await beginPick(page, panel, 'A', locale)
    await expect(panel).toBeHidden()
    await expect(surface).toBeFocused()
    await page.waitForTimeout(3200)
    await expect(surface).toBeFocused()
    await surface.press('ArrowRight')
    await surface.press('ArrowRight')
    await surface.press('Enter')
    await expect(panel).toBeVisible()
    await expect(
      panel.getByRole('button', {
        name: words(locale).inspectPick.replace('{slot}', 'A'),
        exact: true,
      }),
    ).toBeFocused()
    const cancel = await beginPick(page, panel, 'B', locale)
    await expect(cancel).toBeFocused()
    await cancel.press('Escape')
    await expect(panel).toBeVisible()
    await expect(
      panel.getByRole('button', {
        name: words(locale).inspectPick.replace('{slot}', 'B'),
        exact: true,
      }),
    ).toBeFocused()
    await expect(panel.locator('.inspect-selection').first()).toContainText('DIV#measure-a')
    await expect(panel.locator('.inspect-selection').last()).not.toContainText('#measure-')
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390)
  })

test('reads exact painted color occurrences and font tuples without element selection; owned picker changes preserve summary', async ({
  page,
}) => {
  const panel = await prepare(page, 'en', true)
  await readStyles(panel, 'en')
  const row = (value: string) =>
    panel
      .locator('.inspect-style-list li')
      .filter({ has: page.locator('code').filter({ hasText: value }) })
  await expect(row('rgb(10, 20, 30)')).toContainText('2 occurrences')
  await expect(row('rgb(1, 2, 3)')).toContainText('2 occurrences')
  await expect(row('rgb(4, 5, 6)')).toContainText('4 occurrences')
  await expect(panel.locator('.inspect-font-list li')).toHaveCount(1)
  await expect(panel.locator('.inspect-font-list li')).toContainText('Arial')
  await expect(panel.locator('.inspect-font-list li')).toContainText('16px / 400 / 24px')
  await expect(panel.locator('.inspect-font-list li')).toContainText('2 text elements')
  await expect(panel.getByText('rgb(90, 91, 92)', { exact: true })).toHaveCount(0)
  await panel.getByRole('tab', { name: words('en').inspectMeasure, exact: true }).click()
  await pick(page, panel, 'A', '#measure-a', 'en')
  await page.waitForTimeout(250)
  await panel.getByRole('tab', { name: words('en').inspectPageStyles, exact: true }).click()
  await expect(row('rgb(10, 20, 30)')).toContainText('2 occurrences')
  await expect(panel.getByText(words('en').inspectStale, { exact: true })).toHaveCount(0)
  // A page element event, unlike tool-owned overlays, invalidates every new-tool result.
  await runtime(page)
    .locator('#measure-a')
    .evaluate((element) => element.dispatchEvent(new Event('transitionrun', { bubbles: true })))
  await expect(panel.getByText(words('en').inspectStale, { exact: true })).toBeVisible()
  await expect(panel.locator('.inspect-style-section')).toHaveCount(0)
  await readStyles(panel, 'en')
  await expect(row('rgb(4, 5, 6)')).toContainText('4 occurrences')
})

test('excludes fully transparent text/background/borders and reports bounded root-only partial scans', async ({
  page,
}) => {
  const panel = await prepare(page)
  await runtime(page)
    .locator('body')
    .evaluate((body) => {
      const node = document.createElement('div')
      node.style.cssText =
        'position:absolute;top:300px;width:100px;height:40px;color:rgba(0,0,0,0);background:transparent;border:2px solid transparent'
      node.textContent = 'Transparent direct text'
      body.append(node)
      const opaque = document.createElement('div')
      opaque.style.cssText =
        'position:absolute;top:350px;width:100px;height:40px;color:rgb(255,0,0);background:rgb(0,128,0);border:2px solid rgb(0,0,0)'
      opaque.textContent = 'Opaque direct text'
      body.append(opaque)
      for (let index = 0; index < 2100; index++) {
        const hidden = document.createElement('span')
        hidden.hidden = true
        body.append(hidden)
      }
    })
  await readStyles(panel)
  await expect(panel.getByText(words().inspectTruncated, { exact: true })).toBeVisible()
  await expect(panel.locator('.inspect-style-section').first()).not.toContainText('rgba(')
  for (const [value, count] of [
    ['rgb(255, 0, 0)', 1],
    ['rgb(0, 128, 0)', 1],
    ['rgb(0, 0, 0)', 4],
  ] as const)
    await expect(
      panel
        .locator('.inspect-style-list li')
        .filter({ has: page.locator('code').filter({ hasText: value }) }),
    ).toContainText(`${count} 处`)
  await expect(panel.getByText('已扫描 2,000 个元素', { exact: true })).toBeVisible()
  await expect(panel.locator('.inspect-font-list')).not.toContainText('Times New Roman')
})

test('nested-frame choice becomes unavailable and reconnect/clear recovers without affecting legacy element Inspect', async ({
  page,
}) => {
  const panel = await prepare(page)
  const surface = await beginPick(page, panel, 'A')
  await surface.click({ position: { x: 450, y: 140 } })
  await expect(panel.getByText(words().inspectUnavailable, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: words().inspectReconnect, exact: true }).click()
  await expect(panel.getByRole('button', { name: '选择 A', exact: true })).toBeEnabled()
  await panel.getByRole('tab', { name: words().inspectElement, exact: true }).click()
  await runtime(page).locator('#measure-a').click()
  await expect(panel.getByRole('heading', { name: 'DIV#measure-a', exact: true })).toBeVisible()
  await readStyles(panel)
  await panel.getByRole('tab', { name: words().inspectMeasure, exact: true }).click()
  await panel.getByRole('button', { name: words().inspectClear, exact: true }).click()
  await panel.getByRole('tab', { name: words().inspectPageStyles, exact: true }).click()
  await expect(panel.locator('.inspect-style-section')).toHaveCount(0)
  await panel.getByRole('tab', { name: words().inspectElement, exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'DIV#measure-a', exact: true })).toBeVisible()
})

test('rejects wrong source and stale generation events without replacing valid measurement state', async ({
  page,
}) => {
  const panel = await prepare(page)
  await runtime(page)
    .locator('html')
    .evaluate(() => {
      addEventListener('message', (event) => {
        if (event.data?.type === 'PROTOTYPE_INSPECT_TOOL_COMMAND')
          (window as Window & { lastToolCommand?: unknown }).lastToolCommand = event.data
      })
    })
  await pick(page, panel, 'A', '#measure-a')
  await runtime(page)
    .locator('html')
    .evaluate(() => {
      const command = (window as Window & { lastToolCommand?: Record<string, unknown> })
        .lastToolCommand!
      parent.postMessage(
        {
          type: 'PROTOTYPE_INSPECT_TOOL_EVENT',
          channel: command.channel,
          generation: Number(command.generation) - 1,
          status: 'stale',
        },
        '*',
      )
      parent.postMessage(
        {
          type: 'PROTOTYPE_INSPECT_TOOL_EVENT',
          channel: command.channel,
          generation: command.generation,
          status: 'stale',
          token: 'extra-field',
        },
        '*',
      )
    })
  await page.evaluate(() => {
    const shellFrame = document.querySelector<HTMLIFrameElement>('.frame-stage > iframe')!
    dispatchEvent(
      new MessageEvent('message', {
        origin: 'null',
        source: window,
        data: {
          type: 'PROTOTYPE_INSPECT_TOOL_EVENT',
          channel: 'foreign-channel-1234',
          generation: 1,
          status: 'stale',
        },
      }),
    )
    shellFrame.contentWindow!.postMessage(
      {
        type: 'PROTOTYPE_INSPECT_TOOL_COMMAND',
        channel: 'malformed-channel-1234',
        generation: 99,
        action: 'pick',
        resourcePath: 'home.html',
        prefixLength: 0,
        slot: 'A',
        extra: true,
      },
      '*',
    )
  })
  await expect(panel.locator('.inspect-selection').first()).toContainText('DIV#measure-a')
  await expect(panel.getByText(words().inspectStale, { exact: true })).toHaveCount(0)
})

test('older runtime retains legacy element inspection while new tools fail clearly', async ({
  page,
}) => {
  await page.route('**/runtime/index.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: runtimeHtml }),
  )
  await page.goto('share/open')
  await expect(runtime(page).locator('#u1')).toBeVisible()
  await page
    .locator('.ant-radio-button-wrapper')
    .filter({ has: page.getByRole('radio', { name: words().inspect, exact: true }) })
    .click()
  const panel = inspector(page)
  await expect(panel.getByText(words().inspectUnavailable, { exact: true })).toBeVisible()
  await runtime(page).locator('#u1').click()
  await expect(panel.getByRole('heading', { name: 'BUTTON#u1', exact: true })).toBeVisible()
  await expect(panel.getByRole('tab', { name: words().properties, exact: true })).toBeVisible()
})
