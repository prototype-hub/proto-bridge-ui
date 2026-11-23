import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { diagnosticsApi } from '@/modules/protohub-manager-ui/api/diagnostics'
import { useDiagnostics } from '@/modules/protohub-manager-ui/views/diagnostics/hooks/useDiagnostics'
import { fixtureDiagnostics } from '../fixtures/diagnostics'
import { hookHarness } from '../fixtures/hook-harness'
import type { DiagnosticSnapshot } from '@/modules/protohub-manager-ui/types/diagnostics'

vi.mock('@/modules/protohub-manager-ui/api/diagnostics', () => ({
  diagnosticsApi: { get: vi.fn() },
}))
vi.mock('@/shared/api/client', async (original) => ({
  ...(await original<object>()),
  download: vi.fn().mockResolvedValue(undefined),
}))
import { download } from '@/shared/api/client'
const mounts: VueWrapper[] = []
beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  useSession().user = { id: 'admin', username: 'admin', name: 'Admin' }
  useSession().permissions = new Set(['prototype-hub-diagnostics:query'])
  vi.mocked(diagnosticsApi.get).mockResolvedValue(fixtureDiagnostics())
})
afterEach(() => mounts.splice(0).forEach((wrapper) => wrapper.unmount()))
async function state() {
  let result!: ReturnType<typeof useDiagnostics>
  mounts.push(mount(hookHarness(() => (result = useDiagnostics()))))
  await flushPromises()
  return result
}
it('does not request or export diagnostics without the independent query action', async () => {
  useSession().permissions.clear()
  const s = await state()
  await s.load()
  await s.exportSnapshot()
  expect(diagnosticsApi.get).not.toHaveBeenCalled()
  expect(download).not.toHaveBeenCalled()
})
it('retains the last successful snapshot on transient failure and exports it without a new request', async () => {
  const s = await state()
  const previous = s.data.value
  vi.mocked(diagnosticsApi.get).mockRejectedValueOnce(
    new Error('secret exception must not reach UI'),
  )
  await s.load()
  expect(s.data.value).toBe(previous)
  expect(s.failed.value).toBe(true)
  expect(s.stale.value).toBe(true)
  await s.exportSnapshot()
  expect(diagnosticsApi.get).toHaveBeenCalledTimes(2)
  expect(download).toHaveBeenCalledTimes(1)
})
it('disables export after an unsupported response until a successful refresh', async () => {
  const s = await state()
  vi.mocked(diagnosticsApi.get).mockRejectedValueOnce(new Error('DIAGNOSTIC_SCHEMA_INVALID'))
  await s.load()
  await s.exportSnapshot()
  expect(s.schemaInvalid.value).toBe(true)
  expect(download).not.toHaveBeenCalled()
  vi.mocked(diagnosticsApi.get).mockRejectedValueOnce(new Error('connection failed'))
  await s.load()
  await s.exportSnapshot()
  expect(s.schemaInvalid.value).toBe(true)
  expect(download).not.toHaveBeenCalled()
  await s.load()
  expect(s.schemaInvalid.value).toBe(false)
})
it('clears data on server denial and on identity or action changes, discarding late responses', async () => {
  const s = await state()
  let resolve!: (value: DiagnosticSnapshot) => void
  vi.mocked(diagnosticsApi.get).mockReturnValueOnce(new Promise((done) => (resolve = done)))
  const pending = s.load()
  useSession().permissions = new Set()
  await flushPromises()
  resolve(fixtureDiagnostics())
  await pending
  expect(s.data.value).toBeUndefined()
  useSession().permissions = new Set(['prototype-hub-diagnostics:query'])
  await flushPromises()
  expect(s.data.value).toBeDefined()
  vi.mocked(diagnosticsApi.get).mockRejectedValueOnce(new ApiError('denied', 403))
  await s.load()
  expect(s.data.value).toBeUndefined()
  expect(s.denied.value).toBe(true)
})
it('discards an earlier refresh even when its transport ignores abort', async () => {
  const s = await state()
  let resolve!: (value: DiagnosticSnapshot) => void
  vi.mocked(diagnosticsApi.get).mockReturnValueOnce(new Promise((done) => (resolve = done)))
  const pending = s.load()
  const newest = fixtureDiagnostics()
  newest.collectedAt += 1000
  vi.mocked(diagnosticsApi.get).mockResolvedValueOnce(newest)
  await s.load()
  resolve(fixtureDiagnostics())
  await pending
  expect(s.data.value).toBe(newest)
})

it('invalidates the snapshot when observed roles change on the same account and permissions', async () => {
  const session = useSession()
  session.user = { ...session.user!, roleList: [{ id: 'ADMIN', name: 'Admin' }] }
  const s = await state()
  let resolve!: (value: DiagnosticSnapshot) => void
  vi.mocked(diagnosticsApi.get).mockReturnValueOnce(new Promise((done) => (resolve = done)))
  const pending = s.load()
  vi.mocked(diagnosticsApi.get).mockRejectedValueOnce(new ApiError('denied', 403))
  session.user = { ...session.user!, roleList: [] }
  await flushPromises()
  resolve(fixtureDiagnostics())
  await pending
  expect(s.data.value).toBeUndefined()
  expect(s.denied.value).toBe(true)
})
