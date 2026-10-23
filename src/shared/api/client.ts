import axios, { type AxiosInstance, type AxiosResponse, AxiosHeaders } from 'axios'
import { config } from '@/shared/config'
import { token } from '@/shared/auth/token'
import { i18n, t } from '@/shared/i18n'
import { ApiError, isRecord } from './errors'
import type { ApiResponse, BinaryResponse, RequestOptions } from './types'

export function normalize<T>(data: unknown, status = 200): ApiResponse<T> {
  if (isRecord(data) && ('success' in data || 'result' in data)) {
    const code = typeof data.code === 'string' ? data.code : undefined
    const message = typeof data.message === 'string' ? data.message : undefined
    const actualStatus = typeof data.status === 'number' ? data.status : status
    if (data.success === false || actualStatus >= 400)
      throw new ApiError(message || t('common.unknown'), actualStatus, code, data.details)
    return { success: true, status: actualStatus, result: data.result as T, message, code }
  }
  return { success: true, status, result: data as T }
}
let unauthorized: () => Promise<void> = async () => {}
let unauthorizedFlight: { token: string | null; promise: Promise<void> } | undefined
let notify: (error: ApiError) => void = () => {}
const shown = new Map<string, number>()
export function configureClient(callbacks: {
  onUnauthorized: () => Promise<void>
  onError: (error: ApiError) => void
}) {
  unauthorized = callbacks.onUnauthorized
  notify = callbacks.onError
}
export function resetUnauthorized() {
  unauthorizedFlight = undefined
  shown.clear()
}
function show(error: ApiError, options: RequestOptions) {
  if (options.silent || options.hiddenError || error.cancelled) return
  const now = Date.now()
  for (const [key, timestamp] of shown) if (now - timestamp > 3000) shown.delete(key)
  const key = `${error.status}:${error.code || error.message}`
  if (!shown.has(key)) {
    shown.set(key, now)
    notify(error)
  }
}
async function bodyOf(data: unknown): Promise<unknown> {
  if (data instanceof Blob) {
    try {
      return JSON.parse(
        await (typeof data.text === 'function'
          ? data.text()
          : new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = () => reject(reader.error)
              reader.readAsText(data)
            })),
      ) as unknown
    } catch {
      return undefined
    }
  }
  if (data instanceof ArrayBuffer) {
    try {
      return JSON.parse(new TextDecoder().decode(data)) as unknown
    } catch {
      return undefined
    }
  }
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown
    } catch {
      return data
    }
  }
  return data
}
export function filenameFromHeader(header?: string): string {
  const extended = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let value = header?.match(/filename="?([^";]+)"?/i)?.[1] || 'download'
  if (extended) {
    try {
      value = decodeURIComponent(extended)
    } catch {
      /* Preserve fallback for malformed server headers. */
    }
  }
  return Array.from(value, (c) => (c === '/' || c === '\\' || c.charCodeAt(0) < 32 ? '_' : c)).join(
    '',
  )
}
export function createClient(authenticated: boolean, transport?: AxiosInstance) {
  const http =
    transport ||
    axios.create({
      baseURL: config.apiBase,
      timeout: 30000,
      withCredentials: false,
      // Same-origin XHR still sends cookies; Axios fetch maps false to credentials: 'omit'.
      ...(!authenticated ? { adapter: 'fetch' } : {}),
    })
  const pending = new Map<string, AbortController>()
  const active = new Set<AbortController>()
  async function run<T>(
    method: string,
    url: string,
    data?: unknown,
    params?: unknown,
    options: RequestOptions = {},
  ): Promise<AxiosResponse<T>> {
    if (/^(?:[a-z]+:)?\/\//i.test(url)) throw new ApiError(t('common.invalid'))
    const controller = new AbortController()
    active.add(controller)
    const abort = () => controller.abort()
    options.signal?.addEventListener?.('abort', abort, { once: true })
    if (options.signal?.aborted) controller.abort()
    if (options.requestKey) {
      pending.get(options.requestKey)?.abort()
      pending.set(options.requestKey, controller)
    }
    const headers = AxiosHeaders.from(options.headers)
    const accessToken = authenticated ? token.get() : null
    headers.delete(config.tokenHeader)
    if (accessToken) headers.set(config.tokenHeader, accessToken)
    headers.set(config.languageHeader, i18n.global.locale.value === 'zh' ? 'zh-CN' : 'en-US')
    if (data instanceof FormData) headers.delete('Content-Type')
    try {
      const response = await http.request<T>({
        ...options,
        method,
        url,
        data: data === undefined ? options.data : data,
        // POST/PUT/PATCH have no separate query argument; preserve their public RequestOptions.params.
        // Explicit GET/DELETE query values, including an empty object or null, still take precedence.
        params: params === undefined ? options.params : params,
        headers,
        signal: controller.signal,
        withCredentials: false,
      })
      const payload = await bodyOf(response.data)
      if (
        isRecord(payload) &&
        (payload.success === false || (typeof payload.status === 'number' && payload.status >= 400))
      ) {
        try {
          normalize(payload, response.status)
        } catch (error) {
          if (error instanceof ApiError)
            error.requestId = String(response.headers['x-request-id'] || '') || undefined
          throw error
        }
      }
      return response
    } catch (cause) {
      let error: ApiError
      if (cause instanceof ApiError) error = cause
      else if (axios.isAxiosError(cause)) {
        const body = await bodyOf(cause.response?.data)
        const record = isRecord(body) ? body : {}
        const cancelled = axios.isCancel(cause)
        error = new ApiError(
          typeof record.message === 'string'
            ? record.message
            : t(cause.code === 'ECONNABORTED' ? 'common.timeout' : 'common.network'),
          cause.response?.status || 0,
          typeof record.code === 'string' ? record.code : cause.code,
          record.details,
          String(cause.response?.headers['x-request-id'] || '') || undefined,
          cancelled,
        )
      } else error = new ApiError(t('common.unknown'))
      // A late failure from a replaced session must not revoke the current user's credential.
      if (authenticated && error.status === 401 && accessToken === token.get()) {
        // Another tab can replace its cookie without resetting this tab's request state.
        if (!unauthorizedFlight || unauthorizedFlight.token !== accessToken)
          unauthorizedFlight = {
            token: accessToken,
            promise: Promise.resolve().then(async () => {
              // Login can finish between queuing this callback and executing it.
              if (accessToken === token.get()) await unauthorized()
            }),
          }
        await unauthorizedFlight.promise
      }
      show(error, options)
      throw error
    } finally {
      active.delete(controller)
      options.signal?.removeEventListener?.('abort', abort)
      if (options.requestKey && pending.get(options.requestKey) === controller)
        pending.delete(options.requestKey)
    }
  }
  async function request<T>(
    method: string,
    url: string,
    data?: unknown,
    params?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const response = await run<T>(method, url, data, params, options)
    if (options?.responseType === 'blob' || options?.responseType === 'arraybuffer')
      return { success: true, status: response.status, result: response.data }
    return normalize<T>(response.data, response.status)
  }
  async function binary(
    method: string,
    url: string,
    data?: unknown,
    params?: unknown,
    options?: RequestOptions,
  ): Promise<BinaryResponse> {
    const response = await run<Blob>(method, url, data, params, {
      ...options,
      responseType: 'blob',
    })
    const blob = response.data
    if (!blob.size) throw new ApiError(t('common.empty'))
    return {
      blob,
      contentType: String(response.headers['content-type'] || ''),
      filename: filenameFromHeader(String(response.headers['content-disposition'] || '')),
    }
  }
  return {
    get: <T>(url: string, params?: unknown, options?: RequestOptions) =>
      request<T>('GET', url, undefined, params, options),
    post: <T>(url: string, data?: unknown, options?: RequestOptions) =>
      request<T>('POST', url, data, undefined, options),
    put: <T>(url: string, data?: unknown, options?: RequestOptions) =>
      request<T>('PUT', url, data, undefined, options),
    patch: <T>(url: string, data?: unknown, options?: RequestOptions) =>
      request<T>('PATCH', url, data, undefined, options),
    remove: <T>(url: string, params?: unknown, options?: RequestOptions) =>
      request<T>('DELETE', url, undefined, params, options),
    execute: <T>(
      method: 'HEAD' | 'OPTIONS',
      url: string,
      params?: unknown,
      options?: RequestOptions,
    ) => request<T>(method, url, undefined, params, options),
    getStream: (url: string, params?: unknown, options?: RequestOptions) =>
      binary('GET', url, undefined, params, options),
    postStream: (url: string, data?: unknown, options?: RequestOptions) =>
      binary('POST', url, data, undefined, options),
    cancelAll: () => {
      active.forEach((controller) => controller.abort())
      active.clear()
      pending.clear()
    },
  }
}
export const request = createClient(true)
export async function download(response: BinaryResponse): Promise<void> {
  const url = URL.createObjectURL(response.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = response.filename
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}
