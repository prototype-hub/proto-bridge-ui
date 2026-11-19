import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { useRevisionQuality } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisionQuality'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { createQualityOfficeReport } from '@/modules/protohub-manager-ui/views/project/utils/qualityOfficeReport'
import type { Project, Revision, RevisionQuality } from '@/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'
import { fixtureQuality } from '../fixtures/quality'

vi.mock('@/modules/protohub-manager-ui/api', () => ({
  versionsApi: { quality: vi.fn(), revision: vi.fn() },
  projectsApi: { get: vi.fn() },
}))
vi.mock('@/shared/api/client', () => ({ download: vi.fn().mockResolvedValue(undefined) }))
const identity = vi.hoisted(() => ({ credential: 'credential-u1' }))
vi.mock('@/shared/auth/token', () => ({ token: { get: () => identity.credential } }))
vi.mock('@/modules/protohub-manager-ui/views/project/utils/qualityOfficeReport', () => ({
  createQualityOfficeReport: vi.fn(),
}))
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
const project: Project = {
  id: 'p1',
  name: 'Project',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  ownerId: 'u1',
  role: 'owner',
  claimRequired: false,
  capabilities: {
    read: true,
    edit: true,
    manageMembers: true,
    deleteProject: true,
    manageShares: true,
  },
}
function setup(initiallyAllowed = true) {
  const revision = ref<Revision | undefined>({ ...selected })
  const allowed = ref(initiallyAllowed)
  const actorId = ref<string | undefined>('u1')
  let state!: ReturnType<typeof useRevisionQuality>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useRevisionQuality(revision, allowed, actorId)
      }),
    ),
  )
  return { state, revision, allowed, actorId }
}
beforeEach(() => {
  vi.clearAllMocks()
  identity.credential = 'credential-u1'
  i18n.global.locale.value = 'zh'
  vi.mocked(versionsApi.quality).mockImplementation(async (_id, rid) =>
    fixtureQuality({ ...selected, id: rid }),
  )
  vi.mocked(versionsApi.revision).mockImplementation(async (_id, rid) => ({ ...selected, id: rid }))
  vi.mocked(projectsApi.get).mockResolvedValue(project)
  vi.mocked(createQualityOfficeReport).mockImplementation(async (format) => new Blob([format]))
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
  expect(versionsApi.revision).not.toHaveBeenCalled()
  expect(projectsApi.get).not.toHaveBeenCalled()
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
  expect(versionsApi.revision).toHaveBeenCalledExactlyOnceWith('v1', 'r1', {
    signal: expect.any(AbortSignal),
    silent: true,
  })
  expect(projectsApi.get).toHaveBeenCalledExactlyOnceWith('p1', {
    signal: expect.any(AbortSignal),
    silent: true,
  })
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

it.each(['xlsx', 'docx'] as const)(
  'exports every recorded finding as %s in the selected language',
  async (format) => {
    const { state } = setup()
    await flushPromises()
    state.page(2)
    i18n.global.locale.value = 'en'
    await state.exportReport(format)
    expect(createQualityOfficeReport).toHaveBeenCalledExactlyOnceWith(
      format,
      fixtureQuality(selected),
      {
        revision: selected,
        language: 'en',
      },
    )
    expect(vi.mocked(createQualityOfficeReport).mock.calls[0]![1].findings).toHaveLength(52)
    expect(vi.mocked(download).mock.calls[0]![0].filename).toBe(`prototype-quality-v1-r1.${format}`)
    expect(versionsApi.quality).toHaveBeenCalledTimes(1)
  },
)

it('keeps the report after generation and temporary metadata failures so export can be retried', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(createQualityOfficeReport).mockRejectedValueOnce(new Error('Cannot generate'))
  await state.exportReport('xlsx')
  expect(state.data.value).toBeDefined()
  expect(state.downloadError.value).toBe('Cannot generate')
  expect(versionsApi.revision).not.toHaveBeenCalled()
  vi.mocked(versionsApi.revision).mockRejectedValueOnce(new ApiError('Temporary failure', 503))
  await state.exportReport('xlsx')
  expect(state.data.value).toBeDefined()
  expect(state.downloadError.value).toBe('Temporary failure')
  await state.exportReport('xlsx')
  expect(download).toHaveBeenCalledTimes(1)
  expect(state.downloadError.value).toBe('')
})

it.each([401, 403, 404, 409])(
  'discards sensitive report after metadata responds %s',
  async (status) => {
    const { state } = setup()
    await flushPromises()
    vi.mocked(versionsApi.revision).mockRejectedValueOnce(new ApiError('Unavailable', status))
    await state.exportReport()
    expect(state.data.value).toBeUndefined()
    expect(state.rows.value).toEqual([])
    expect(state.error.value).not.toBe('')
    expect(download).not.toHaveBeenCalled()
  },
)

it.each(['projectId', 'versionId', 'id', 'manifestSha256'] as const)(
  'rejects changed revision metadata %s before saving',
  async (key) => {
    const { state } = setup()
    await flushPromises()
    vi.mocked(versionsApi.revision).mockResolvedValueOnce({ ...selected, [key]: 'different' })
    await state.exportReport()
    expect(state.data.value).toBeUndefined()
    expect(download).not.toHaveBeenCalled()
  },
)

it.each(['wrong-project', 'no-read'] as const)(
  'rejects project metadata %s before saving',
  async (change) => {
    const { state } = setup()
    await flushPromises()
    vi.mocked(projectsApi.get).mockResolvedValueOnce({
      ...project,
      id: change === 'wrong-project' ? 'p2' : project.id,
      capabilities: { ...project.capabilities, read: change !== 'no-read' },
    })
    await state.exportReport()
    expect(state.data.value).toBeUndefined()
    expect(download).not.toHaveBeenCalled()
  },
)

it.each(['close', 'revoke', 'replace', 'actor', 'unmount'] as const)(
  'does not save a generated Office report after %s',
  async (action) => {
    const { state, revision, allowed, actorId } = setup()
    await flushPromises()
    let complete!: (value: Blob) => void
    vi.mocked(createQualityOfficeReport).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    const exporting = state.exportReport('docx')
    await flushPromises()
    expect(state.downloading.value).toBe(true)
    await state.exportReport('xlsx')
    expect(createQualityOfficeReport).toHaveBeenCalledTimes(1)
    if (action === 'close') revision.value = undefined
    if (action === 'revoke') allowed.value = false
    if (action === 'replace') revision.value = { ...selected, id: 'r2' }
    if (action === 'actor') actorId.value = 'u2'
    if (action === 'unmount') wrappers.pop()!.unmount()
    complete(new Blob(['generated']))
    await exporting
    expect(download).not.toHaveBeenCalled()
    expect(versionsApi.revision).not.toHaveBeenCalled()
  },
)

it('rejects a changed credential before export and after asynchronous authorization', async () => {
  const { state } = setup()
  await flushPromises()
  identity.credential = 'credential-u2'
  await state.exportReport()
  expect(state.data.value).toBeUndefined()
  expect(versionsApi.revision).not.toHaveBeenCalled()
  await state.load()
  let authorize!: (value: Revision) => void
  vi.mocked(versionsApi.revision).mockReturnValueOnce(
    new Promise((resolve) => {
      authorize = resolve
    }),
  )
  const exporting = state.exportReport()
  await flushPromises()
  identity.credential = 'credential-u3'
  authorize(selected)
  await exporting
  expect(state.data.value).toBeUndefined()
  expect(download).not.toHaveBeenCalled()
})

it('aborts pending export authorization on close and refuses its late response', async () => {
  const { state, revision } = setup()
  await flushPromises()
  let authorize!: (value: Revision) => void
  vi.mocked(versionsApi.revision).mockReturnValueOnce(
    new Promise((resolve) => {
      authorize = resolve
    }),
  )
  const exporting = state.exportReport()
  const signal = vi.mocked(versionsApi.revision).mock.calls[0]![2]!.signal as AbortSignal
  revision.value = undefined
  expect(signal.aborted).toBe(true)
  authorize(selected)
  await exporting
  expect(download).not.toHaveBeenCalled()
})

it('clears an old identity report even when its pending authorization fails temporarily', async () => {
  const { state } = setup()
  await flushPromises()
  let fail!: (cause: Error) => void
  vi.mocked(versionsApi.revision).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject
    }),
  )
  const exporting = state.exportReport()
  identity.credential = 'replacement-credential'
  fail(new ApiError('Temporary failure', 503))
  await exporting
  expect(state.data.value).toBeUndefined()
  expect(state.error.value).not.toBe('')
  expect(download).not.toHaveBeenCalled()
})
