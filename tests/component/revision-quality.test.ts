import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { useRevisionQuality } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisionQuality'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import type { Revision, RevisionQuality } from '@/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'
import { fixtureQuality } from '../fixtures/quality'

vi.mock('@/modules/protohub-manager-ui/api', () => ({ versionsApi: { quality: vi.fn() } }))
vi.mock('@/shared/api/client', () => ({ download: vi.fn().mockResolvedValue(undefined) }))
const wrappers: VueWrapper[] = []
const selected: Revision = {
  id: 'r1',
  versionId: 'v1',
  projectId: 'p1',
  versionName: 'V1',
  entryFile: 'index.html',
  manifestSha256: 'a'.repeat(64),
  fileCount: 3,
  totalBytes: 100,
  createdBy: 'u1',
  createdAt: 1,
}
function setup(initiallyAllowed = true) {
  const revision = ref<Revision | undefined>({ ...selected })
  const allowed = ref(initiallyAllowed)
  let state!: ReturnType<typeof useRevisionQuality>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useRevisionQuality(revision, allowed)
      }),
    ),
  )
  return { state, revision, allowed }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(versionsApi.quality).mockImplementation(async (_id, rid) =>
    fixtureQuality({ ...selected, id: rid }),
  )
  vi.mocked(download).mockResolvedValue(undefined)
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

it('loads a fixed report once and paginates all retained findings locally', async () => {
  const { state } = setup()
  await flushPromises()
  expect(versionsApi.quality).toHaveBeenCalledExactlyOnceWith('v1', 'r1', {
    signal: expect.any(AbortSignal),
    silent: true,
  })
  expect(state.rows.value).toHaveLength(50)
  expect(state.pagination.value.total).toBe(52)
  state.page(2)
  expect(state.rows.value).toHaveLength(2)
  expect(state.rows.value[1]?.targetPath).toBe('images/missing-50.png')
  expect(versionsApi.quality).toHaveBeenCalledTimes(1)
})
it('exports exactly the loaded report including omitted findings without rescanning', async () => {
  const report = fixtureQuality(selected)
  report.complete = false
  report.summary.omittedFindings = 7
  report.summary.findingsTotal += 7
  vi.mocked(versionsApi.quality).mockResolvedValueOnce(report)
  const { state } = setup()
  await flushPromises()
  await state.exportReport()
  const exported = vi.mocked(download).mock.calls[0]![0]
  expect(exported.filename).toBe('prototype-quality-v1-r1.json')
  expect(exported.blob.type).toBe('application/json')
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(exported.blob)
  })
  expect(JSON.parse(content)).toEqual(report)
  expect(versionsApi.quality).toHaveBeenCalledTimes(1)
})
it('keeps an empty checked report and surfaces scan and download failures with retry', async () => {
  const empty = fixtureQuality(selected)
  empty.findings = []
  empty.summary.errors = empty.summary.warnings = empty.summary.findingsTotal = 0
  vi.mocked(versionsApi.quality)
    .mockRejectedValueOnce(new ApiError('Denied', 403))
    .mockResolvedValueOnce(empty)
  const { state } = setup()
  await flushPromises()
  expect(state.data.value).toBeUndefined()
  expect(state.error.value).toBe('Denied')
  await state.load()
  expect(state.data.value).toEqual(empty)
  expect(state.rows.value).toEqual([])
  vi.mocked(download).mockRejectedValueOnce(new Error('Save failed'))
  await state.exportReport()
  expect(state.downloadError.value).toBe('Save failed')
  await state.exportReport()
  expect(state.downloadError.value).toBe('')
})
it.each(['versionId', 'revisionId', 'manifestSha256'] as const)(
  'rejects mismatched %s without exposing the report',
  async (key) => {
    vi.mocked(versionsApi.quality).mockResolvedValueOnce({
      ...fixtureQuality(selected),
      [key]: 'wrong',
    })
    const { state } = setup()
    await flushPromises()
    expect(state.data.value).toBeUndefined()
    expect(state.error.value).not.toBe('')
    await state.exportReport()
    expect(download).not.toHaveBeenCalled()
  },
)
it('does not request a report without read permission', async () => {
  const { state } = setup(false)
  await flushPromises()
  await state.load()
  await state.exportReport()
  expect(versionsApi.quality).not.toHaveBeenCalled()
  expect(download).not.toHaveBeenCalled()
})
it.each(['close', 'revoke', 'replace', 'unmount'])(
  'aborts and discards late results on %s',
  async (action) => {
    let resolve!: (value: RevisionQuality) => void
    vi.mocked(versionsApi.quality).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { state, revision, allowed } = setup()
    const signal = vi.mocked(versionsApi.quality).mock.calls[0]![2]!.signal as AbortSignal
    if (action === 'close') revision.value = undefined
    if (action === 'revoke') allowed.value = false
    if (action === 'replace') revision.value = { ...selected, id: 'r2' }
    if (action === 'unmount') wrappers.pop()!.unmount()
    expect(signal.aborted).toBe(true)
    resolve(fixtureQuality(selected))
    await flushPromises()
    expect(state.data.value?.revisionId).toBe(action === 'replace' ? 'r2' : undefined)
  },
)
it('clears previously loaded findings before a denied refresh', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(versionsApi.quality).mockRejectedValueOnce(new ApiError('Denied', 403))
  const refreshing = state.load()
  expect(state.data.value).toBeUndefined()
  await refreshing
  expect(state.rows.value).toEqual([])
  expect(state.error.value).toBe('Denied')
})
