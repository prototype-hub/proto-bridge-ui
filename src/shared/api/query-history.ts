import { request } from './client'
import type { RequestOptions } from './types'

export interface QueryHistoryRecord {
  id: string
  name: string
  content: unknown
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Settings may identify a saved search by its legacy key or by its record id. */
function recordsOf(response: unknown): QueryHistoryRecord[] {
  const rows = isRecord(response) ? response.result : response
  if (!Array.isArray(rows)) return []
  return rows.filter(isRecord).flatMap((row) => {
    const id = row.key ?? row.id
    return (typeof id === 'string' || typeof id === 'number') && typeof row.name === 'string'
      ? [{ id: String(id), name: row.name, content: row.content }]
      : []
  })
}
export async function queryHistory(target: string, options?: RequestOptions) {
  return recordsOf(await request.get(`/user/settings/${target}`, undefined, options))
}
export function saveQueryHistory(target: string, name: string, content: string) {
  return request.post(`/user/settings/${target}`, { name, content })
}
export function removeQueryHistory(target: string, id: string) {
  return request.remove(`/user/settings/${target}/${encodeURIComponent(id)}`)
}
