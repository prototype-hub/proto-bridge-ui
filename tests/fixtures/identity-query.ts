import { object } from './system-data'
type Row = Record<string, unknown>
function values(input: unknown): string[] {
  return (Array.isArray(input) ? input : [input]).map((value) => String(object(value).id || value))
}
function matches(row: Row, input: unknown): boolean {
  const term = object(input)
  if (Array.isArray(term.terms)) return group(row, term.terms)
  const column = String(term.column || '')
  if (column === 'id$user-detail') return group(row, Array.isArray(term.value) ? term.value : [])
  const relation = column.match(/^id\$in-dimension\$(role|position|org)(\$not)?$/)
  const org = column.match(/^id\$in-org-user\$(org|position)(\$not)?$/)
  if (relation || org) {
    const current = values(
      relation
        ? row[
            relation[1] === 'role' ? 'roleList' : relation[1] === 'org' ? 'orgIdList' : 'positions'
          ]
        : org?.[1] === 'org'
          ? row.orgIdList
          : Array.isArray(row.positions)
            ? row.positions.map((position) => object(position).orgId)
            : [],
    )
    const found = values(term.value).some((id) => current.includes(id))
    return relation?.[2] || org?.[2] ? !found : found
  }
  const current = object(row[column]).value ?? row[column]
  const expected = term.value
  switch (term.termType || 'eq') {
    case 'eq':
      return String(current) === String(expected)
    case 'not':
      return String(current) !== String(expected)
    case 'like':
      return String(current || '').includes(String(expected).replace(/%/g, ''))
    case 'nlike':
      return !String(current || '').includes(String(expected).replace(/%/g, ''))
    case 'in':
      return values(expected).includes(String(current))
    case 'nin':
      return !values(expected).includes(String(current))
    case 'isnull':
      return current === undefined || current === null
    case 'empty':
      return current === ''
    case 'notnull':
      return current !== undefined && current !== null
    case 'gt':
      return Number(current) > Number(expected)
    case 'gte':
      return Number(current) >= Number(expected)
    case 'lt':
      return Number(current) < Number(expected)
    case 'lte':
      return Number(current) <= Number(expected)
    default:
      return true
  }
}
function group(row: Row, terms: unknown[]) {
  if (!terms.length) return true
  return terms
    .slice(1)
    .reduce<boolean>(
      (previous, term) =>
        object(term).type === 'or'
          ? previous || matches(row, term)
          : previous && matches(row, term),
      matches(row, terms[0]),
    )
}
export function identityRows<T extends Row>(rows: T[], input: unknown): T[] {
  const data = object(input)
  let result = rows.filter((row) => !Array.isArray(data.terms) || group(row, data.terms))
  if (Array.isArray(data.sorts))
    result = result.slice().sort((a, b) => {
      for (const sort of data.sorts as unknown[]) {
        const item = object(sort),
          key = String(item.name),
          direction = item.order === 'desc' ? -1 : 1
        const value = String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * direction
        if (value) return value
      }
      return 0
    })
  return result
}
export function identityPage<T extends Row>(rows: T[], input: unknown) {
  const data = object(input),
    pageIndex = Number(data.pageIndex || 0),
    pageSize = Number(data.pageSize || 20)
  return {
    data:
      data.paging === false ? rows : rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    total: rows.length,
    pageIndex,
    pageSize,
  }
}
