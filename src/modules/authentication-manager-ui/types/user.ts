import type { User } from '@/shared/auth/types'

export interface ManagedUser extends User {
  [key: string]: unknown
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
