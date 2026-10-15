export type Row = Record<string, unknown>
export const stores: Record<string, Row[]> = {}
export let settings: Record<string, unknown> = {}
export function resetSystem() {
  Object.keys(stores).forEach((key) => delete stores[key])
  Object.assign(stores, {
    dictionary: [
      { id: 'colors', name: '颜色字典', status: 1 },
      { id: 'system-dict', name: '系统字典', status: 1, classified: 'system' },
    ],
    'dictionary-item': [
      { id: 'blue', dictId: 'colors', name: 'blue', value: 'blue', text: 'Blue', ordinal: 1 },
      { id: 'green', dictId: 'colors', name: 'green', value: 'green', text: 'Green', ordinal: 5 },
    ],
    organization: [{ id: 'org1', name: '研发部', sortIndex: 1 }],
    position: [
      {
        id: 'position1',
        name: '工程师',
        orgId: 'org1',
        orgName: '研发部',
        roles: [{ id: 'ADMIN', name: 'Administrator' }],
        memberCount: 1,
      },
    ],
    'role/group': [
      { id: 'default_group', name: '默认' },
      { id: 'group1', name: '技术组' },
    ],
    permission: [
      {
        id: 'prototype-hub-project',
        name: 'Prototype project',
        status: 1,
        actions: [
          { action: 'query', name: 'Query' },
          { action: 'save', name: 'Save' },
          { action: 'delete', name: 'Delete' },
        ],
      },
      {
        id: 'disabled-resource',
        name: 'Disabled resource',
        status: 0,
        actions: [{ action: 'query', name: 'Query' }],
      },
    ],
  })
  settings = {
    front: { title: 'ProtoBridge', headerTheme: 'light', showRecordNumber: false },
    amap: { webKey: '', apiKey: '', secretKey: '' },
    paths: { 'base-path': '/tools/' },
  }
}
export function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
}
export function page(rows: Row[]) {
  return { data: rows, total: rows.length, pageIndex: 0, pageSize: 20 }
}
export function queried(rows: Row[], input: unknown): Row[] {
  function matches(row: Row, terms: unknown[]): boolean {
    let result = true
    for (const [index, term] of terms.entries()) {
      const value = object(term)
      const current = String(value.column)
        .split('.')
        .reduce<unknown>((item, key) => object(item)[key], row)
      const expected = value.value
      const list = Array.isArray(expected) ? expected : String(expected ?? '').split(',')
      let hit = true
      if (Array.isArray(value.terms)) hit = matches(row, value.terms)
      else if (!String(value.column).includes('$')) {
        switch (value.termType) {
          case 'like':
            hit = String(current ?? '').includes(String(expected).replace(/%/g, ''))
            break
          case 'nlike':
            hit = !String(current ?? '').includes(String(expected).replace(/%/g, ''))
            break
          case 'eq':
            hit = String(current) === String(expected)
            break
          case 'not':
            hit = String(current) !== String(expected)
            break
          case 'in':
            hit = list.map(String).includes(String(current))
            break
          case 'nin':
            hit = !list.map(String).includes(String(current))
            break
          case 'isnull':
            hit = current == null
            break
          case 'notnull':
            hit = current != null
            break
          case 'btw':
            hit = Number(current) >= Number(list[0]) && Number(current) <= Number(list[1])
            break
        }
      }
      result = index === 0 ? hit : value.type === 'or' ? result || hit : result && hit
    }
    return result
  }
  const query = object(input),
    terms = query.terms
  let result = !Array.isArray(terms) ? [...rows] : rows.filter((row) => matches(row, terms))
  if (Array.isArray(query.sorts)) {
    for (const item of [...query.sorts].reverse()) {
      const sort = object(item),
        key = String(sort.name),
        order = sort.order === 'desc' ? -1 : 1
      result = result.sort((a, b) => (Number(a[key]) - Number(b[key])) * order)
    }
  }
  return result
}
resetSystem()
