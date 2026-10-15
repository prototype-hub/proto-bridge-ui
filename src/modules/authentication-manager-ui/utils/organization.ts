import type { QueryTerm } from '@/shared/api/types'
import type { SelectOption } from '@/modules/authentication-manager-ui/types/forms'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { flatten } from '@/modules/authentication-manager-ui/utils/model'

export function forbiddenParents(rows: SystemRecord[], id: string): Set<string> {
  const node = flatten(rows).find((item) => item.id === id)
  return new Set(node ? flatten([node]).map((item) => item.id) : [])
}
export function parentOptions(rows: SystemRecord[], id = ''): SelectOption[] {
  const forbidden = forbiddenParents(rows, id)
  const convert = (items: SystemRecord[]): SelectOption[] =>
    items
      .filter((item) => !forbidden.has(item.id))
      .map((item) => ({ value: item.id, label: item.name, children: convert(item.children || []) }))
  return convert(rows)
}
export function organizationSearchOptions(options: SelectOption[], path = ''): SelectOption[] {
  return options.flatMap((option) => {
    const label = path ? `${path} / ${option.label}` : option.label
    return [
      { value: option.value, label },
      ...organizationSearchOptions(option.children || [], label),
    ]
  })
}
export function nextOrganizationOrder(rows: SystemRecord[], parentId = ''): number {
  const siblings = parentId
    ? flatten(rows).find((row) => row.id === parentId)?.children || []
    : rows
  return Math.max(0, ...siblings.map((row) => Number(row.sortIndex) || 0)) + 1
}
export function organizationMemberTerms(id: string): QueryTerm[] {
  return [
    {
      terms: [
        { terms: [{ column: 'id$in-org-user$org', value: [id] }] },
        { type: 'or', terms: [{ column: 'id$in-org-user$position', value: [id] }] },
      ],
    },
  ]
}
