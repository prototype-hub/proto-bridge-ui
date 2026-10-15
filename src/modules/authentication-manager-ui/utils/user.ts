import type { QueryTerm } from '@/shared/api/types'
import type { UserInput } from '@/modules/authentication-manager-ui/types/user'
import { idsOf } from '@/modules/authentication-manager-ui/utils/identity'

export function userPayload(input: UserInput) {
  const {
    orgIdList = [],
    roleIdList = [],
    positions,
    confirmPassword: _confirmation,
    orgList: _organizations,
    roleList: _roles,
    ...user
  } = input
  if (input.id) delete user.password
  return {
    ...(input.id ? { id: input.id } : {}),
    user,
    orgIdList,
    roleIdList,
    positions: idsOf(positions),
  }
}

export function userTerms(terms: QueryTerm[] = []): QueryTerm[] {
  return terms.map((term) => {
    if (term.terms) return { ...term, terms: userTerms(term.terms) }
    if (['telephone', 'email'].includes(term.column || ''))
      return { column: 'id$user-detail', value: [{ ...term }], type: term.type }
    if (['roleList', 'positions'].includes(term.column || '')) {
      const dimension = term.column === 'roleList' ? 'role' : 'position'
      return {
        column: `id$in-dimension$${dimension}${['eq', 'in'].includes(term.termType || '') ? '' : '$not'}`,
        value: term.value,
        type: term.type,
      }
    }
    if (term.column === 'type' && term.value === 'other')
      return {
        type: term.type,
        terms: [
          { column: 'type', termType: 'isnull', value: 1, type: 'or' },
          { column: 'type', termType: 'empty', value: 1, type: 'or' },
        ],
      }
    return { ...term }
  })
}

// Match the active server's account limits; complexity indicators are advisory only.
export const userFieldLimits = {
  name: 128,
  username: 64,
  telephone: 64,
  email: 255,
  passwordMin: 12,
  passwordMax: 128,
} as const

export function validPassword(value: string) {
  return (
    value.length >= userFieldLimits.passwordMin &&
    value.length <= userFieldLimits.passwordMax &&
    value.trim().length > 0
  )
}

export function validEmail(value: string) {
  return !value.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}
