import { expect, it, vi } from 'vitest'
import axios, { type AxiosAdapter } from 'axios'
import { projectsApi } from '@/modules/protohub-manager-ui/api/project'
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

it('keeps deleted version scope in the encoded HTTP query and encodes both restore IDs', async () => {
  const adapter = vi.fn<AxiosAdapter>(async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: true, result: {} },
  }))
  await versionsApi.deleted('parent/中文 &?', { pageIndex: 2 }, { adapter, silent: true })
  await projectsApi.restore('p/id', { adapter, silent: true })
  await versionsApi.restore('v/id', { adapter, silent: true })
  const query = new URL(axios.getUri(adapter.mock.calls[0]![0]), 'http://localhost')
  expect(query.pathname).toBe('/api/prototype-hub/versions/_deleted/_query')
  expect(query.searchParams.get('projectId')).toBe('parent/中文 &?')
  expect(adapter.mock.calls.slice(1).map(([config]) => config.url)).toEqual([
    '/prototype-hub/projects/p%2Fid/_restore',
    '/prototype-hub/versions/v%2Fid/_restore',
  ])
})
