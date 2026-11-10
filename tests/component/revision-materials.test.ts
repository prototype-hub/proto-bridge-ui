import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { useRevisionMaterials } from '@/modules/protohub-manager-ui/hooks/useRevisionMaterials'
import { revisionMaterialsApi as api } from '@/modules/protohub-manager-ui/api/revision-material'
import type { Revision } from '@/modules/protohub-manager-ui/types'
import type { RevisionMaterial } from '@/modules/protohub-manager-ui/types/revision-material'
import { hookHarness } from '../fixtures/hook-harness'
vi.mock('@/modules/protohub-manager-ui/api/revision-material', () => ({
  revisionMaterialsApi: {
    query: vi.fn(),
    upload: vi.fn(),
    declare: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    content: vi.fn(),
  },
}))
vi.mock('ant-design-vue', () => ({ Modal: { confirm: vi.fn((options) => options.onOk()) } }))
vi.mock('@/shared/api/client', () => ({ download: vi.fn() }))
const wrappers: VueWrapper[] = []
const revision: Revision = {
  id: 'r1',
  projectId: 'p1',
  versionId: 'v1',
  versionName: 'V1',
  entryFile: 'index.html',
  fileCount: 1,
  totalBytes: 30,
  manifestSha256: 'a'.repeat(64),
  createdBy: 'u1',
  createdAt: 1,
}
const row: RevisionMaterial = {
  id: 'm1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'r1',
  materialType: 'image',
  fileName: '图稿.png',
  mediaType: 'image/png',
  fileSize: 100,
  sha256: 'a'.repeat(64),
  configVersion: 3,
  createdBy: 'u1',
  updatedBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  sourceName: '设计稿',
}
function render() {
  const scope = ref({ ...revision }),
    readable = ref(true),
    editable = ref(true)
  let state!: ReturnType<typeof useRevisionMaterials>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useRevisionMaterials(scope, readable, editable)
      }),
    ),
  )
  return { state, scope, readable, editable }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.query).mockImplementation(async (_v, _r, query) => ({
    data: query.materialType === 'prototype' ? [] : [{ ...row }],
    total: query.materialType === 'prototype' ? 0 : 1,
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
  }))
  vi.mocked(api.upload).mockResolvedValue({ ...row })
  vi.mocked(api.declare).mockResolvedValue({ ...row, id: 'r1', materialType: 'prototype' })
  vi.mocked(api.update).mockResolvedValue({ ...row, configVersion: 4 })
  vi.mocked(api.remove).mockResolvedValue(true)
  URL.createObjectURL = vi.fn(() => 'blob:material')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
