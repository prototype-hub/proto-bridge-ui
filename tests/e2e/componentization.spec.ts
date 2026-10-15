import { expect, test, type Page } from '@playwright/test'
import type { Query } from '../../src/shared/api/types'

async function login(page: Page) {
  await page.goto('login')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
}

function nextQuery(page: Page, path: string) {
  return page.waitForRequest(
    (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
  )
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('Users QueryTable translates page events and preserves filtering when page size changes', async ({
  page,
}) => {
  test.setTimeout(60000)
  const users = Array.from({ length: 120 }, (_, index) => ({
    id: `paging-user-${index}`,
    username: `paging-user-${index}`,
    name: `Paging ${index}`,
    status: 0,
    roleList: [],
    positions: [],
  }))
  const queries: Query[] = []
  await page.route('**/api/user/detail/_query', async (route) => {
    const query = route.request().postDataJSON() as Query
    queries.push(query)
    const pageIndex = query.pageIndex ?? 0,
      pageSize = query.pageSize ?? 20
    await route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          data: users.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
          total: users.length,
          pageIndex,
          pageSize,
        },
      },
    })
  })
  await login(page)
  await page.goto('system/user')
  const table = page.locator('.query-table')
  await expect(table.getByRole('cell', { name: 'Paging 0', exact: true })).toBeVisible()
  expect(queries[0]).toMatchObject({ pageIndex: 0, pageSize: 20, terms: [] })

  const thirdPage = nextQuery(page, '/api/user/detail/_query')
  await table.locator('.ant-pagination-item-3').click()
  expect((await thirdPage).postDataJSON()).toMatchObject({ pageIndex: 2, pageSize: 20 })
  await expect(table.getByRole('cell', { name: 'Paging 40', exact: true })).toBeVisible()

  await table
    .locator('.query-row[data-query-row="0.0"]')
    .getByPlaceholder('请输入查询内容', { exact: true })
    .fill('Paging')
  const searched = nextQuery(page, '/api/user/detail/_query')
  await table.getByRole('button', { name: '搜索', exact: true }).click()
  const searchQuery = (await searched).postDataJSON() as Query
  expect(searchQuery).toMatchObject({ pageIndex: 0, pageSize: 20 })
  expect(searchQuery.terms).toEqual(
    expect.arrayContaining([{ column: 'name', termType: 'like', value: '%Paging%' }]),
  )
  await expect(table.locator('.ant-pagination-item-active')).toHaveText('1')
  await expect(table.getByRole('cell', { name: 'Paging 0', exact: true })).toBeVisible()

  const secondPage = nextQuery(page, '/api/user/detail/_query')
  await table.locator('.ant-pagination-item-2').click()
  expect((await secondPage).postDataJSON()).toMatchObject({
    pageIndex: 1,
    pageSize: 20,
    terms: searchQuery.terms,
  })
  await expect(table.getByRole('cell', { name: 'Paging 20', exact: true })).toBeVisible()

  const resized = nextQuery(page, '/api/user/detail/_query')
  await table.locator('.ant-pagination-options .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^50\s/ })
    .click()
  expect((await resized).postDataJSON()).toMatchObject({
    pageIndex: 0,
    pageSize: 50,
    terms: searchQuery.terms,
  })
  await expect(table.locator('.ant-pagination-item-active')).toHaveText('1')
  await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(50)

  const largerSecondPage = nextQuery(page, '/api/user/detail/_query')
  await table.locator('.ant-pagination-item-2').click()
  expect((await largerSecondPage).postDataJSON()).toMatchObject({ pageIndex: 1, pageSize: 50 })
  await expect(table.getByRole('cell', { name: 'Paging 50', exact: true })).toBeVisible()
  const reset = nextQuery(page, '/api/user/detail/_query')
  await table.getByRole('button', { name: '重置', exact: true }).click()
  expect((await reset).postDataJSON()).toMatchObject({ pageIndex: 0, pageSize: 50, terms: [] })
  await expect(table.getByRole('cell', { name: 'Paging 0', exact: true })).toBeVisible()
})

test('role group changes retain the QueryTable filter and reset pagination inside the new scope', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.route('**/api/role/group/_query/no-paging', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: [
          { id: 'default_group', name: '默认' },
          { id: 'component_group', name: 'Component team' },
        ],
      },
    }),
  )
  await page.route('**/api/role/_query/', (route) => {
    const query = route.request().postDataJSON() as Query
    const pageIndex = query.pageIndex ?? 0,
      pageSize = query.pageSize ?? 20
    return route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          data: [{ id: `role-page-${pageIndex}`, name: `Paging role ${pageIndex}` }],
          total: 80,
          pageIndex,
          pageSize,
        },
      },
    })
  })
  await login(page)
  await page.goto('system/Role')
  const table = page.locator('.role-content'),
    sidebar = page.locator('.role-sidebar')
  await expect(table.getByRole('cell', { name: 'Paging role 0', exact: true })).toBeVisible()
  await table
    .locator('.query-row[data-query-row="0.0"]')
    .getByPlaceholder('请输入查询内容', { exact: true })
    .fill('Paging')
  const searched = nextQuery(page, '/api/role/_query/')
  await table.getByRole('button', { name: '搜索', exact: true }).click()
  const searchQuery = (await searched).postDataJSON() as Query
  await expect(table.getByRole('cell', { name: 'Paging role 0', exact: true })).toBeVisible()
  const paged = nextQuery(page, '/api/role/_query/')
  await table.locator('.ant-pagination-item-2').click()
  expect((await paged).postDataJSON()).toMatchObject({ pageIndex: 1, pageSize: 20 })
  await expect(table.getByRole('cell', { name: 'Paging role 1', exact: true })).toBeVisible()

  const scoped = nextQuery(page, '/api/role/_query/')
  await sidebar.getByText('Component team', { exact: true }).click()
  expect((await scoped).postDataJSON()).toMatchObject({
    pageIndex: 0,
    pageSize: 20,
    terms: [
      ...(searchQuery.terms || []),
      { column: 'groupId', termType: 'eq', value: 'component_group' },
    ],
  })
  await expect(table.locator('.ant-pagination-item-active')).toHaveText('1')
  await expect(
    table
      .locator('.query-row[data-query-row="0.0"]')
      .getByPlaceholder('请输入查询内容', { exact: true }),
  ).toHaveValue('Paging')
  await expect(table.getByRole('cell', { name: 'Paging role 0', exact: true })).toBeVisible()

  const global = nextQuery(page, '/api/role/_query/')
  await sidebar.getByText('全局角色', { exact: true }).click()
  expect((await global).postDataJSON()).toMatchObject({ pageIndex: 0, terms: searchQuery.terms })
})
