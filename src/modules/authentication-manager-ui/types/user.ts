import type { User } from '@/shared/auth/types'

/** Server-owned user type label; requests and comparisons use value. */
export interface UserType {
  value: string
  text: string
  id?: string
}

export type UserTypeValue = UserType | string | { id: string; name?: string; text?: string }

export interface ManagedUser extends User {
  [key: string]: unknown
  type?: UserTypeValue
  typeId?: string
}

export interface UserInput {
  [key: string]: unknown
  telephone?: string
  email?: string
  orgIdList?: string[]
  positions?: { id: string }[]
  confirmPassword?: string
  id?: string
  username: string
  name: string
  password?: string
  roleIdList: string[]
}

export interface UserValidationResult {
  passed: boolean
  reason?: string
}
