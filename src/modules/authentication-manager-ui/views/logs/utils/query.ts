import type { QueryTerm } from '@/shared/api/types'

export function logTerms(terms: QueryTerm[], kind: 'access' | 'system'): QueryTerm[] {
  const aliases: Record<string, string> =
    kind === 'access'
      ? { description: 'action', username: 'context.username' }
      : { server: 'context.server' }
  return terms.map((term) => ({
    ...term,
    ...(term.column ? { column: aliases[term.column] || term.column } : {}),
    ...(term.terms ? { terms: logTerms(term.terms, kind) } : {}),
  }))
}
