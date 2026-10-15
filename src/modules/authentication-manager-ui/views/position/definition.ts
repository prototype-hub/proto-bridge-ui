import type { Query, QueryTerm } from '@/shared/api/types'
import type { Field } from '@/modules/authentication-manager-ui/types/forms'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import {
  isRecord,
  recordsOf,
  resultOf,
  stringValue,
} from '@/modules/authentication-manager-ui/utils/model'
import { t } from '@/shared/i18n'
import { field } from '@/modules/authentication-manager-ui/utils/form-schema'
import * as positions from '@/modules/authentication-manager-ui/api/position/positions'

function mapPositionTerms(terms: QueryTerm[]): QueryTerm[] {
  return terms.map((term) =>
    term.terms
      ? { ...term, terms: mapPositionTerms(term.terms) }
      : term.column === 'roles'
        ? { ...term, column: 'id$position-role$position', termType: undefined }
        : term,
  )
}
export function positionQuery(query: Query): Query {
  return { ...query, terms: mapPositionTerms(query.terms || []) }
}
export function positionDetail(response: unknown): SystemRecord | undefined {
  const value = resultOf(response)
  return recordsOf(Array.isArray(value) ? value : isRecord(value) ? [value] : [])[0]
}
export const positionFields: Field[] = [
  field('name', 'text', true, { max: 64 }),
  field('orgId', 'tree', true, { source: 'organizations', immutable: true }),
  field('roles', 'multiple', true, { source: 'roles' }),
  field('parentId', 'select', false, { source: 'positions' }),
  field('description', 'textarea', false, { max: 200 }),
]
export async function savePosition(data: Model, editing: boolean) {
  const { __editing: _editing, ...record } = data
  if (record.id && record.id === record.parentId) throw new Error(t('organization.invalidParent'))
  const body = {
    ...Object.fromEntries(
      ['id', 'name', 'orgId', 'parentId', 'description']
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, record[key]]),
    ),
    roles: Array.isArray(record.roles)
      ? record.roles.map((item) => ({ id: isRecord(item) ? item.id : item }))
      : [],
  }
  return editing
    ? positions.update(stringValue(record.orgId), [body])
    : positions.save(stringValue(record.orgId), body)
}