it('queries one immutable revision with bounded database paging and resets paging on a type change', async () => {
  const { state } = render()
  await flushPromises()
  expect(api.query).toHaveBeenCalledWith(
    'v1',
    'r1',
    { pageIndex: 0, pageSize: 20 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  await state.page(3)
  await state.changeFilter('image')
  expect(api.query).toHaveBeenCalledWith(
    'v1',
    'r1',
    { pageIndex: 0, pageSize: 20, materialType: 'image' },
    expect.anything(),
  )
})
it('retains exact file, normalized source, key and command when an upload response is unknown', async () => {
  const { state } = render()
  await flushPromises()
  await state.openEditor('upload')
  const file = new File(['png'], '图稿.png')
  state.choose(file)
  state.form.sourceName = '  设计稿  '
  vi.mocked(api.upload).mockRejectedValueOnce(new ApiError('Response lost', 503))
  await state.save()
  expect(state.unknown.value).toBe(true)
  expect(state.file.value).toBe(file)
  expect(await state.canLeave()).toBe(false)
  state.choose(new File(['txt'], 'other.txt'))
  expect(state.file.value).toBe(file)
  const first = vi.mocked(api.upload).mock.calls[0]!
  await state.retry()
  expect(api.upload).toHaveBeenCalledTimes(2)
  expect(vi.mocked(api.upload).mock.calls[1]!.slice(0, 5)).toEqual(first.slice(0, 5))
  expect(first[3].sourceName).toBe('设计稿')
  expect(state.unknown.value).toBe(false)
  expect(state.mode.value).toBeUndefined()
})
it.each(['PROTOTYPE_HUB_MATERIAL_LIMIT_REACHED', 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT'])(
  'preserves server explanation and inputs for %s instead of a CAS message',
  async (code) => {
    const { state } = render()
    await flushPromises()
    await state.openEditor('upload')
    const file = new File(['pdf'], 'guide.pdf')
    state.choose(file)
    state.form.sourceName = 'PRD'
    vi.mocked(api.upload).mockRejectedValueOnce(
      new ApiError('Specific capacity or receipt error', 409, code),
    )
    await state.save()
    expect(state.conflict.value).toBe(false)
    expect(state.writeError.value).toBe('Specific capacity or receipt error')
    expect(state.file.value).toBe(file)
    expect(state.form.sourceName).toBe('PRD')
  },
)
it('CAS source updates retain old version and require an explicit refresh after conflict', async () => {
  const { state } = render()
  await flushPromises()
  await state.openEditor('source', { ...row })
  state.form.sourceName = 'changed'
  vi.mocked(api.update).mockRejectedValueOnce(
    new ApiError('conflict', 409, 'PROTOTYPE_HUB_MATERIAL_CONFLICT'),
  )
  await state.save()
  expect(state.conflict.value).toBe(true)
  expect(api.update).toHaveBeenCalledWith(
    'v1',
    'r1',
    'm1',
    expect.objectContaining({ sourceName: 'changed' }),
    3,
    expect.any(String),
    expect.anything(),
  )
  await state.save()
  expect(api.update).toHaveBeenCalledOnce()
  await state.refresh()
  expect(state.mode.value).toBeUndefined()
  expect(state.conflict.value).toBe(false)
})
it('creates legacy provenance without rewriting the revision or making up a source', async () => {
  const { state } = render()
  await flushPromises()
  await state.openEditor('source')
  await state.save()
  expect(api.declare).not.toHaveBeenCalled()
  state.form.sourceTool = 'Axure'
  await state.save()
  expect(api.declare).toHaveBeenCalledWith(
    'v1',
    'r1',
    expect.objectContaining({ sourceTool: 'Axure' }),
    expect.any(String),
    expect.anything(),
  )
})
it('rejects credential URLs and unsupported files before mutation', async () => {
  const { state } = render()
  await flushPromises()
  await state.openEditor('upload')
  state.choose(new File(['html'], 'unsafe.html'))
  expect(state.file.value).toBeUndefined()
  state.choose(new File(['png'], 'image.png'))
  state.form.sourceUrl = 'https://name:pass@example.com/x'
  await state.save()
  expect(api.upload).not.toHaveBeenCalled()
  expect(state.writeError.value).not.toBe('')
})
it('read-only permission hides mutation at the state boundary and revoked reads erase data and pending files', async () => {
  const { state, editable, readable } = render()
  await flushPromises()
  editable.value = false
  await state.openEditor('upload')
  expect(state.mode.value).toBeUndefined()
  await state.save()
  expect(api.upload).not.toHaveBeenCalled()
  editable.value = true
  await state.openEditor('upload')
  state.choose(new File(['x'], 'x.txt'))
  readable.value = false
  expect(state.file.value).toBeUndefined()
  expect(state.report.value).toBeUndefined()
})
it('ignores a late query from a previous fixed revision', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.query>>) => void
  vi.mocked(api.query).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { state, scope } = render()
  scope.value = { ...revision, id: 'r2' }
  vi.mocked(api.query).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  resolve({ data: [row], total: 1, pageIndex: 0, pageSize: 20 })
  await flushPromises()
  expect(state.report.value?.data.some((value) => value.revisionId === 'r1')).not.toBe(true)
})
it('only creates image Blob URLs after authenticated content reads and revokes them on departure', async () => {
  const { state } = render()
  await flushPromises()
  await state.openEditor('view', row)
  vi.mocked(api.content).mockResolvedValue({
    blob: new Blob(['png']),
    contentType: 'image/png',
    filename: '图稿.png',
  })
  await state.content(row, true)
  expect(state.previewUrl.value).toBe('blob:material')
  await state.closeEditor()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:material')
  await state.content({ ...row, materialType: 'document' }, true)
  expect(api.content).toHaveBeenCalledOnce()
})
it('erases protected data on content access rejection but retains a recoverable missing-file error', async () => {
  const { state } = render()
  await flushPromises()
  await state.openEditor('view', row)
  vi.mocked(api.content).mockRejectedValueOnce(
    new ApiError('Original missing', 404, 'PROTOTYPE_HUB_MATERIAL_FILE_MISSING'),
  )
  await state.content(row)
  expect(state.selected.value?.id).toBe('m1')
  expect(state.writeError.value).toBe('Original missing')
  vi.mocked(api.content).mockRejectedValueOnce(new ApiError('Revoked', 403))
  await state.content(row)
  expect(state.report.value).toBeUndefined()
  expect(state.selected.value).toBeUndefined()
})
it('delete uses the selected immutable material and exact CAS receipt', async () => {
  const { state } = render()
  await flushPromises()
  await state.remove(row)
  await flushPromises()
  expect(api.remove).toHaveBeenCalledWith(
    'v1',
    'r1',
    'm1',
    3,
    expect.any(String),
    expect.anything(),
  )
})
