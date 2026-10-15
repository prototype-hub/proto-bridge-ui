import { expect, test, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import type { Query, QueryDraft, QueryTerm } from '../../src/shared/api/types'
import { login } from './system-helpers'

const screenshotDirectory = fileURLToPath(new URL('../../docs/screenshots', import.meta.url))

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
function nextQuery(page: Page, path: string) {
  return page.waitForRequest(
    (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
  )
}
function queryGeometry(query: Locator) {
  return query.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
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
    return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, validControls }
  })
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('desktop grouped search preserves OR inside the role scope and versioned history', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.route('**/api/role/group/_query/no-paging', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: [
          { id: 'default_group', name: '默认' },
          { id: 'grouped-search-team', name: '搜索验收分组' },
        ],
      },
    }),
  )
  await page.route('**/api/role/_query/', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: { data: [{ id: 'local-role', name: '本地验收角色' }], total: 1 },
      },
    }),
  )
  const records: { key: string; name: string; content: string }[] = []
  let deletedKey: string | undefined
  const historyPath = '/api/user/settings/system-role'
  await page.route(
    (url) => url.pathname === historyPath || url.pathname.startsWith(`${historyPath}/`),
    async (route) => {
      const request = route.request()
      if (request.method() === 'POST') {
        records.push({ key: 'grouped/query', ...request.postDataJSON() })
      } else if (request.method() === 'DELETE') {
        deletedKey = decodeURIComponent(
          new URL(request.url()).pathname.slice(historyPath.length + 1),
        )
        records.splice(0)
      }
      await route.fulfill({ json: { success: true, status: 200, result: records } })
    },
  )
  await login(page)
  await page.goto('system/Role')
  const content = page.locator('.role-content'),
    query = content.locator('.pro-query')
  await expect(content.getByRole('cell', { name: '本地验收角色', exact: true })).toBeVisible()
  const scopeRequest = nextQuery(page, '/api/role/_query/')
  await page.locator('.role-sidebar').getByText('搜索验收分组', { exact: true }).click()
  expect((await scopeRequest).postDataJSON().terms).toEqual([
    { column: 'groupId', termType: 'eq', value: 'grouped-search-team' },
  ])
  await query.getByRole('button', { name: '更多筛选', exact: true }).click()
  await expect(query.locator('.query-row')).toHaveCount(6)
  await expect(query.locator('[data-query-group]')).toHaveCount(2)
  const first = query.locator('.query-row[data-query-row="0.0"]'),
    additional = query.locator('.query-row[data-query-row="0.1"]'),
    second = query.locator('.query-row[data-query-row="1.0"]')
  await first.getByPlaceholder('请输入查询内容', { exact: true }).fill('Alice')
  await choose(page, additional.locator('.query-field'), '描述')
  await choose(page, additional.locator('.query-operator'), '等于')
  await additional.getByPlaceholder('请输入查询内容', { exact: true }).fill('Operations')
  await choose(page, additional.locator('.query-row-relation'), '并且')
  await choose(page, second.locator('.query-field'), '名称')
  await second.getByPlaceholder('请输入查询内容', { exact: true }).fill('Remote')
  await choose(page, query.locator('.query-group-relation'), '或者')
  const filters: QueryTerm[] = [
    {
      terms: [
        { column: 'name', termType: 'like', value: '%Alice%' },
        { type: 'and', column: 'description', termType: 'eq', value: 'Operations' },
      ],
    },
    { type: 'or', terms: [{ type: 'or', column: 'name', termType: 'like', value: '%Remote%' }] },
  ]
  const searched = nextQuery(page, '/api/role/_query/')
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  const scopedQuery = (await searched).postDataJSON() as Query
  expect(scopedQuery.terms).toEqual([
    { terms: filters },
    { column: 'groupId', termType: 'eq', value: 'grouped-search-team' },
  ])
  expect(scopedQuery).toMatchObject({ pageIndex: 0, pageSize: 20 })
  const groups = query.locator('[data-query-group]')
  const left = await groups.nth(0).boundingBox(),
    right = await groups.nth(1).boundingBox(),
    relation = await query.locator('.query-group-relation').boundingBox()
  expect(left && right && relation).toBeTruthy()
  expect(left!.x + left!.width).toBeLessThanOrEqual(relation!.x)
  expect(relation!.x + relation!.width).toBeLessThanOrEqual(right!.x)
  expect(Math.abs(left!.y - right!.y)).toBeLessThan(2)
  const middleRow = await additional.boundingBox()
  expect(middleRow).not.toBeNull()
  expect(
    Math.abs(relation!.y + relation!.height / 2 - (middleRow!.y + middleRow!.height / 2)),
  ).toBeLessThan(4)
  await query.screenshot({
    path: `${screenshotDirectory}/search-layout-role-expanded.png`,
    animations: 'disabled',
  })

  await query.getByRole('button', { name: '收起筛选', exact: true }).click()
  await expect(query.locator('.query-row')).toHaveCount(1)
  await expect(query.locator('.query-hidden-count')).toContainText('2个有效条件')
  const foldedSearch = nextQuery(page, '/api/role/_query/')
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  expect((await foldedSearch).postDataJSON().terms).toEqual(scopedQuery.terms)

  await query.getByRole('button', { name: '保存查询', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('名称', { exact: true }).fill('分组条件记录')
  const saved = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/settings/system-role'),
  )
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  const payload = (await saved).postDataJSON() as { name: string; content: string },
    draft = JSON.parse(payload.content) as QueryDraft
  expect(payload.name).toBe('分组条件记录')
  expect(draft.version).toBe(1)
  expect(draft.terms).toHaveLength(2)
  expect(draft.terms.map((group) => group.terms?.length)).toEqual([3, 3])
  expect(draft.terms[0]!.terms![0]!.value).toBe('Alice')
  expect(draft.terms[1]!.terms![0]!.value).toBe('Remote')
  expect(payload.content).not.toContain('%Alice%')
  await expect(dialog).not.toBeVisible()
  await query.getByRole('button', { name: '搜索记录', exact: true }).click()
  const restored = nextQuery(page, '/api/role/_query/')
  await page
    .locator('.query-history-menu')
    .getByRole('menuitem', { name: '分组条件记录', exact: true })
    .click()
  expect((await restored).postDataJSON().terms).toEqual(scopedQuery.terms)
  await expect(query.locator('.query-row')).toHaveCount(6)
  await query.getByRole('button', { name: '删除查询记录', exact: true }).click()
  const deleted = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().endsWith('/system-role/grouped%2Fquery'),
  )
  const reloadedHistory = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname === historyPath,
  )
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await deleted
  expect(await (await reloadedHistory).json()).toMatchObject({ result: [] })
  expect(deletedKey).toBe('grouped/query')
  await expect(query.getByRole('button', { name: '删除查询记录', exact: true })).toHaveCount(0)
  await query.getByRole('button', { name: '搜索记录', exact: true }).click()
  await expect(page.locator('.query-history-empty')).toContainText('暂无搜索记录')
})

