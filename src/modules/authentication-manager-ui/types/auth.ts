export interface LoginInput {
  username: string
  password: string
  expires: number
  verifyCode?: string
  verifyKey?: string
  encryptId?: string
}

export interface LoginConfig {
  encrypt?: { enabled: boolean; publicKey: string; id: string }
}
