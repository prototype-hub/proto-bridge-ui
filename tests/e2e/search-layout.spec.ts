import { expect, test, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import type { QueryTerm } from '../../src/shared/api/types'
import { login } from './system-helpers'

const screenshotDirectory = fileURLToPath(new URL('../../docs/screenshots', import.meta.url))

async function bounds(locator: Locator) {
  await expect(locator).toBeVisible()
  const rectangle = await locator.boundingBox()
  if (!rectangle) throw new Error('A visible search control has no bounds')
  return rectangle
}

async function choose(page: Page, control: Locator, name: string) {
  const combobox = control.getByRole('combobox')
  await control.locator('.ant-select-selector').click()
  await expect(combobox).toHaveAttribute('aria-expanded', 'true')
  const listboxId =
    (await combobox.getAttribute('aria-controls')) || (await combobox.getAttribute('aria-owns'))
  if (!listboxId) throw new Error('The query control has no associated option list')
  const popup = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id=${JSON.stringify(listboxId)}]`) })
  await expect(popup).toBeVisible()
  await popup.locator('.ant-select-item-option-content').getByText(name, { exact: true }).click()
}

function queryGeometry(query: Locator) {
  return query.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const rows = Array.from(element.querySelectorAll('.query-row'))
    const controls = Array.from(
      element.querySelectorAll(
        '.query-field,.query-operator,.query-value-container,.query-remove-condition,.query-footer button',
      ),
    ).map((control) => control.getBoundingClientRect())
    const validControls = controls.every(
      (control, index) =>
        control.width > 0 &&
        control.height > 0 &&
        control.left >= bounds.left - 1 &&
        control.right <= bounds.right + 1 &&
        controls.slice(index + 1).every((other) => {
          const overlapX = Math.min(control.right, other.right) - Math.max(control.left, other.left)
          const overlapY = Math.min(control.bottom, other.bottom) - Math.max(control.top, other.top)
          return overlapX <= 1 || overlapY <= 1
        }),
    )
    const inlineRows = rows.every((row) => {
      const primaryControls = Array.from(
        row.querySelectorAll('.query-field,.query-operator,.query-value-container'),
      ).map((control) => control.getBoundingClientRect())
      const centers = primaryControls.map((control) => control.top + control.height / 2)
      return primaryControls.length === 3 && Math.max(...centers) - Math.min(...centers) < 4
    })
    return {
      fits: element.scrollWidth <= element.clientWidth,
      validControls,
      inlineRows,
    }
  })
}

async function expectFooter(query: Locator) {
  const outer = await bounds(query),
    reset = await bounds(query.getByRole('button', { name: '重置', exact: true })),
    toggle = await bounds(query.getByRole('button', { name: '收起筛选', exact: true }))
  const rowBottom = await query
    .locator('.query-row')
    .evaluateAll((rows) => Math.max(...rows.map((row) => row.getBoundingClientRect().bottom)))
  expect(reset.y).toBeGreaterThanOrEqual(rowBottom)
  expect(Math.abs(reset.x - outer.x)).toBeLessThan(3)
  expect(Math.abs(toggle.x + toggle.width - outer.x - outer.width)).toBeLessThan(3)
  expect(Math.abs(reset.y + reset.height / 2 - toggle.y - toggle.height / 2)).toBeLessThan(4)
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('wide user search places compact actions inline and expanded groups beside the middle relation', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await login(page)
  await page.goto('system/user')
  const query = page.locator('.pro-query')
  await expect(query.locator('.query-row')).toHaveCount(1)
  await expect(
    query.locator('.query-row-label,.query-row-relation,.query-remove-condition'),
  ).toHaveCount(0)
  await expect
    .poll(() => queryGeometry(query))
    .toEqual({
      fits: true,
      validControls: true,
      inlineRows: true,
    })
  const value = await bounds(query.locator('.query-value-container')),
    reset = await bounds(query.getByRole('button', { name: '重置', exact: true })),
    save = await bounds(query.getByRole('button', { name: '保存查询', exact: true })),
    search = await bounds(query.getByRole('button', { name: '搜索', exact: true })),
    records = await bounds(query.getByRole('button', { name: '搜索记录', exact: true })),
    toggle = await bounds(query.getByRole('button', { name: '更多筛选', exact: true })),
    outer = await bounds(query)
  const controls = [value, reset, save, search, records, toggle]
  const centers = controls.map((control) => control.y + control.height / 2)
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(4)
  expect(reset.x).toBeGreaterThanOrEqual(outer.x + outer.width * 0.65)
  controls
    .slice(0, -1)
    .forEach((control, index) =>
      expect(control.x + control.width).toBeLessThanOrEqual(controls[index + 1]!.x + 1),
    )
  expect(Math.abs(toggle.x + toggle.width - outer.x - outer.width)).toBeLessThan(3)
  await query.screenshot({
    path: `${screenshotDirectory}/search-layout-collapsed.png`,
    animations: 'disabled',
  })

  await query.getByRole('button', { name: '更多筛选', exact: true }).click()
  await expect(query.locator('.query-row')).toHaveCount(6)
  await expect
    .poll(() => queryGeometry(query))
    .toEqual({
      fits: true,
      validControls: true,
      inlineRows: true,
    })
  const groups = query.locator('[data-query-group]'),
    left = await bounds(groups.nth(0)),
    right = await bounds(groups.nth(1)),
    relation = await bounds(query.locator('.query-group-relation')),
    middle = await bounds(query.locator('.query-row[data-query-row="0.1"]'))
  expect(left.x + left.width).toBeLessThanOrEqual(relation.x)
  expect(relation.x + relation.width).toBeLessThanOrEqual(right.x)
  expect(Math.abs(left.y - right.y)).toBeLessThan(2)
  expect(Math.abs(relation.y + relation.height / 2 - middle.y - middle.height / 2)).toBeLessThan(4)
  await expectFooter(query)
  await query.screenshot({
    path: `${screenshotDirectory}/search-layout-expanded.png`,
    animations: 'disabled',
  })
})

test('constrained role content and organization binding keep controls usable without horizontal overflow', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1366, height: 900 })
  await login(page)
  await page.goto('system/Role')
  const roleQuery = page.locator('.role-content .pro-query')
  await roleQuery.getByRole('button', { name: '更多筛选', exact: true }).click()
  await expect(roleQuery.locator('.query-row')).toHaveCount(6)
  await expect
    .poll(() => queryGeometry(roleQuery))
    .toEqual({
      fits: true,
      validControls: true,
      inlineRows: true,
    })
  await expectFooter(roleQuery)

  await page
    .locator('.role-content')
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Administrator', exact: true }) })
    .getByRole('button', { name: '权限设置', exact: true })
    .click()
  const drawer = page.locator('.ant-drawer-content')
  await drawer.getByRole('tab', { name: '用户分配', exact: true }).click()
  const memberQuery = drawer.locator('.pro-query')
  await choose(page, memberQuery.locator('.query-field'), '创建时间')
  const picker = memberQuery.locator('.query-value-container .ant-picker')
  await expect(picker.locator('input')).toHaveCount(2)
  await expect(picker.locator('input').first()).toBeEnabled()
  const pickerBounds = await bounds(picker),
    memberBounds = await bounds(memberQuery)
  expect(pickerBounds.x).toBeGreaterThanOrEqual(memberBounds.x)
  expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(
    memberBounds.x + memberBounds.width,
  )
  await picker.locator('input').first().click()
  await expect(page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')).toBeVisible()

  await page.goto('system/Department')
  await page.locator('.ant-tree-title').getByText('研发部', { exact: true }).click()
  await page.getByRole('tab', { name: '用户', exact: true }).click()
  await page.getByRole('button', { name: '绑定用户', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '绑定用户', exact: true }),
    narrowQuery = dialog.locator('.pro-query')
  await expect(dialog).toBeVisible()
  await expect(narrowQuery.locator('.query-row')).toHaveCount(1)
  await expect
    .poll(async () => {
      const geometry = await queryGeometry(narrowQuery)
      return { fits: geometry.fits, validControls: geometry.validControls }
    })
    .toEqual({ fits: true, validControls: true })
  await narrowQuery.getByRole('button', { name: '更多筛选', exact: true }).click()
  await expect(narrowQuery.locator('.query-row')).toHaveCount(6)
  await expect
    .poll(() => queryGeometry(narrowQuery))
    .toEqual({
      fits: true,
      validControls: true,
      inlineRows: true,
    })
  const narrowGroups = narrowQuery.locator('[data-query-group]'),
    top = await bounds(narrowGroups.nth(0)),
    bottom = await bounds(narrowGroups.nth(1))
  expect(bottom.y).toBeGreaterThan(top.y + top.height)
  await expectFooter(narrowQuery)
  await narrowQuery
    .locator('.query-row[data-query-row="0.0"]')
    .getByPlaceholder('请输入查询内容', { exact: true })
    .fill('Operator')
  const searched = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/user/detail/_query' && request.method() === 'POST',
  )
  await narrowQuery.getByRole('button', { name: '搜索', exact: true }).click()
  const requestBody = (await searched).postDataJSON() as { terms: QueryTerm[] }
  expect(requestBody.terms).toEqual([
    { terms: [{ column: 'name', termType: 'like', value: '%Operator%' }] },
    { column: 'id$in-dimension$org$not', value: 'org1' },
  ])
  await narrowQuery.screenshot({
    path: `${screenshotDirectory}/search-layout-narrow.png`,
    animations: 'disabled',
  })
})
