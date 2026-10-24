// @vitest-environment node
import { beforeEach, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from '../fixtures/mock-plugin'
import type { Project, Version } from '@/modules/protohub-manager-ui/types'

const epoch = 2_000_000_000_000
const retentionMs = 30 * 24 * 60 * 60 * 1000
const headers = { 'x-access-token': 'mock-admin' }
async function call<T = unknown>(
  url: string,
  method = 'POST',
  data?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const req = Object.assign(Readable.from(data === undefined ? [] : [JSON.stringify(data)]), {
    url,
    method,
    headers: { ...(url.startsWith('/api/prototype-hub/public/') ? {} : headers), ...extraHeaders },
  }) as IncomingMessage
  let body = ''
  const res = {
    statusCode: 200,
    setHeader() {},
    end(value: string) {
      body = value
    },
  }
  expect(await handle(req, res as unknown as ServerResponse)).toBe(true)
  return { status: res.statusCode, ...(JSON.parse(body) as { result: T; message?: string }) }
}
const clock = (value: number) => call('/__test/clock', 'POST', { now: value })
const deleted = (kind: 'projects' | 'versions', query = {}) =>
  call<{ data: (Project | Version)[]; total: number }>(
    `/api/prototype-hub/${kind}/_deleted/_query${kind === 'versions' ? '?projectId=p1' : ''}`,
    'POST',
    query,
  )

beforeEach(async () => {
  await call('/__test/reset')
  await clock(epoch)
})

it.each(['projects', 'versions'] as const)(
  'excludes expired %s before counting and paging, including the exact 30 day boundary',
  async (kind) => {
    await call('/api/prototype-hub/versions/v1', 'DELETE')
    if (kind === 'projects') await call('/api/prototype-hub/projects/p1', 'DELETE')
    await clock(epoch + retentionMs - 1)
    expect((await deleted(kind)).result.total).toBe(1)
    await clock(epoch - 1)
    expect((await deleted(kind)).result.total).toBe(1) // A future deletion is not expired.
    for (const elapsed of [retentionMs, retentionMs + 1]) {
      await clock(epoch + elapsed)
      const page = (await deleted(kind, { pageIndex: 1, pageSize: 1 })).result
      expect(page).toMatchObject({ data: [], total: 0, pageIndex: 1, pageSize: 1 })
      const restored = await call(
        `/api/prototype-hub/${kind}/${kind === 'projects' ? 'p1' : 'v1'}/_restore`,
      )
      expect(restored.status).toBe(404)
      expect(restored.message).toBe('Resource unavailable')
    }
  },
)

it('restores just before expiry without reviving old grants and keeps active resources outside the recycle bin', async () => {
  expect((await deleted('projects')).result.total).toBe(0)
  expect((await deleted('versions')).result.total).toBe(0)
  await call('/api/prototype-hub/versions/v1', 'DELETE')
  await clock(epoch + retentionMs - 1)
  expect((await call<Version>('/api/prototype-hub/versions/v1/_restore')).result.id).toBe('v1')
  await clock(epoch + retentionMs + 1)
  expect((await call('/api/prototype-hub/versions/v1', 'GET')).status).toBe(200)
  expect((await call('/api/prototype-hub/public/shares/open', 'GET')).status).toBe(404)
})

it('does not extend a child deadline when restoring its parent', async () => {
  await call('/api/prototype-hub/versions/v1', 'DELETE')
  await clock(epoch + 1)
  await call('/api/prototype-hub/projects/p1', 'DELETE')
  await clock(epoch + retentionMs)
  expect((await call('/api/prototype-hub/projects/p1/_restore')).status).toBe(200)
  expect((await call('/api/prototype-hub/versions/v1/_restore')).status).toBe(404)
  expect((await deleted('versions')).result.total).toBe(0)
})

it('keeps retained creation keys conflicting until graph purge, then permits a new identity', async () => {
  const key = { 'idempotency-key': 'retention-fixture' }
  const create = () =>
    call<Project>('/api/prototype-hub/projects', 'POST', { name: 'Receipt' }, key)
  const original = (await create()).result
  await call(`/api/prototype-hub/projects/${original.id}`, 'DELETE')
  await clock(epoch + retentionMs)
  expect((await create()).status).toBe(409) // Expiry alone does not erase the persisted receipt.
  await call('/__test/purge-expired')
  const replacement = await create()
  expect(replacement.status).toBe(200)
  expect(replacement.result.id).not.toBe(original.id)
  expect((await call(`/api/prototype-hub/projects/${original.id}/_restore`)).status).toBe(404)
})

it('retains an expired parent receipt while a younger raw child still exists', async () => {
  const key = { 'idempotency-key': 'parent-retention' }
  const create = () => call<Project>('/api/prototype-hub/projects', 'POST', { name: 'Parent' }, key)
  const parent = (await create()).result
  const child = (await call<Version>(`/api/prototype-hub/projects/${parent.id}/versions`)).result
  await clock(epoch + 1)
  await call(`/api/prototype-hub/versions/${child.id}`, 'DELETE')
  // Simulate out-of-order persisted timestamps; an expired parent cannot erase a younger child.
  await clock(epoch)
  await call(`/api/prototype-hub/projects/${parent.id}`, 'DELETE')
  await clock(epoch + retentionMs)
  await call('/__test/purge-expired')
  expect((await create()).status).toBe(409)
  expect((await call(`/api/prototype-hub/projects/${parent.id}/_restore`)).status).toBe(404)
  await clock(epoch + retentionMs + 1)
  await call('/__test/purge-expired')
  const replacement = await create()
  expect(replacement.status).toBe(200)
  expect(replacement.result.id).not.toBe(parent.id)
})
