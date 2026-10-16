import type { ServerResponse } from 'node:http'
import { stores, settings, object, page, queried, userTypes } from './system-data'
import { integrationResponse } from './system-integration'
export function systemResponse(
  path: string,
  method: string,
  input: unknown,
  res: ServerResponse,
): boolean {
  const send = (result: unknown) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: true, status: 200, result }))
  }
  const data = object(input)
  if (integrationResponse(path, method, input, send)) return true
  if (path === '/system/config/scopes')
    send(
      (Array.isArray(input) ? input : []).map((scope) => ({
        scope,
        properties: settings[String(scope)] || {},
      })),
    )
  else if (path === '/system/config/scope/_save') {
    for (const item of Array.isArray(input) ? input : []) {
      const row = object(item)
      settings[String(row.scope)] = row.properties
    }
    send(true)
  } else if (path.startsWith('/system/config/')) {
    const key = path.slice(15)
    if (method === 'POST') settings[key] = input
    send(settings[key] || {})
  } else if (path === '/system/version') send({ version: 'mock-1.0', edition: 'Contract fixture' })
  else if (path === '/system/resources/permission' && method === 'GET')
    send(
      ['system_config', 'menu', 'user', 'permission'].map((id) =>
        JSON.stringify({ id, name: id, actions: [{ id: 'query', name: '查询' }] }),
      ),
    )
  else if (path === '/logger/system/_query')
    send(
      page([
        {
          id: 'log1',
          name: '服务日志',
          level: 'ERROR',
          message: 'System log fixture',
          context: { server: 'node1' },
          threadName: 'reactor-http',
          className: 'ExampleHandler',
          createTime: 1700000000000,
          exceptionStack: 'ExampleException\n at ExampleHandler.run',
        },
      ]),
    )
  else if (path === '/user/detail/types') send(userTypes)
  else if (path === '/user/me/password/_validate') send({ passed: true })
  else if (path === '/user/detail' && method === 'PUT') {
    settings.profile = data
    send(true)
  } else if (path === '/user/passwd') send(true)
  else if (path === '/user/_query/no-paging') send([{ id: 'u1', name: 'Admin' }])
  else if (path.startsWith('/user/settings/')) {
    const [key, id] = path.slice(15).split('/')
    if (
      !key.startsWith('search-') &&
      !key.startsWith('system-') &&
      !key.startsWith('category-') &&
      key !== 'category' &&
      key !== 'system_dictionary'
    ) {
      if (method !== 'GET') settings[key] = input
      send(settings[key] || {})
    } else {
      const rows = Array.isArray(settings[key]) ? (settings[key] as Record<string, unknown>[]) : []
      if (method === 'GET') send(rows)
      else if (method === 'DELETE') {
        settings[key] = rows.filter((row) => row.id !== id)
        send(true)
      } else {
        const value = { id: `history-${rows.length + 1}`, ...data }
        settings[key] = [...rows, value]
        send(value)
      }
    }
  } else if (path === '/asset/types')
    send([
      { id: 'product', name: '产品' },
      { id: 'device', name: '设备' },
    ])
  else if (path.endsWith('/_exists')) {
    const key = path.split('/')[1]
    const rows = stores[key] || []
    const where = data.where
    if (typeof where === 'string' && where.startsWith('id is '))
      send(rows.some((row) => row.id === where.slice(6)))
    else send(queried(rows, input).length > 0)
  } else if (path === '/dictionary/detail/_query')
    send(
      queried(stores.dictionary, input).map((row) => ({
        ...row,
        items: stores['dictionary-item'].filter((item) => item.dictId === row.id),
      })),
    )
  else {
    const entry = Object.keys(stores).find(
      (key) => path === `/${key}` || path.startsWith(`/${key}/`),
    )
    if (!entry) return false
    const rows = stores[entry],
      suffix = path.slice(entry.length + 1)
    if (suffix.includes('_query') || suffix.includes('_all/tree')) {
      const result = queried(rows, input)
      send(suffix.includes('no-paging') || suffix.includes('_all/tree') ? result : page(result))
    } else if (method === 'DELETE') {
      stores[entry] = rows.filter((row) => row.id !== suffix.slice(1))
      send(true)
    } else if (
      suffix.endsWith('/_create') ||
      suffix.endsWith('/_save') ||
      (!suffix && ['POST', 'PUT', 'PATCH'].includes(method))
    ) {
      const values = Array.isArray(input) ? input : [input]
      let last: unknown
      for (const item of values) {
        const row = object(item),
          id = String(row.id || `new-${Date.now()}`)
        const value = {
          ...row,
          id,
          ...(suffix.endsWith('/_create') ? { orgId: suffix.split('/')[1] } : {}),
        }
        const index = rows.findIndex((row) => row.id === id)
        if (index < 0) rows.push(value)
        else rows[index] = value
        last = value
      }
      send(last)
    } else if (method === 'PUT') {
      const row = rows.find((row) => row.id === suffix.slice(1))
      if (row) Object.assign(row, data)
      send(row)
    } else if (method === 'GET') send(rows.find((row) => row.id === suffix.split('/')[1]) || {})
    else return false
  }
  return true
}
