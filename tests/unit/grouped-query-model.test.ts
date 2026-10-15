import { describe, expect, it, vi } from 'vitest'
import type { QueryDraftTerm, QueryField, QueryTerm } from '@/shared/api/types'
import {
  changeQueryField,
  changeQueryOperator,
  cloneQueryTerms,
  createQueryGroups,
  createQueryTerm,
  defaultOperator,
  editableQueryTerms,
  normalizeQueryTerms,
  parseDraft,
  queryFieldsFromColumns,
  queryOperators,
  serializeDraft,
} from '@/shared/utils/query-model'

const fields: QueryField[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name', first: true },
  { key: 'status', label: 'Status', type: 'select', options: [{ label: 'Disabled', value: 0 }] },
  {
    key: 'ordinal',
    label: 'Order',
    type: 'number',
    operators: [
      'eq',
      'not',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'nin',
      'btw',
      'nbtw',
      'isnull',
      'notnull',
    ],
  },
  { key: 'createdAt', label: 'Created', type: 'date' },
  { key: 'time', label: 'Time', type: 'time' },
]

describe('grouped query draft and transport boundaries', () => {
  it('creates two groups with a default first field and preserves AND/OR without flattening nested trees', () => {
    const draft = createQueryGroups(fields)
    expect(draft).toEqual([
      { terms: [{ column: 'name', termType: 'like' }, { type: 'or' }, { type: 'or' }] },
      { type: 'and', terms: [{ type: 'or' }, { type: 'or' }, { type: 'or' }] },
    ])
    draft[0].terms![0].value = 'Bridge'
    expect(normalizeQueryTerms(draft, fields, 'draft')).toEqual([
      { column: 'name', termType: 'like', value: '%Bridge%' },
    ])
    draft[0].terms![1] = { type: 'or', column: 'status', termType: 'eq', value: 0 }
    draft[1].terms![0] = { column: 'ordinal', termType: 'gte', value: 0 }
    const wire = normalizeQueryTerms(draft, fields, 'draft')
    expect(wire).toEqual([
      {
        terms: [
          { column: 'name', termType: 'like', value: '%Bridge%' },
          { type: 'or', column: 'status', termType: 'eq', value: 0 },
        ],
      },
      { type: 'and', terms: [{ column: 'ordinal', termType: 'gte', value: 0 }] },
    ])
    const nested = [{ terms: wire }]
    expect(normalizeQueryTerms(nested, fields, 'draft')).toEqual(nested)
    expect(normalizeQueryTerms([wire[0]], fields)).toEqual([wire[0]])
  })

  it('normalizes typed zero, membership, dates, time and valueless predicates without mutating the draft', () => {
    const draft: QueryTerm[] = [
      { column: 'status', value: 0 },
      { column: 'ordinal', termType: 'in', value: '0, 2, 3' },
      { column: 'ordinal', termType: 'nbtw', value: [0, 3] },
      { column: 'createdAt', termType: 'btw', value: [0, 100] },
      { column: 'time', termType: 'eq', value: '00:00:00' },
      { column: 'name', termType: 'isnull', value: 'stale' },
    ]
    const original = cloneQueryTerms(draft)
    expect(normalizeQueryTerms(draft, fields, 'draft')).toEqual([
      { column: 'status', termType: 'eq', value: 0 },
      { column: 'ordinal', termType: 'in', value: [0, 2, 3] },
      { column: 'ordinal', termType: 'nbtw', value: [0, 3] },
      { column: 'createdAt', termType: 'btw', value: [0, 100] },
      { column: 'time', termType: 'eq', value: '00:00:00' },
      { column: 'name', termType: 'isnull' },
    ])
    expect(draft).toEqual(original)
    expect(
      normalizeQueryTerms(
        [
          { column: 'ordinal', termType: 'btw', value: [0, undefined] },
          { column: 'ordinal', termType: 'eq', value: Number.NaN },
          { column: 'ordinal', termType: 'in', value: '0, nope' },
          { column: 'time', value: '25:00:00' },
        ],
        fields,
        'draft',
      ),
    ).toEqual([])
  })

  it('clears incompatible values and provenance on field/operator changes, respecting empty operator lists', () => {
    const draft = parseDraft({ terms: [{ column: 'ordinal', termType: 'eq', value: 0 }] }, fields)!
    expect(changeQueryOperator(draft.terms[0], 'gte', fields)).toEqual({
      column: 'ordinal',
      termType: 'gte',
      value: 0,
    })
    expect(changeQueryOperator(draft.terms[0], 'btw', fields)).toEqual({
      column: 'ordinal',
      termType: 'btw',
    })
    expect(changeQueryOperator(draft.terms[0], 'isnull', fields)).toEqual({
      column: 'ordinal',
      termType: 'isnull',
    })
    expect(changeQueryField(draft.terms[0], 'name', fields)).toEqual({
      column: 'name',
      termType: 'like',
    })
    const forbidden: QueryField = { key: 'forbidden', label: 'Forbidden', operators: [] }
    expect(queryOperators(forbidden)).toEqual([])
    expect(defaultOperator(forbidden)).toBe('')
    expect(createQueryTerm([forbidden, fields[1]])).toEqual({ column: 'name', termType: 'like' })
    expect(
      normalizeQueryTerms(
        [{ column: 'forbidden', termType: 'eq', value: 'secret' }],
        [forbidden],
        'draft',
      ),
    ).toEqual([])
  })

  it('saves raw drafts and transforms once per submission, including raw percent shells', () => {
    const transform = vi.fn((term: QueryTerm) => ({
      ...term,
      value: [{ column: 'id', termType: 'in', value: term.value }],
    }))
    const relation: QueryField = {
      key: 'product',
      label: 'Product',
      type: 'select',
      multiple: true,
      transform,
    }
    const raw: QueryTerm[] = [
      {
        terms: [
          { column: 'product', termType: 'in', value: ['p1'] },
          { type: 'or', column: 'name', termType: 'like', value: '%raw%' },
        ],
      },
    ]
    const saved = serializeDraft({ terms: raw })
    const restored = parseDraft(JSON.stringify(saved), [relation, ...fields])!
    expect(restored.terms).toEqual(raw)
    expect(transform).not.toHaveBeenCalled()
    const first = normalizeQueryTerms(restored.terms, [relation, ...fields], 'draft')
    expect(transform).toHaveBeenCalledTimes(1)
    expect(first[1].value).toBe('%raw%')
    expect(
      normalizeQueryTerms(
        parseDraft(JSON.stringify(serializeDraft({ terms: restored.terms })), [
          relation,
          ...fields,
        ])!.terms,
        [relation, ...fields],
        'draft',
      ),
    ).toEqual(first)
    expect(transform).toHaveBeenCalledTimes(2)
    expect(saved.terms[0].terms![1].value).toBe('%raw%')
    ;(restored.terms[0].terms![0].value as string[]).push('p2')
    expect(saved.terms[0].terms![0].value).toEqual(['p1'])
    expect(editableQueryTerms(saved.terms, [], 'draft')[0].terms![1].value).toBe('%raw%')
  })

  it('restores renamed dimension and nested product conditions without reapplying their non-idempotent transform', () => {
    const positionTransform = vi.fn((term: QueryTerm) => ({ ...term, termType: undefined }))
    const productTransform = vi.fn((term: QueryTerm) => ({
      ...term,
      value: [{ column: 'id', termType: 'in', value: term.value }],
    }))
    const relations: QueryField[] = [
      {
        key: 'positions',
        label: 'Positions',
        type: 'select',
        rename: 'id$in-dimension$position',
        operators: ['eq'],
        transform: positionTransform,
        restore: (term) => ({ ...term, column: 'positions', termType: 'eq' }),
      },
      {
        key: 'product',
        label: 'Product',
        type: 'select',
        multiple: true,
        transform: productTransform,
        restore: (term) => ({ ...term, value: ['p1'] }),
      },
    ]
    const wire: QueryTerm[] = [
      {
        terms: [
          { column: 'id$in-dimension$position', value: 'position1' },
          {
            type: 'or',
            column: 'product',
            termType: 'in',
            value: [{ column: 'id', termType: 'in', value: 'p1' }],
          },
        ],
      },
    ]
    const draft = parseDraft({ terms: wire }, relations)!
    expect(draft.terms[0].terms![0].column).toBe('positions')
    expect(draft.terms[0].terms![1].value).toEqual(['p1'])
    expect(normalizeQueryTerms(draft.terms, relations)).toEqual(wire)
    expect(positionTransform).not.toHaveBeenCalled()
    expect(productTransform).not.toHaveBeenCalled()
    draft.terms[0].terms![1].value = ['p2']
    const changed = normalizeQueryTerms(draft.terms, relations)
    expect(changed[0].terms![1].value).toEqual([{ column: 'id', termType: 'in', value: ['p2'] }])
    expect(productTransform).toHaveBeenCalledTimes(1)
    expect(changeQueryOperator(draft.terms[0].terms![0], 'nin', relations).termType).toBe('eq')
  })

  it('retains opaque wire payload across cloning/save/reload and applies new relations without leaking metadata', () => {
    const wire: QueryTerm[] = [
      {
        column: 'custom$relation',
        termType: 'in',
        type: 'or',
        value: [{ filter: { ids: [0, 'x'] } }],
      },
    ]
    const draft = parseDraft({ terms: wire }, [])!
    draft.terms[0].type = 'and'
    const reloaded = parseDraft(JSON.stringify(serializeDraft({ terms: draft.terms })), [])!
    expect(normalizeQueryTerms(reloaded.terms, [], 'draft')).toEqual([{ ...wire[0], type: 'and' }])
    expect(JSON.stringify(normalizeQueryTerms(reloaded.terms, []))).not.toContain('__queryWire')
    const cloned = cloneQueryTerms(reloaded.terms)
    ;(cloned[0].value as { filter: { ids: unknown[] } }[])[0].filter.ids.push('new')
    expect(reloaded.terms[0].value).toEqual(wire[0].value)
    expect(serializeDraft({ terms: cloned }).terms[0].__queryWire).toBeUndefined()
    const fresh = changeQueryField(reloaded.terms[0], 'status', fields)
    fresh.value = 0
    expect(normalizeQueryTerms([fresh], fields, 'draft')).toEqual([
      { type: 'and', column: 'status', termType: 'eq', value: 0 },
    ])
  })

  it('invalidates opaque payload after direct operator/value edits and keeps multi-predicate wire scope intact', () => {
    const transform = vi.fn((term: QueryTerm) => ({
      ...term,
      column: 'mapped',
      value: `mapped:${term.value}`,
    }))
    const field: QueryField = { key: 'opaque', label: 'Opaque', transform }
    const draft = parseDraft(
      { terms: [{ column: 'opaque', termType: 'eq', value: { id: 'saved' } }] },
      [field],
    )!
    draft.terms[0].termType = 'like'
    draft.terms[0].value = 'fresh'
    expect(serializeDraft({ terms: draft.terms }).terms[0].__queryWire).toBeUndefined()
    expect(normalizeQueryTerms(draft.terms, [field], 'draft')).toEqual([
      { column: 'mapped', termType: 'like', value: 'mapped:%fresh%' },
    ])
    const multi: QueryDraftTerm = {
      column: 'opaque',
      termType: 'eq',
      value: 'old',
      type: 'and',
      __queryWire: {
        source: { column: 'opaque', termType: 'eq', value: 'old' },
        terms: [
          { column: 'a', value: 0 },
          { column: 'b', value: 1, type: 'or' },
        ],
      },
    }
    expect(normalizeQueryTerms([multi, { column: 'other', value: 2 }], [], 'draft')).toEqual([
      {
        type: 'and',
        terms: [
          { column: 'a', value: 0 },
          { column: 'b', value: 1, type: 'or' },
        ],
      },
      { column: 'other', value: 2 },
    ])
  })

  it('validates versioned histories and supports old raw null slots without stripping raw percent values', () => {
    const legacy = parseDraft(
      JSON.stringify({
        terms: [
          { terms: [{ column: 'name', termType: 'like', value: '%literal%' }, null, null] },
          { type: 'and', terms: [null, null, null] },
        ],
      }),
      fields,
    )!
    expect(legacy.terms[0].terms![0].value).toBe('%literal%')
    expect(legacy.terms[0].terms![0].__queryWire).toBeUndefined()
    const invalid = [
      'broken JSON',
      { version: 2, terms: [] },
      { version: 1, terms: [null] },
      { version: 1, terms: [{ column: 42 }] },
      { version: 1, terms: [{ type: 'xor' }] },
      { version: 1, terms: [{ terms: 'broken' }] },
      { version: 1, terms: [{ __queryWire: { source: { column: 42 }, terms: [] } }] },
      { version: 1, terms: [{ __queryWire: { source: {}, terms: [{ type: 'xor', value: 1 }] } }] },
      { version: 1, terms: [{ value: Number.POSITIVE_INFINITY }] },
    ]
    invalid.forEach((value) => expect(parseDraft(value, fields)).toBeUndefined())
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(parseDraft({ version: 1, terms: [{ value: cyclic }] }, fields)).toBeUndefined()
  })

  it('recognizes fully populated old raw groups per leaf while preserving neighboring transport predicates', () => {
    const legacy = {
      terms: [
        {
          terms: [
            { column: 'name', termType: 'like', value: 'pump' },
            { column: 'id', termType: 'nlike', value: 'test', type: 'or' },
            { column: 'status', termType: 'eq', value: 0, type: 'or' },
          ],
        },
        {
          type: 'and',
          terms: [
            { column: 'name', termType: 'like', value: '%wire%', type: 'or' },
            { column: 'custom$relation', value: { id: 1 }, type: 'or' },
            { column: 'ordinal', termType: 'gte', value: 0, type: 'or' },
          ],
        },
      ],
    }
    const draft = parseDraft(legacy, fields)!
    expect(draft.terms[0].terms![0].__queryWire).toBeUndefined()
    expect(draft.terms[1].terms![0].value).toBe('wire')
    expect(draft.terms[1].terms![1].__queryWire).toBeDefined()
    const wire = normalizeQueryTerms(draft.terms, fields, 'draft')
    expect(wire[0].terms![0].value).toBe('%pump%')
    expect(wire[0].terms![1].value).toBe('%test%')
    expect(wire[1].terms![0].value).toBe('%wire%')
    expect(wire[1].terms![1]).toEqual(legacy.terms[1].terms[1])
  })

  it('adapts old columns with raw value callbacks after rename, operator exclusions and lazy async options', async () => {
    const options = vi.fn(async () => [{ label: 'Disabled', value: 0 }])
    const handleValue = vi.fn((value: unknown, term: QueryTerm) => {
      expect(term.column).toBe('renamed')
      return String(value).toUpperCase()
    })
    const adapted = queryFieldsFromColumns([
      {
        dataIndex: 'name',
        title: 'Name',
        search: { type: 'string', rename: 'renamed', first: true, handleValue },
      },
      {
        dataIndex: 'orgId',
        title: 'Organization',
        search: { type: 'treeSelect', termOptions: ['eq'], options },
      },
      {
        dataIndex: 'roles',
        title: 'Roles',
        search: { type: 'select', termFilter: ['not', 'in', 'nin'] },
      },
      {
        dataIndex: 'forbidden',
        title: 'Forbidden',
        search: { type: 'string', termFilter: ['like', 'nlike'] },
      },
      { dataIndex: 'hidden', title: 'Hidden' },
    ])
    expect(adapted).toHaveLength(3)
    expect(options).not.toHaveBeenCalled()
    expect(normalizeQueryTerms([{ column: 'name', value: 'raw' }], adapted, 'draft')).toEqual([
      { column: 'renamed', termType: 'like', value: '%RAW%' },
    ])
    expect(handleValue.mock.calls[0][0]).toBe('raw')
    expect(queryOperators(adapted[2])).toEqual(['eq'])
    expect(
      await adapted[1].loadOptions!({
        search: '',
        selected: [0],
        signal: new AbortController().signal,
      }),
    ).toEqual([{ label: 'Disabled', value: 0 }])
  })
})
