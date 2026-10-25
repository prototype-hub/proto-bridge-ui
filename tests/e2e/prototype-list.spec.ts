import { expect, test, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { ownerProjectAccess } from '../fixtures/project-access'
import type { PrototypeListQuery } from '../../src/modules/protohub-manager-ui/types'

function paged<T extends { id: string; createdAt: number }>(
  rows: T[],
  query: PrototypeListQuery,
  name: (row: T) => string,
) {
  const filtered = rows.filter((row) => name(row).includes(query.keyword || ''))
  filtered.sort(
    (left, right) =>
      (query.sortBy === 'name'
        ? name(left).localeCompare(name(right))
        : left.createdAt - right.createdAt) * (query.sortOrder === 'asc' ? 1 : -1) ||
      left.id.localeCompare(right.id),
  )
  const pageSize = query.pageSize ?? 20
  const pageIndex = query.pageIndex ?? 0
  return {
    success: true,
    status: 200,
    result: {
      data: filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: filtered.length,
      pageIndex,
      pageSize,
    },
  }
}
async function sort(page: Page, label: string) {
  await page.locator('.prototype-list-order .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByText(label, { exact: true })
    .click()
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('project queries page on the server, submit literal names and clamp after deleting the last row', async ({
  page,
}) => {
  let rows = Array.from({ length: 21 }, (_, index) => ({
    id: `f08-${index}`,
    name: index === 0 ? '项目100%_\\中文' : `Project ${String(index).padStart(2, '0')}`,
    createdAt: index + 1,
    updatedAt: index + 1,
    createdBy: 'u1',
    ...ownerProjectAccess,
  }))
  const queries: PrototypeListQuery[] = []
  const legacy: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/api/prototype-hub/projects'
    )
      legacy.push(request.url())
  })
  await page.route('**/api/prototype-hub/projects/_query', async (route) => {
    const query = route.request().postDataJSON() as PrototypeListQuery
    queries.push(query)
    await route.fulfill({ json: paged(rows, query, (row) => row.name) })
  })
  await page.route('**/api/prototype-hub/projects/f08-*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)
    rows = rows.filter((row) => row.id !== id)
    await route.fulfill({ json: { success: true, status: 200, result: true } })
  })
  await login(page)
  await expect(page.locator('.project-card')).toHaveCount(20)
  await page.locator('.ant-pagination-item-2').click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  expect(queries.at(-1)).toMatchObject({ pageIndex: 1, pageSize: 20 })
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.project-card')).toHaveCount(20)
  expect(queries.slice(-2).map((query) => query.pageIndex)).toEqual([1, 0])
  await sort(page, '名称升序')
  await expect
    .poll(() => queries.at(-1))
    .toMatchObject({ pageIndex: 0, sortBy: 'name', sortOrder: 'asc' })
  const count = queries.length
  const input = page.getByRole('region', { name: '搜索名称', exact: true }).getByRole('textbox')
  await input.fill('  Project 01  ')
  expect(queries.length).toBe(count)
  await input.press('Enter')
  await expect(page.locator('.project-card')).toHaveCount(1)
  expect(queries.at(-1)).toMatchObject({ keyword: 'Project 01', pageIndex: 0 })
  await input.fill('100%_\\')
  await input.press('Enter')
  await expect(page.locator('.project-card')).toHaveCount(0)
  expect(queries.at(-1)?.keyword).toBe('100%_\\')
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.locator('.project-card')).toHaveCount(20)
  expect(queries.at(-1)?.keyword).toBeUndefined()
  expect(legacy).toEqual([])
})

test('version filters and size changes use paged results inside the current project scope', async ({
  page,
}) => {
  const rows = Array.from({ length: 31 }, (_, index) => ({
    id: `list-v${index}`,
    projectId: 'p1',
    versionName: index < 3 ? `100%_\\中文 ${index}` : `Version ${String(index).padStart(2, '0')}`,
    createdAt: index + 1,
    createdBy: 'u1',
    description: '',
    status: 'ready',
    entryFile: 'index.html',
    currentRevisionId: `r${index}`,
    revisionId: `r${index}`,
    revisionCount: 1,
    migrationRequired: false,
    runtimeBaseUrl: null,
    previewUrl: null,
  }))
  const queries: PrototypeListQuery[] = []
  await page.route('**/api/prototype-hub/versions/_query?*', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('projectId')).toBe('p1')
    const query = route.request().postDataJSON() as PrototypeListQuery
    queries.push(query)
    await route.fulfill({ json: paged(rows, query, (row) => row.versionName) })
  })
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(20)
  await page.locator('.ant-pagination-item-2').click()
  await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(11)
  await page.locator('.ant-pagination-options .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option')
    .filter({ hasText: /^10 / })
    .click()
  await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(10)
  expect(queries.at(-1)).toMatchObject({ pageIndex: 0, pageSize: 10 })
  await sort(page, '创建时间从旧到新')
  await expect
    .poll(() => queries.at(-1))
    .toMatchObject({ pageIndex: 0, sortBy: 'createTime', sortOrder: 'asc' })
  const input = page.getByRole('region', { name: '搜索名称', exact: true }).getByRole('textbox')
  await input.fill('100%_\\中文')
  await input.press('Enter')
  await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(3)
  expect(queries.at(-1)).toMatchObject({ keyword: '100%_\\中文', pageIndex: 0, pageSize: 10 })
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(10)
})
