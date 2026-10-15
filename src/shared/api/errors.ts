export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
    public details?: unknown,
    public requestId?: string,
    public cancelled = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