test('mobile groups stack without overflowing and folded conditions remain active', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('system/user')
  const query = page.locator('.pro-query')
  await query.getByRole('button', { name: '更多筛选', exact: true }).click()
  await expect(query.locator('.query-row')).toHaveCount(6)
  const first = query.locator('.query-row[data-query-row="0.0"]'),
    second = query.locator('.query-row[data-query-row="1.0"]')
  await first.getByPlaceholder('请输入查询内容', { exact: true }).fill('Mobile')
  await choose(page, second.locator('.query-field'), '用户名')
  await second.getByPlaceholder('请输入查询内容', { exact: true }).fill('admin')
  const geometry = await queryGeometry(query)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
  expect(geometry.validControls).toBe(true)
  const groups = query.locator('[data-query-group]'),
    left = await groups.nth(0).boundingBox(),
    right = await groups.nth(1).boundingBox()
  expect(right!.y).toBeGreaterThan(left!.y + left!.height)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({
    path: `${screenshotDirectory}/search-layout-mobile.png`,
    fullPage: true,
    animations: 'disabled',
  })
  const searched = nextQuery(page, '/api/user/detail/_query')
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  const terms = (await searched).postDataJSON().terms
  await query.getByRole('button', { name: '收起筛选', exact: true }).click()
  await expect(query.locator('.query-hidden-count')).toContainText('1个有效条件')
  await expect(query.locator('.query-row')).toHaveCount(1)
  const foldedGeometry = await queryGeometry(query)
  expect(foldedGeometry.scrollWidth).toBeLessThanOrEqual(foldedGeometry.clientWidth)
  expect(foldedGeometry.validControls).toBe(true)
  await query.screenshot({
    path: `${screenshotDirectory}/search-layout-mobile-collapsed.png`,
    animations: 'disabled',
  })
  const folded = nextQuery(page, '/api/user/detail/_query')
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  expect((await folded).postDataJSON().terms).toEqual(terms)
  const reset = nextQuery(page, '/api/user/detail/_query')
  await query.getByRole('button', { name: '重置', exact: true }).click()
  expect((await reset).postDataJSON().terms).toEqual([])
  await expect(query.locator('.query-row')).toHaveCount(1)
})
