import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import {
  createClient,
  configureClient,
  normalize,
  resetUnauthorized,
  filenameFromHeader,
} from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { token } from '@/shared/auth/token'
const adapter =
  (status: number, data: unknown): AxiosAdapter =>
  async (config) => {
    const response = {
      config,
      status,
      statusText: String(status),
      headers: { 'x-request-id': 'r-1' },
      data,
    }
    if (status >= 400)
      throw new AxiosError('HTTP failure', 'ERR_BAD_RESPONSE', config, undefined, response)
    return response
  }
beforeEach(() => {
  localStorage.clear()
  resetUnauthorized()
})
describe('request boundary', () => {
  it('normalizes wrapped and unwrapped success without touching binary content', async () => {
    expect(normalize({ result: [1] }, 200).result).toEqual([1])
    expect(normalize([1], 200).success).toBe(true)
    expect(() =>
      normalize({ success: false, status: 409, code: 'CONFLICT', message: 'Conflict' }),
    ).toThrow(ApiError)
    const raw = new ArrayBuffer(8)
    const client = createClient(true, axios.create({ adapter: adapter(200, raw) }))
    expect((await client.get('/binary', undefined, { responseType: 'arraybuffer' })).result).toBe(
      raw,
    )
  })
  it.each([400, 401, 403, 404, 409, 500])(
    'preserves status and request ID for HTTP %s',
    async (status) => {
      configureClient({ onUnauthorized: async () => {}, onError: () => {} })
      const client = createClient(
        true,
        axios.create({
          adapter: adapter(status, {
            code: 'ERROR',
            message: 'Readable',
            details: { reason: 'test' },
          }),
        }),
      )
      await expect(client.get('/failure')).rejects.toMatchObject({
        status,
        code: 'ERROR',
        requestId: 'r-1',
        details: { reason: 'test' },
      })
    },
  )
  it('runs one session expiration action for concurrent 401 failures', async () => {
    const expired = vi.fn(async () => {})
    configureClient({ onUnauthorized: expired, onError: () => {} })
    const client = createClient(true, axios.create({ adapter: adapter(401, {}) }))
    await Promise.allSettled([client.get('/a'), client.get('/b'), client.get('/c')])
    expect(expired).toHaveBeenCalledTimes(1)
  })
  it('deduplicates error notifications and honors silent / hiddenError', async () => {
    const notify = vi.fn()
    configureClient({ onUnauthorized: async () => {}, onError: notify })
    const client = createClient(
      true,
      axios.create({ adapter: adapter(500, { message: 'Failure' }) }),
    )
    await Promise.allSettled([
      client.get('/a'),
      client.get('/b'),
      client.get('/c', undefined, { silent: true }),
      client.get('/d', undefined, { hiddenError: true }),
    ])
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('public requests remove management credentials and never expire the management session', async () => {
    token.set('management-token')
    const expired = vi.fn()
    configureClient({ onUnauthorized: expired, onError: () => {} })
    let captured: AxiosHeaders | undefined
    const client = createClient(
      false,
      axios.create({
        adapter: async (config) => {
          captured = AxiosHeaders.from(config.headers)
          return adapter(401, {})(config)
        },
      }),
    )
    await expect(
      client.get('/public', undefined, { headers: { 'X-Access-Token': 'injected' } }),
    ).rejects.toThrow()
    expect(captured?.has('X-Access-Token')).toBe(false)
    expect(expired).not.toHaveBeenCalled()
  })
  it('keeps multipart boundaries automatic and honors upload timeout', async () => {
    let captured: AxiosHeaders | undefined
    let timeout: number | undefined
    const client = createClient(
      true,
      axios.create({
        adapter: async (config) => {
          captured = AxiosHeaders.from(config.headers)
          timeout = config.timeout
          return adapter(200, { result: true })(config)
        },
      }),
    )
    await client.post('/upload', new FormData(), {
      timeout: 1800000,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    expect(captured?.get('Content-Type')).not.toBe('multipart/form-data')
    expect(timeout).toBe(1800000)
  })
  it('reports timeout and offline errors and suppresses cancelled requests', async () => {
    const notify = vi.fn()
    configureClient({ onUnauthorized: async () => {}, onError: notify })
    for (const code of ['ECONNABORTED', 'ERR_NETWORK']) {
      const client = createClient(
        true,
        axios.create({
          adapter: async (config) => {
            throw new AxiosError('failed', code, config)
          },
        }),
      )
      await expect(client.get('/fail')).rejects.toMatchObject({ code, status: 0 })
    }
    const client = createClient(true, axios.create({ adapter: adapter(200, {}) }))
    const controller = new AbortController()
    controller.abort()
    await expect(
      client.get('/abort', undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ cancelled: true })
    expect(notify).toHaveBeenCalledTimes(2)
  })
  it('rejects JSON errors in binary downloads, empty files and unsafe request origins', async () => {
    const client = createClient(
      false,
      axios.create({
        adapter: adapter(
          200,
          new Blob([JSON.stringify({ success: false, status: 403, message: 'Denied' })], {
            type: 'application/json',
          }),
        ),
      }),
    )
    await expect(client.getStream('/file')).rejects.toMatchObject({ status: 403 })
    const empty = createClient(false, axios.create({ adapter: adapter(200, new Blob([])) }))
    await expect(empty.getStream('/file')).rejects.toThrow(ApiError)
    await expect(client.get('https://external.example/a')).rejects.toThrow(ApiError)
    expect(filenameFromHeader("attachment; filename*=UTF-8''hello%20world.zip")).toBe(
      'hello world.zip',
    )
  })
})
it('cancels every active authenticated request when the session is cleared', async () => {
  let started: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const client = createClient(
    true,
    axios.create({
      adapter: async (config) =>
        new Promise((_resolve, reject) => {
          config.signal?.addEventListener?.(
            'abort',
            () => reject(new axios.CanceledError('cancelled')),
            { once: true },
          )
          started()
        }),
    }),
  )
  const result = client.get('/pending-without-key')
  await ready
  client.cancelAll()
  await expect(result).rejects.toMatchObject({ cancelled: true })
})

it('keeps DELETE JSON bodies supplied through legacy request options', async () => {
  const capture = vi.fn(async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: true, result: true },
  }))
  const client = createClient(true, axios.create({ adapter: capture }))
  await client.remove('/operations', {}, { data: ['op1'] })
  expect(JSON.parse(capture.mock.calls[0][0].data as string)).toEqual(['op1'])
})
