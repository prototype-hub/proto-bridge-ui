export interface AvatarCrop {
  zoom: number
  horizontal: number
  vertical: number
}
export interface PasswordChangeInput {
  oldPassword: string
  newPassword: string
}
export interface PasswordChangeDraft extends PasswordChangeInput {
  confirmPassword: string
}
export interface PasswordValidation {
  passed: boolean
  reason?: string
}
export type PasswordChangeStep = 0 | 1 | 2
