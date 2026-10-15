import { describe, expect, it } from 'vitest'
import { editableQueryTerms, normalizeQueryTerms } from '../../src/shared/utils/query-model'
import type { QueryField, QueryTerm } from '../../src/shared/api/types'

describe('query value contracts', () => {
  it('preserves status zero and time ranges without text wildcards', () => {
    const fields: QueryField[] = [
      { key: 'status', label: 'Status', type: 'select' },
      { key: 'requestTime', label: 'Time', type: 'date' },
    ]
    expect(
      normalizeQueryTerms(
        [
          { column: 'status', value: 0 },
          { column: 'requestTime', value: [100, 200] },
        ],
        fields,
      ),
    ).toEqual([
      { column: 'status', termType: 'eq', value: 0 },
      { column: 'requestTime', termType: 'btw', value: [100, 200] },
    ])
  })
  it('round trips saved groups and dimension predicates', () => {
    const terms: QueryTerm[] = [
      {
        type: 'or',
        terms: [
          { column: 'name', termType: 'like', value: '%Demo%' },
          { column: 'id$in-dimension$role', termType: 'in', value: ['role1'] },
        ],
      },
    ]
    expect(normalizeQueryTerms(editableQueryTerms(terms), [])).toEqual(terms)
  })
  it('keeps multi select arrays and applies relation mappings', () => {
    const fields: QueryField[] = [
      {
        key: 'roles',
        label: 'Roles',
        type: 'select',
        multiple: true,
        transform: (term) => ({ ...term, column: 'id$in-dimension$role' }),
      },
    ]
    expect(normalizeQueryTerms([{ column: 'roles', value: ['r1', 'r2'] }], fields)).toEqual([
      { column: 'id$in-dimension$role', termType: 'in', value: ['r1', 'r2'] },
    ])
  })
  it('omits empty inputs while keeping null predicates', () => {
    expect(
      normalizeQueryTerms(
        [
          { column: 'name', value: '' },
          { column: 'email', termType: 'isnull' },
          { column: 'status', termType: 'eq', value: 0 },
        ],
        [],
      ).map(({ column }) => column),
    ).toEqual(['email', 'status'])
  })
  it('omits incomplete ranges and empty groups while preserving a zero range boundary', () => {
    expect(
      normalizeQueryTerms(
        [
          { type: 'and', terms: [{ column: 'name', value: '' }] },
          { column: 'sortIndex', termType: 'btw', value: [0, undefined] },
          { column: 'sortIndex', termType: 'btw', value: [0, 10] },
        ],
        [],
      ),
    ).toEqual([{ column: 'sortIndex', termType: 'btw', value: [0, 10] }])
  })
})
