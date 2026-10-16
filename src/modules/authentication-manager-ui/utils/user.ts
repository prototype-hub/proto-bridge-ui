import type { QueryTerm } from '@/shared/api/types'
import type { UserInput, UserType } from '@/modules/authentication-manager-ui/types/user'
import { idsOf } from '@/modules/authentication-manager-ui/utils/identity'
import {
  displayValue,
  isRecord,
  stringValue,
} from '@/modules/authentication-manager-ui/utils/model'

/** Keep released string and id/name responses compatible at the user-type boundary. */
export function normalizeUserType(input: unknown): UserType | undefined {
  if (typeof input === 'string') return input ? { value: input, text: input } : undefined
  if (!isRecord(input)) return undefined
  const value = stringValue(input.value ?? input.id)
  if (!value) return undefined
  return {
    value,
    text: displayValue(input.text || input.name || value),
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
  }
}

/** A row's server label takes precedence; only legacy identifiers need an option lookup. */
export function userTypeText(input: unknown, types: UserType[], typeId?: unknown): string {
  const type = normalizeUserType(input) ?? normalizeUserType(typeId)
  if (!type) return ''
  if (isRecord(input) && (input.text || input.name)) return type.text
  return types.find((item) => item.value === type.value)?.text || type.text
}

export function userPayload(input: UserInput) {
  const {
    orgIdList = [],
    roleIdList = [],
    positions,
    confirmPassword: _confirmation,
    orgList: _organizations,
    roleList: _roles,
    // User types are server-managed; detail display fields are not writable account input.
    type: _type,
    typeId: _typeId,
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
