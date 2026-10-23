import { expect, it, vi } from 'vitest'
import axios, { type AxiosAdapter } from 'axios'
import { versionsApi } from '@/modules/protohub-manager-ui/api/version'

it('carries the parent project as an encoded HTTP query through the real client and Axios adapter', async () => {
  const capture: AxiosAdapter = async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: true, result: { data: [], total: 0, pageIndex: 1, pageSize: 10 } },
  })
  const adapter = vi.fn(capture)
  const query = {
    pageIndex: 1,
    pageSize: 10,
    keyword: '100%_\\中文',
    sortBy: 'name',
    sortOrder: 'asc',
  } as const
  const result = await versionsApi.query('project/中文 &?', query, { adapter, silent: true })
  expect(result).toMatchObject({ total: 0, pageIndex: 1, pageSize: 10 })
  const config = adapter.mock.calls[0][0]
  const url = new URL(axios.getUri(config), 'http://127.0.0.1')
  expect(url.pathname).toBe('/api/prototype-hub/versions/_query')
  expect(url.searchParams.get('projectId')).toBe('project/中文 &?')
  expect([...url.searchParams.keys()]).toEqual(['projectId'])
  expect(JSON.parse(config.data as string)).toEqual(query)
})
