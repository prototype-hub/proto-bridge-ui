export interface AccessLog {
  id: string
  userId?: string
  username?: string
  url: string
  httpMethod?: string
  method?: string
  requestTime?: number
  responseTime?: number
  state?: string
  [key: string]: unknown
}
