import type { QueryTerm } from '@/shared/api/types'

export function scopedQueryTerms(terms: QueryTerm[] | undefined, scope: QueryTerm[]): QueryTerm[] {
  return [...(terms?.length ? [{ terms }] : []), ...scope]
}
