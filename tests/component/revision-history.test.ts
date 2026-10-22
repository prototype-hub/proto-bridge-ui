import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { useRevisions } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisions'
import type { Revision, Version } from '@/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const wrappers: VueWrapper[] = []
const selected: Version = {
  id: 'v1',
  projectId: 'p1',
  versionName: 'V1',
  entryFile: 'index.html',
  status: 'ready',
  createdBy: 'u1',
  createdAt: 1,
  runtimeBaseUrl: null,
  previewUrl: null,
  currentRevisionId: 'r1',
  revisionId: 'r1',
  revisionCount: 51,
  migrationRequired: false,
}
function revision(id: string): Revision {
  return {
    id,
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 3,
    totalBytes: 100,
    createdBy: 'u1',
    createdAt: 1,
  }
}
const response = (result: Revision[]) => ({ success: true, status: 200, result })
function render() {
  const version = ref<Version | undefined>({ ...selected })
  const open = ref(true)
  let state!: ReturnType<typeof useRevisions>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useRevisions(version, open)
      }),
    ),
  )
  return { state, version, open }
}
beforeEach(() => vi.mocked(request.get).mockReset().mockResolvedValue(response([])))
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

it('loads history with a bounded cursor and preserves earlier rows when loading more', async () => {
  const first = Array.from({ length: 50 }, (_, index) => revision(`r${50 - index}`))
  vi.mocked(request.get)
    .mockResolvedValueOnce(response(first))
    .mockResolvedValueOnce(response([revision('old')]))
  const { state } = render()
  await flushPromises()
  expect(state.hasMore.value).toBe(true)
  await state.load(true)
  expect(request.get).toHaveBeenLastCalledWith(
    '/prototype-hub/versions/v1/revisions',
    { after: 'r1', limit: 50 },
    expect.objectContaining({ signal: expect.any(AbortSignal), silent: true }),
  )
  expect(state.rows.value.map((row) => row.id)).toEqual([...first.map((row) => row.id), 'old'])
  expect(state.hasMore.value).toBe(false)
})

it('aborts and discards a late history response after closing', async () => {
  let resolve!: (value: ReturnType<typeof response>) => void
  vi.mocked(request.get).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { state, open } = render()
  const signal = vi.mocked(request.get).mock.calls[0]![2]!.signal as AbortSignal
  open.value = false
  expect(signal.aborted).toBe(true)
  resolve(response([revision('old')]))
  await flushPromises()
  expect(state.rows.value).toEqual([])
})

it('clears visible history on access rejection and rejects another version’s rows', async () => {
  vi.mocked(request.get).mockResolvedValueOnce(response([revision('r1')]))
  const { state } = render()
  await flushPromises()
  vi.mocked(request.get).mockRejectedValueOnce(new ApiError('Denied', 403))
  await state.load()
  expect(state.rows.value).toEqual([])
  expect(state.error.value).toBe('Denied')
  vi.mocked(request.get).mockResolvedValueOnce(
    response([{ ...revision('wrong'), versionId: 'v2' }]),
  )
  await state.load()
  expect(state.rows.value).toEqual([])
  expect(state.error.value).not.toBe('')
})
