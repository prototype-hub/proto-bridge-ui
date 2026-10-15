import type { QueryTerm } from '@/shared/api/types'
import type { SelectOption } from '@/modules/authentication-manager-ui/types/forms'
import { isRecord } from '@/modules/authentication-manager-ui/utils/model'

export function enabled(value: unknown): boolean {
  if (isRecord(value)) return enabled(value.value)
  return value === 1 || value === '1' || value === 'enabled'
}

export function idsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(isRecord(item) ? item.id : item)).filter(Boolean)
    : []
}

export function scopedIdentityTerms(
  terms: QueryTerm[] | undefined,
  scope: QueryTerm[],
): QueryTerm[] {
  return [...(terms?.length ? [{ terms }] : []), ...scope]
}

export function optionIds(options: SelectOption[]): string[] {
  return options.flatMap((option) => [String(option.value), ...optionIds(option.children || [])])
}
