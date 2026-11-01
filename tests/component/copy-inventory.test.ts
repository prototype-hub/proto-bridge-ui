import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { copyInventoryApi } from '@/modules/protohub-manager-ui/api/copy-inventory'
import { versionsApi } from '@/modules/protohub-manager-ui/api/version'
import {
  useCopyInventory,
  type CopyInventoryScope,
} from '@/modules/protohub-manager-ui/hooks/useCopyInventory'
import type {
  CopyInventoryEntry,
  CopyInventorySnapshot,
} from '@/modules/protohub-manager-ui/types/copy-inventory'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ownerProjectAccess } from '../fixtures/project-access'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/modules/protohub-manager-ui/api/copy-inventory', () => ({
  copyInventoryApi: {
    query: vi.fn(),
    extract: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    export: vi.fn(),
  },
}))
vi.mock('@/modules/protohub-manager-ui/api/version', () => ({
  versionsApi: { revisionPages: vi.fn() },
}))
vi.mock('@/shared/api/client', () => ({ download: vi.fn() }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const wrappers: VueWrapper[] = []
const source: CopyInventoryScope = {
  actorId: 'u1',
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
  revision: {
    id: 'fixed',
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 2,
    totalBytes: 200,
    createdBy: 'u1',
    createdAt: 1,
  },
}
const snapshot: CopyInventorySnapshot = {
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed',
  pageId: 'home',
  pagePath: 'index.html',
  manifestSha256: 'a'.repeat(64),
  fileSha256: 'b'.repeat(64),
  snapshotId: 'snap',
  extractorVersion: 1,
  extractionState: 'READY',
  limitReason: null,
  staticComplete: true,
  dynamicTextGap: true,
  staticCount: 1,
  manualCount: 0,
  configVersion: 7,
  extractedAt: 1,
}
const row: CopyInventoryEntry = {
  id: 'source',
  kind: 'STATIC',
  text: '<script>literal only</script>',
  businessTerm: '',
  note: '',
  requirementUrl: '',
  occurrenceCount: 2,
  occurrences: [
    { ordinal: 1, sourceKind: 'TEXT' },
    { ordinal: 2, sourceKind: 'ALT' },
  ],
  configVersion: 3,
  createdAt: 1,
  updatedAt: 1,
}
const target = { versionId: 'v1', revisionId: 'fixed', pageId: 'home' }
const result = (context = snapshot, data = [row], pageIndex = 0, total = data.length) => ({
  snapshot: context,
  data,
  total,
  pageIndex,
  pageSize: 20,
})
async function render(can = () => true, value = structuredClone(source)) {
  const current = ref<CopyInventoryScope | undefined>(value)
  let state!: ReturnType<typeof useCopyInventory>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useCopyInventory(current)
      }),
      { global: { provide: { [permissionKey]: { can } } } },
    ),
  )
  await flushPromises()
  return { current, state }
}
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.mocked(versionsApi.revisionPages).mockResolvedValue([
    { name: 'Home', path: 'index.html', pageId: 'home' },
    { name: 'Child', path: 'child.html', pageId: 'child' },
  ])
  vi.mocked(copyInventoryApi.query).mockResolvedValue(result())
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
it('loads the exact immutable revision/page and sends literal filters with database paging', async () => {
  const { state } = await render()
  expect(state.snapshot.value?.configVersion).toBe(7)
  expect(versionsApi.revisionPages).toHaveBeenCalledWith('v1', 'fixed', expect.anything())
  state.filters.keyword = '  100%_\\text  '
  state.filters.kind = 'MANUAL'
  state.filters.requirement = 'no'
  state.query()
  await flushPromises()
  expect(copyInventoryApi.query).toHaveBeenLastCalledWith(
    target,
    { keyword: '100%_\\text', kind: 'MANUAL', hasRequirement: false, pageIndex: 0, pageSize: 20 },
    expect.anything(),
  )
  vi.mocked(copyInventoryApi.query).mockResolvedValue(result(snapshot, [], 3, 42))
  state.paginate(4)
  await flushPromises()
  expect(state.pageIndex.value).toBe(3)
  expect(state.result.value?.data).toEqual([])
  expect(state.result.value?.total).toBe(42)
})
it('maintains STATIC metadata without sending source text or occurrence changes', async () => {
  const { state } = await render()
  vi.mocked(copyInventoryApi.update).mockResolvedValue({
    inventoryVersion: 8,
    entry: { ...row, configVersion: 4 },
  })
  state.edit(row)
  state.form.text = 'attempted source mutation'
  state.form.businessTerm = '业务词汇'
  state.form.note = '<img onerror=alert(1)>'
  state.save()
  await flushPromises()
  expect(copyInventoryApi.update).toHaveBeenCalledWith(
    target,
    'source',
    {
      expectedVersion: 3,
      businessTerm: '业务词汇',
      note: '<img onerror=alert(1)>',
      requirementUrl: '',
      clientRequestId: expect.any(String),
    },
    expect.anything(),
  )
  state.remove(row)
  expect(copyInventoryApi.remove).not.toHaveBeenCalled()
})
it.each([
  'javascript:alert(1)',
  'https://user:pass@example.com/path',
  'https://example.com:99999',
  'https://example.com/\npath',
])('rejects unsafe requirement URL %s before a write', async (url) => {
  const { state } = await render()
  state.edit()
  state.form.text = 'Dynamic copy'
  state.form.requirementUrl = url
  state.save()
  expect(state.invalid.requirementUrl).toBeTruthy()
  expect(copyInventoryApi.create).not.toHaveBeenCalled()
})
it('validates manual text, terms and notes while preserving the draft', async () => {
  const { state } = await render()
  state.edit()
  state.form.text = ' '
  state.form.businessTerm = 'a'.repeat(201)
  state.form.note = 'a'.repeat(2001)
  state.save()
  expect(state.invalid.text).toBeTruthy()
  expect(state.invalid.businessTerm).toBeTruthy()
  expect(state.invalid.note).toBeTruthy()
  expect(state.editing.value).toBe(true)
})
it('clears only a changed field error and validates its latest value again on submit', async () => {
  const { state } = await render()
  state.edit()
  state.form.requirementUrl = 'javascript:alert(1)'
  state.save()
  expect(state.invalid.text).toBeTruthy()
  expect(state.invalid.requirementUrl).toBeTruthy()
  state.form.requirementUrl = 'https://example.com/tasks/copy'
  expect(state.invalid.requirementUrl).toBe('')
  expect(state.invalid.text).toBeTruthy()
  state.form.text = 'Dynamic copy'
  expect(state.invalid.text).toBe('')
  state.form.requirementUrl = 'javascript:alert(2)'
  state.save()
  expect(state.invalid.requirementUrl).toBeTruthy()
  expect(copyInventoryApi.create).not.toHaveBeenCalled()
  expect(state.form.text).toBe('Dynamic copy')
})
it('keeps unknown input and exact request identity through refresh and manual retry', async () => {
  const { state } = await render()
  vi.mocked(copyInventoryApi.create)
    .mockRejectedValueOnce(new ApiError('response lost', 503))
    .mockResolvedValueOnce({ inventoryVersion: 8, entry: { ...row, id: 'manual', kind: 'MANUAL' } })
  state.edit()
  state.form.text = 'Dynamic copy'
  state.save()
  await flushPromises()
  const first = vi.mocked(copyInventoryApi.create).mock.calls[0]![1]
  expect(state.unknown.value).toBe(true)
  expect(state.form.text).toBe('Dynamic copy')
  await state.load()
  expect(state.unknown.value).toBe(true)
  state.save()
  expect(copyInventoryApi.create).toHaveBeenCalledTimes(1)
  state.retry()
  await flushPromises()
  expect(vi.mocked(copyInventoryApi.create).mock.calls[1]![1]).toBe(first)
  expect(state.unknown.value).toBe(false)
  expect(state.editing.value).toBe(false)
})
it('CAS conflict preserves draft and never rebases or resubmits automatically', async () => {
  const { state } = await render()
  vi.mocked(copyInventoryApi.update).mockRejectedValue(new ApiError('stale entry', 409))
  state.edit(row)
  state.form.businessTerm = 'Local draft'
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  expect(state.form.businessTerm).toBe('Local draft')
  await state.load()
  state.save()
  state.retry()
  expect(copyInventoryApi.update).toHaveBeenCalledTimes(1)
  expect(state.original.value?.configVersion).toBe(3)
})
it.each(['EMPTY', 'LIMIT_EXCEEDED'] as const)(
  'allows manual additions after %s extraction',
  async (extractionState) => {
    vi.mocked(copyInventoryApi.query).mockResolvedValue(
      result(
        {
          ...snapshot,
          extractionState,
          staticCount: 0,
          staticComplete: extractionState === 'EMPTY',
          limitReason: extractionState === 'LIMIT_EXCEEDED' ? 'SOURCE_BYTES' : null,
        },
        [],
      ),
    )
    const { state } = await render()
    state.edit()
    expect(state.editing.value).toBe(true)
  },
)
it('an extraction limit response loads persisted outcome rather than retrying or claiming success', async () => {
  vi.mocked(copyInventoryApi.query)
    .mockResolvedValueOnce(
      result(
        {
          ...snapshot,
          snapshotId: null,
          configVersion: null,
          extractionState: 'NOT_EXTRACTED',
          staticCount: 0,
        },
        [],
      ),
    )
    .mockResolvedValue(
      result(
        {
          ...snapshot,
          extractionState: 'LIMIT_EXCEEDED',
          staticCount: 0,
          staticComplete: false,
          limitReason: 'SOURCE_BYTES',
        },
        [],
      ),
    )
  vi.mocked(copyInventoryApi.extract).mockRejectedValue(new ApiError('limit', 422))
  const { state } = await render()
  state.edit()
  expect(state.editing.value).toBe(false)
  state.extract()
  await flushPromises()
  expect(state.snapshot.value?.extractionState).toBe('LIMIT_EXCEEDED')
  expect(copyInventoryApi.extract).toHaveBeenCalledTimes(1)
  expect(state.unknown.value).toBe(false)
})
it('exports the entire fixed page with its inventory version and no filters or pagination', async () => {
  const { state } = await render()
  const file = {
    blob: new Blob(['full inventory']),
    filename: 'copy.json',
    contentType: 'application/json',
  }
  vi.mocked(copyInventoryApi.export).mockResolvedValue(file)
  state.filters.keyword = 'filtered'
  state.query()
  await flushPromises()
  await state.exportInventory('json')
  expect(copyInventoryApi.export).toHaveBeenCalledWith(
    target,
    { format: 'json', expectedVersion: 7 },
    expect.anything(),
  )
  expect(download).toHaveBeenCalledWith(file)
  vi.mocked(copyInventoryApi.export).mockRejectedValue(new ApiError('changed', 409))
  await state.exportInventory('csv')
  expect(state.exportError.value).toBe(protoLocales.zh.copyExportConflict)
})
it('rejects a mismatched response identity and clears sensitive results', async () => {
  vi.mocked(copyInventoryApi.query).mockResolvedValue(
    result({ ...snapshot, pageId: 'foreign-page' }),
  )
  const { state } = await render()
  expect(state.result.value).toBeUndefined()
  expect(state.error.value).toBe(protoLocales.zh.copyUnavailable)
})
it('read-only members can query/export but cannot extract or mutate', async () => {
  const { state } = await render(() => true, {
    ...structuredClone(source),
    project: {
      ...source.project,
      role: 'viewer',
      capabilities: { ...source.project.capabilities!, edit: false },
    },
  })
  expect(state.canEdit.value).toBe(false)
  state.edit(row)
  state.extract()
  state.remove({ ...row, kind: 'MANUAL' })
  expect(copyInventoryApi.update).not.toHaveBeenCalled()
  expect(copyInventoryApi.extract).not.toHaveBeenCalled()
  expect(copyInventoryApi.remove).not.toHaveBeenCalled()
})
it('scope changes reject late writes and never migrate the draft to another page', async () => {
  const { state, current } = await render()
  let resolve!: (value: { inventoryVersion: number; entry: CopyInventoryEntry }) => void
  vi.mocked(copyInventoryApi.create).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  state.edit()
  state.form.text = 'Private draft'
  state.save()
  current.value = undefined
  await flushPromises()
  resolve({ inventoryVersion: 8, entry: { ...row, kind: 'MANUAL' } })
  await flushPromises()
  expect(state.result.value).toBeUndefined()
  expect(state.form.text).toBe('')
  expect(state.busy.value).toBe(false)
})
it('retries the failed manifest-page load through the exposed recovery action', async () => {
  vi.mocked(versionsApi.revisionPages)
    .mockRejectedValueOnce(new ApiError('temporary failure', 503))
    .mockResolvedValueOnce([{ name: 'Home', path: 'index.html', pageId: 'home' }])
  const { state } = await render()
  expect(state.pages.value).toHaveLength(0)
  expect(state.error.value).toBe(protoLocales.zh.copyLoadFailed)
  await state.loadPages()
  await flushPromises()
  expect(state.snapshot.value?.pageId).toBe('home')
  expect(state.error.value).toBe('')
})
it('save permission withdrawal cancels a stale read and reloads a usable read-only inventory', async () => {
  const { state, current } = await render()
  let release!: (value: ReturnType<typeof result>) => void
  vi.mocked(copyInventoryApi.query)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    .mockResolvedValueOnce(result())
  const read = state.load()
  expect(state.loading.value).toBe(true)
  current.value = {
    ...structuredClone(source),
    project: { ...source.project, capabilities: { ...source.project.capabilities!, edit: false } },
  }
  await flushPromises()
  expect(state.canEdit.value).toBe(false)
  expect(state.loading.value).toBe(false)
  expect(state.result.value?.data).toHaveLength(1)
  release(result(snapshot, []))
  await read
  expect(state.result.value?.data).toHaveLength(1)
})
it('an unknown operation cannot be discarded to create a second request on the same page', async () => {
  const { state } = await render()
  vi.mocked(copyInventoryApi.create).mockRejectedValueOnce(new ApiError('unknown', 503))
  state.edit()
  state.form.text = 'One original operation'
  state.save()
  await flushPromises()
  state.discard()
  state.edit()
  state.save()
  expect(state.unknown.value).toBe(true)
  expect(state.form.text).toBe('One original operation')
  expect(copyInventoryApi.create).toHaveBeenCalledTimes(1)
})
