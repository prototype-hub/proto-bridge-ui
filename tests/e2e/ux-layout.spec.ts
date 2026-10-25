import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { ownerProjectAccess } from '../fixtures/project-access'
const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }
test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})
for (const surface of ['preview', 'share'] as const)
  test(`${surface} header stays one desktop row and preserves all operations at 390px in both languages`, async ({
    page,
    request,
  }, testInfo) => {
    await login(page)
    if (surface === 'share') {
      const shares = (
        await (
          await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
        ).json()
      ).result as { id: string; token: string; configVersion: number }[]
      const share = shares.find((row) => row.token === 'open')!
      expect(
        (
          await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
            headers,
            data: { enabled: true, expectedVersion: share.configVersion },
          })
        ).ok(),
      ).toBe(true)
    }
    for (const locale of ['zh', 'en'] as const) {
      const text = protoLocales[locale]
      await page.evaluate(
        (language) => localStorage.setItem('proto-bridge-ui:language', language),
        locale,
      )
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(surface === 'share' ? 'share/open' : 'preview/p1/v1')
      const header = page.locator('.workspace-header')
      await expect(header).toBeVisible()
      const frame = page.locator('.frame-stage > iframe')
      await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
      await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
      const desktop = await header.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          height: rect.height,
          centers: [...element.children]
            .filter((child) => child.getBoundingClientRect().width > 0)
            .map((child) => {
              const bounds = child.getBoundingClientRect()
              return bounds.y + bounds.height / 2
            }),
        }
      })
      expect(desktop.height).toBeLessThanOrEqual(56)
      expect(Math.max(...desktop.centers) - Math.min(...desktop.centers)).toBeLessThan(2)
      // Ant RadioButton's native input is intentionally zero-sized; its label is the visible control.
      const previewMode = header
        .locator('.ant-radio-button-wrapper')
        .filter({ hasText: text.preview })
      const inspectMode = header
        .locator('.ant-radio-button-wrapper')
        .filter({ hasText: text.inspect })
      await expect(previewMode).toBeVisible()
      await expect(inspectMode).toBeVisible()
      await expect(header.getByRole('radio', { name: text.preview, exact: true })).toBeChecked()
      await expect(
        header.getByRole('button', { name: text.copyPageLink, exact: true }),
      ).toBeVisible()
      if (surface === 'share')
        await expect(
          header.getByRole('button', { name: text.reviewIdentity, exact: true }),
        ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`${surface}-${locale}-desktop.png`),
        animations: 'disabled',
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(header.getByRole('button', { name: text.showPages, exact: true })).toBeVisible()
      await inspectMode.click()
      await expect(header.getByRole('radio', { name: text.inspect, exact: true })).toBeChecked()
      const operations = [
        text.showPages,
        text.details,
        text.copyPageLink,
        ...(surface === 'share' ? [text.reviewIdentity] : []),
      ]
      for (const label of operations) {
        const control = header.getByRole('button', { name: label, exact: true })
        await expect(control).toBeVisible()
        const box = await control.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(390)
      }
      expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      )
      await header.getByRole('button', { name: text.details, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.ant-drawer-body .inspector-panel')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.ant-drawer-body .inspector-panel')).toBeHidden()
      await page.screenshot({
        path: testInfo.outputPath(`${surface}-${locale}-390.png`),
        animations: 'disabled',
      })
    }
  })

for (const locale of ['zh', 'en'] as const)
  test(`framework name conditions and right pagination in ${locale} project and version lists`, async ({
    page,
  }, testInfo) => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `ux-${index}`,
      name: `Project ${index}`,
      createdBy: 'owner',
      createdAt: index + 1,
      updatedAt: index + 1,
      ...ownerProjectAccess,
    }))
    await page.route('**/api/prototype-hub/projects/_query', (route) =>
      route.fulfill({
        json: {
          success: true,
          status: 200,
          result: { data: rows.slice(0, 20), total: 21, pageIndex: 0, pageSize: 20 },
        },
      }),
    )
    await login(page)
    await page.evaluate(
      (language) => localStorage.setItem('proto-bridge-ui:language', language),
      locale,
    )
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['prototype-hub', 'prototype-hub/projects/p1']) {
        await page.goto(path)
        const toolbar = page.locator('.prototype-list-toolbar')
        const condition = toolbar.locator('.query-row-compact')
        await expect(condition).toBeVisible()
        const field = condition.locator('.query-field')
        await expect(field).toHaveAttribute(
          'aria-label',
          locale === 'zh' ? '查询字段' : 'Query field',
        )
        await expect(field.locator('.ant-select-selector')).toBeVisible()
        await field.locator('.ant-select-selector').click()
        const nameOption = page
          .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .getByText(locale === 'zh' ? '名称' : 'Name', { exact: true })
        await expect(nameOption).toBeVisible()
        await nameOption.click()
        await expect(condition.getByRole('textbox')).toBeVisible()
        const search = toolbar.locator('.prototype-search-actions .ant-btn-primary')
        await expect(search).toBeVisible()
        await expect(search).toHaveText(locale === 'zh' ? '查询' : 'Search')
        await expect(
          toolbar.getByRole('button', { name: locale === 'zh' ? '重置' : 'Reset', exact: true }),
        ).toBeVisible()
        expect(
          await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true)
        const pagination = page.locator(
          path === 'prototype-hub' ? '.project-pagination' : '.ant-table-pagination',
        )
        await expect(pagination).toBeVisible()
        expect(
          await pagination.evaluate((element) => getComputedStyle(element).justifyContent),
        ).toBe('flex-end')
        await page.screenshot({
          path: testInfo.outputPath(
            `${path.endsWith('p1') ? 'versions' : 'projects'}-search-${locale}-${width}.png`,
          ),
          animations: 'disabled',
          fullPage: true,
        })
      }
    }
  })

test('version preview tooltip uses Chinese by default and switches to English with the platform', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  const preview = page.getByRole('button', { name: '预览', exact: true })
  await preview.hover()
  await expect(page.getByRole('tooltip', { name: '预览', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  const english = page.getByRole('button', { name: 'Preview', exact: true })
  await english.hover()
  await expect(page.getByRole('tooltip', { name: 'Preview', exact: true })).toBeVisible()
})
