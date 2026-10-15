import dayjs from 'dayjs'
import type {
  LegacyQueryColumn,
  Query,
  QueryDraft,
  QueryDraftTerm,
  QueryField,
  QuerySource,
  QueryTerm,
  QueryWireProvenance,
} from '@/shared/api/types'

const noValueOperators = ['isnull', 'notnull', 'empty', 'nempty']
const rangeOperators = ['btw', 'nbtw']
const multipleOperators = ['in', 'nin']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value instanceof Date) return new Date(value.getTime())
  if (isRecord(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]))
  return value
}
export function cloneQueryTerms<T extends QueryTerm>(terms: T[]): T[] {
  return terms.map((term) => cloneValue(term) as T)
}
function snapshot(term: QueryTerm): QueryWireProvenance['source'] {
  return { column: term.column, termType: term.termType, value: cloneValue(term.value) }
}
function unchanged(term: QueryDraftTerm): boolean {
  return (
    !!term.__queryWire && JSON.stringify(snapshot(term)) === JSON.stringify(term.__queryWire.source)
  )
}
function apiTerm(term: QueryTerm): QueryTerm {
  const copy = cloneQueryTerms([term])[0]
  Reflect.deleteProperty(copy, '__queryWire')
  if (copy.terms) copy.terms = copy.terms.map(apiTerm)
  return copy
}
export function queryOperators(field?: QueryField): string[] {
  if (field?.operators !== undefined) return [...new Set(field.operators)]
  const operators =
    field?.type === 'select' || field?.type === 'treeSelect'
      ? ['eq', 'not', 'in', 'nin', 'isnull', 'notnull']
      : ['date', 'number', 'time'].includes(field?.type || '')
        ? ['eq', 'not', 'gt', 'gte', 'lt', 'lte', 'btw', 'nbtw', 'isnull', 'notnull']
        : ['like', 'nlike', 'eq', 'not', 'in', 'nin', 'isnull', 'notnull']
  if (field?.termType && !operators.includes(field.termType)) operators.unshift(field.termType)
  return operators
}
export function defaultOperator(field?: QueryField): string {
  const preferred =
    field?.termType ||
    (field?.type === 'date'
      ? 'btw'
      : field?.multiple
        ? 'in'
        : field?.type && field.type !== 'text'
          ? 'eq'
          : 'like')
  const operators = queryOperators(field)
  return operators.includes(preferred) ? preferred : operators[0] || ''
}
export function createQueryTerm(fields: QueryField[], index = 0): QueryDraftTerm {
  const available = fields.filter((field) => queryOperators(field).length)
  const ordered = [
    ...available.filter((field) => field.first),
    ...available.filter((field) => !field.first),
  ]
  const field = ordered[index]
  return field ? { column: field.key, termType: defaultOperator(field) } : {}
}
export function createQueryGroups(fields: QueryField[], count = 2, rows = 3): QueryDraftTerm[] {
  return Array.from({ length: Math.max(1, count) }, (_, group) => ({
    ...(group ? { type: 'and' as const } : {}),
    terms: Array.from({ length: Math.max(1, rows) }, (_, row) =>
      !group && !row ? createQueryTerm(fields) : { type: 'or' as const },
    ),
  }))
}
export function changeQueryField(
  term: QueryTerm,
  column: string,
  fields: QueryField[],
): QueryDraftTerm {
  const field = fields.find((item) => item.key === column)
  return { ...(term.type ? { type: term.type } : {}), column, termType: defaultOperator(field) }
}
function valueShape(
  operator?: string,
  field?: QueryField,
): 'none' | 'range' | 'multiple' | 'scalar' {
  return noValueOperators.includes(operator || '')
    ? 'none'
    : rangeOperators.includes(operator || '')
      ? 'range'
      : multipleOperators.includes(operator || '') || field?.multiple
        ? 'multiple'
        : 'scalar'
}
export function changeQueryOperator(
  term: QueryTerm,
  operator: string,
  fields: QueryField[],
): QueryDraftTerm {
  const field = fields.find((item) => item.key === term.column)
  const next = queryOperators(field).includes(operator) ? operator : defaultOperator(field)
  const copy = apiTerm(term)
  copy.termType = next
  if (
    valueShape(term.termType, field) !== valueShape(next, field) ||
    valueShape(next, field) === 'none'
  )
    Reflect.deleteProperty(copy, 'value')
  return copy
}
function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (value === '' || (typeof value === 'string' && !value.trim())) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
function timeValue(value: unknown): unknown {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)
    ? value
    : undefined
}
function scalarValue(value: unknown, field?: QueryField): unknown {
  if (field?.type === 'number') return finiteNumber(value)
  if (field?.type === 'time') return timeValue(value)
  if (field?.type === 'date') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value !== 'string' || !value) return undefined
    const date = /^-?\d+$/.test(value) ? dayjs(Number(value)) : dayjs(value)
    return date.isValid() ? date.valueOf() : undefined
  }
  return cloneValue(value)
}
function empty(value: unknown): boolean {
  return (
    value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
  )
}
function normalizeTerms(terms: QueryTerm[], fields: QueryField[]): QueryTerm[] {
  return terms.flatMap((term: QueryDraftTerm) => {
    if (term.terms) {
      const children = normalizeTerms(term.terms, fields)
      return children.length ? [{ ...apiTerm(term), terms: children }] : []
    }
    if (unchanged(term)) {
      const wire = term.__queryWire!.terms.map(apiTerm)
      return wire.length === 1
        ? [{ ...wire[0], type: term.type }]
        : [{ type: term.type, terms: wire }]
    }
    if (!term.column) return []
    const field = fields.find((item) => item.key === term.column)
    const operator =
      term.termType || field?.termType || (field ? defaultOperator(field) : undefined)
    if (field && !queryOperators(field).includes(operator || '')) return []
    const prepared = {
      ...apiTerm(term),
      column: field?.rename || term.column,
      ...(operator ? { termType: operator } : {}),
    }
    let value = field?.prepareValue
      ? field.prepareValue(cloneValue(term.value), prepared)
      : cloneValue(term.value)
    if (!noValueOperators.includes(operator || '') && empty(value)) return []
    if (rangeOperators.includes(operator || '')) {
      if (!Array.isArray(value) || value.length !== 2 || value.some(empty)) return []
      const range = value.map((item) => scalarValue(item, field))
      if (range.some(empty)) return []
      value = range
    } else if (multipleOperators.includes(operator || '')) {
      const values = Array.isArray(value)
        ? value
        : String(value)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
      const typed = values.map((item) => scalarValue(item, field))
      if (typed.some(empty)) return []
      value = typed
    } else if (!noValueOperators.includes(operator || '')) {
      value = scalarValue(value, field)
      if (empty(value)) return []
    }
    if (['like', 'nlike'].includes(operator || ''))
      value = `%${String(value).replace(/^%|%$/g, '')}%`
    const result = { ...apiTerm(term), ...(operator ? { termType: operator } : {}), value }
    if (noValueOperators.includes(operator || '')) Reflect.deleteProperty(result, 'value')
    if (field?.rename) result.column = field.rename
    const transformed = field?.transform ? field.transform(result) : result
    return (Array.isArray(transformed) ? transformed : [transformed]).map(apiTerm)
  })
}
/** Draft conversion is the sole transport boundary; the two-argument form retains its existing shape. */
export function normalizeQueryTerms(
  terms: QueryTerm[],
  fields: QueryField[],
  source: QuerySource = 'transport',
): QueryTerm[] {
  const result = normalizeTerms(terms, fields)
  if (source === 'draft' && result.length === 1 && result[0].terms?.every((term) => !term.terms))
    return result[0].terms
  return result
}
export function editableQueryTerms(
  terms: QueryTerm[],
  fields: QueryField[] = [],
  source: QuerySource = 'transport',
): QueryDraftTerm[] {
  if (source === 'draft') return cloneQueryTerms(terms)
  return terms.map((term) => {
    if (term.terms)
      return { ...apiTerm(term), terms: editableQueryTerms(term.terms, fields, source) }
    let field = fields.find((item) => item.key === term.column || item.rename === term.column)
    let restored = field?.restore?.(apiTerm(term))
    if (!field) {
      for (const candidate of fields) {
        const result = candidate.restore?.(apiTerm(term))
        if (result) {
          field = candidate
          restored = result
          break
        }
      }
    }
    const draft: QueryDraftTerm = restored ? apiTerm(restored) : apiTerm(term)
    if (field && (!field.transform || restored)) draft.column = field.key
    const rawLike =
      !!field &&
      term.column === field.key &&
      ['like', 'nlike'].includes(term.termType || '') &&
      typeof term.value === 'string' &&
      !(term.value.startsWith('%') && term.value.endsWith('%'))
    if (
      !restored &&
      !rawLike &&
      ['like', 'nlike'].includes(draft.termType || '') &&
      typeof draft.value === 'string'
    )
      draft.value = draft.value.replace(/^%|%$/g, '')
    // A business inverse may also explicitly recognize an old, already editable raw leaf.
    const raw =
      rawLike ||
      (!!restored &&
        (term.column === field?.key || term.column !== field?.rename) &&
        JSON.stringify({ termType: restored.termType, value: restored.value }) ===
          JSON.stringify({ termType: term.termType, value: term.value }))
    if (!raw) draft.__queryWire = { terms: [apiTerm(term)], source: snapshot(draft) }
    return draft
  })
}
export function serializeDraft(query: Query): QueryDraft {
  const clean = (terms: QueryTerm[]): QueryDraftTerm[] =>
    cloneQueryTerms(terms).map((term: QueryDraftTerm) => {
      if (term.terms) term.terms = clean(term.terms)
      if (term.__queryWire && !unchanged(term)) Reflect.deleteProperty(term, '__queryWire')
      return term
    })
  return { version: 1, terms: clean(query.terms || []) }
}
function validValue(value: unknown, depth = 0): boolean {
  if (depth > 32) return false
  if (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every((item) => validValue(item, depth + 1))
  return isRecord(value) && Object.values(value).every((item) => validValue(item, depth + 1))
}
function validTerms(value: unknown, legacy: boolean, depth = 0): boolean {
  if (!Array.isArray(value) || depth > 24) return false
  return value.every((term) => {
    if (legacy && term === null) return true
    if (!isRecord(term)) return false
    if (term.column !== undefined && typeof term.column !== 'string') return false
    if (term.termType !== undefined && typeof term.termType !== 'string') return false
    if (term.type !== undefined && term.type !== 'and' && term.type !== 'or') return false
    if (!validValue(term.value)) return false
    if (term.terms !== undefined && !validTerms(term.terms, legacy, depth + 1)) return false
    if (term.__queryWire !== undefined) {
      const wire = term.__queryWire
      if (
        !isRecord(wire) ||
        !isRecord(wire.source) ||
        !Array.isArray(wire.terms) ||
        !validTerms(wire.terms, false, depth + 1) ||
        !wire.terms.length ||
        !validValue(wire.source)
      )
        return false
      if (wire.source.column !== undefined && typeof wire.source.column !== 'string') return false
      if (wire.source.termType !== undefined && typeof wire.source.termType !== 'string')
        return false
      if (Object.keys(wire.source).some((key) => !['column', 'termType', 'value'].includes(key)))
        return false
    }
    return true
  })
}
export function parseDraft(value: unknown, fields: QueryField[]): QueryDraft | undefined {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
    if (!isRecord(parsed) || (parsed.version !== undefined && parsed.version !== 1))
      return undefined
    const legacy = parsed.version !== 1
    if (!validTerms(parsed.terms, legacy)) return undefined
    let nullSlots = false
    const convert = (terms: unknown[]): QueryTerm[] =>
      terms.map((value) => {
        if (value === null) {
          nullSlots = true
          return {}
        }
        const term = value as QueryTerm
        return { ...term, ...(term.terms ? { terms: convert(term.terms) } : {}) }
      })
    const terms = convert(parsed.terms as unknown[])
    return {
      version: 1,
      terms: editableQueryTerms(terms, fields, !legacy || nullSlots ? 'draft' : 'transport'),
    }
  } catch {
    return undefined
  }
}
export function queryFieldsFromColumns(columns: LegacyQueryColumn[]): QueryField[] {
  return columns.flatMap((column) => {
    const search = column.search
    if (!search || !Object.keys(search).length) return []
    const loader = typeof search.options === 'function' ? search.options : undefined
    const field: QueryField = {
      key: column.dataIndex,
      label: column.title,
      type: search.type === 'string' ? 'text' : search.type,
      rename: search.rename,
      first: search.first,
      termType: search.defaultTermType,
      ...(Array.isArray(search.options)
        ? { options: search.options }
        : loader
          ? { loadOptions: () => loader() }
          : {}),
    }
    const legacyOperators =
      field.type === 'select' || field.type === 'treeSelect'
        ? ['eq', 'not', 'in', 'nin']
        : field.type === 'number'
          ? ['eq', 'not', 'gt', 'gte', 'lt', 'lte']
          : field.type === 'date' || field.type === 'time'
            ? ['gt', 'lt', 'gte', 'lte']
            : ['like', 'nlike']
    field.operators = (search.termOptions?.length ? search.termOptions : legacyOperators).filter(
      (operator) => !search.termFilter?.includes(operator),
    )
    if (search.handleValue) {
      const handleValue = search.handleValue
      field.prepareValue = handleValue
    }
    return field.operators.length ? [field] : []
  })
}
