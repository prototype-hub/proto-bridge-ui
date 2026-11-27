import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { usePageTrace } from '@/modules/protohub-manager-ui/hooks/usePageTrace'
import { pageTraceApi as api } from '@/modules/protohub-manager-ui/api/page-trace'
import type {
  TraceContext,
  TraceScope,
  PageRelation,
} from '@/modules/protohub-manager-ui/types/page-trace'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('@/modules/protohub-manager-ui/api/page-trace', () => ({
  pageTraceApi: {
    relations: vi.fn(),
    relation: vi.fn(),
    createRelation: vi.fn(),
    updateRelation: vi.fn(),
    removeRelation: vi.fn(),
    context: vi.fn(),
    saveContext: vi.fn(),
    entries: vi.fn(),
    sources: vi.fn(),
    source: vi.fn(),
    decisions: vi.fn(),
    decision: vi.fn(),
    createDecision: vi.fn(),
    updateDecision: vi.fn(),
    removeDecision: vi.fn(),
  },
}))
const wrappers: VueWrapper[] = []
const scopeValue: TraceScope = {
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
  context: {
    revisionId: 'fixed',
    title: 'Project',
    versionName: 'V1',
    runtimeBaseUrl: '/runtime/fixed',
    entryFile: 'index.html',
    pages: [
      {
        pageId: 'home',
        name: 'Home',
        path: 'index.html',
        children: [{ pageId: 'child', name: 'Child', path: 'child.html' }],
      },
      { pageId: 'folder', name: 'Folder', folder: true },
    ],
  },
}
const row: PageRelation = {
  id: 'r1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed',
  fromPageId: 'home',
  toPageId: 'child',
  label: 'Open detail',
  note: 'Literal note',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
}
const contextValue: TraceContext = {
  id: 'c1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed',
  pageId: 'home',
  entry: false,
  references: [
    {
      kind: 'description',
      id: 'spec',
      expectedVersion: 1,
      currentVersion: 2,
      status: 'changed',
      title: 'Updated description',
    },
    {
      kind: 'check',
      id: 'gone',
      expectedVersion: 4,
      currentVersion: null,
      status: 'missing',
      title: null,
    },
  ],
  configVersion: 5,
  createdAt: 1,
  updatedAt: 1,
}
const paged = <T>(data: T[] = []) => ({ data, total: data.length, pageIndex: 0, pageSize: 20 })
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.mocked(api.relations).mockResolvedValue(paged([structuredClone(row)]))
  vi.mocked(api.context).mockImplementation(async (_target, pageId) => ({
    ...structuredClone(contextValue),
    pageId,
  }))
  vi.mocked(api.decisions).mockResolvedValue(paged())
  vi.mocked(api.entries).mockResolvedValue(paged())
  vi.mocked(api.sources).mockResolvedValue(
    paged([{ kind: 'work-item', id: 'wi', title: 'Requirement', configVersion: 2 }]),
  )
  vi.mocked(api.source).mockResolvedValue({
    kind: 'description',
    id: 'spec',
    title: 'Updated description',
    configVersion: 2,
    fields: { purpose: 'Plain <script>text</script>' },
  })
  vi.mocked(api.relation).mockResolvedValue({ ...row, label: 'Server label', configVersion: 1 })
  vi.mocked(api.createRelation).mockImplementation(async (_target, input) => ({ ...row, ...input }))
  vi.mocked(api.updateRelation).mockImplementation(async (_target, _id, input) => ({
    ...row,
    ...input,
    configVersion: 1,
  }))
  vi.mocked(api.saveContext).mockImplementation(async (_target, pageId, input) => ({
    ...structuredClone(contextValue),
    ...input,
    pageId,
    references: input.references.map((ref) => ({
      ...ref,
      status: 'current',
      currentVersion: ref.expectedVersion,
      title: 'Source',
    })),
    configVersion: 6,
  }))
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function render() {
  const scope = ref<TraceScope | undefined>(structuredClone(scopeValue)),
    read = ref(true),
    write = ref(true)
  let state!: ReturnType<typeof usePageTrace>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = usePageTrace(scope)
      }),
      {
        global: {
          provide: {
            [permissionKey as symbol]: {
              can: (value: string) => (value.endsWith(':query') ? read.value : write.value),
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, scope, read, write }
}
it('keeps content pages with children and saves only the exact immutable source/target', async () => {
  const { state } = await render()
  expect(state.pages.value.map((p) => p.pageId)).toEqual(['home', 'child'])
  state.editRelation()
  Object.assign(state.relationForm, {
    toPageId: 'child',
    label: '  Details  ',
    note: '<script>text</script>',
  })
  state.save()
  await flushPromises()
  expect(api.createRelation).toHaveBeenCalledWith(
    { versionId: 'v1', revisionId: 'fixed' },
    expect.objectContaining({
      fromPageId: 'home',
      toPageId: 'child',
      label: 'Details',
      note: '<script>text</script>',
      clientRequestId: expect.any(String),
    }),
    expect.any(Object),
  )
})
it('rejects self edges and does not permit a read-only member to write', async () => {
  const { state, write } = await render()
  state.editRelation()
  Object.assign(state.relationForm, { toPageId: 'home', label: 'Self' })
  state.save()
  expect(api.createRelation).not.toHaveBeenCalled()
  expect(state.invalid.value).toBeTruthy()
  write.value = false
  await flushPromises()
  state.editRelation()
  state.save()
  expect(state.canEdit.value).toBe(false)
  expect(api.createRelation).not.toHaveBeenCalled()
})
it('preserves changed and missing source versions when entry metadata changes', async () => {
  const { state } = await render()
  state.toggleEntry()
  await flushPromises()
  expect(api.saveContext).toHaveBeenCalledWith(
    expect.any(Object),
    'home',
    expect.objectContaining({
      entry: true,
      expectedVersion: 5,
      references: [
        { kind: 'description', id: 'spec', expectedVersion: 1 },
        { kind: 'check', id: 'gone', expectedVersion: 4 },
      ],
    }),
    expect.any(Object),
  )
})
it('keeps the exact unknown write and only retries the original payload', async () => {
  const { state } = await render()
  vi.mocked(api.createRelation).mockRejectedValueOnce(new ApiError('Lost response', 502))
  state.editRelation()
  Object.assign(state.relationForm, { toPageId: 'child', label: 'Draft' })
  state.save()
  await flushPromises()
  expect(state.unknown.value).toBe(true)
  expect(state.relationForm.label).toBe('Draft')
  const original = structuredClone(vi.mocked(api.createRelation).mock.calls[0]![1])
  state.save()
  expect(api.createRelation).toHaveBeenCalledTimes(1)
  state.retry()
  await flushPromises()
  expect(vi.mocked(api.createRelation).mock.calls[1]![1]).toEqual(original)
  expect(state.unknown.value).toBe(false)
})
it('keeps a CAS conflict draft until the current record is explicitly accepted', async () => {
  const { state } = await render()
  vi.mocked(api.updateRelation).mockRejectedValue(new ApiError('Conflict', 409))
  state.editRelation(row)
  state.relationForm.label = 'Local draft'
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  expect(state.relationForm.label).toBe('Local draft')
  await state.readCurrent()
  expect(state.relationForm.label).toBe('Local draft')
  state.useCurrent()
  expect(state.relationForm.label).toBe('Server label')
  expect(state.original.value?.configVersion).toBe(1)
})
it('preserves unsaved text after another editor deletes the record, then clears on revoked scope', async () => {
  const { state, read } = await render()
  vi.mocked(api.updateRelation).mockRejectedValue(new ApiError('Removed', 404))
  vi.mocked(api.relation).mockRejectedValue(new ApiError('Removed', 404))
  state.editRelation(row)
  state.relationForm.label = 'Keep this draft'
  state.save()
  await flushPromises()
  expect(state.denied.value).toBe(false)
  expect(state.conflict.value).toBe(true)
  expect(state.relationForm.label).toBe('Keep this draft')
  await state.readCurrent()
  expect(state.relationForm.label).toBe('Keep this draft')
  expect(api.createRelation).not.toHaveBeenCalled()
  read.value = false
  await flushPromises()
  expect(state.relations.value).toBeUndefined()
  expect(state.relationForm.label).toBe('')
})
it('only reconnects the explicitly viewed exact source to its current version', async () => {
  const { state } = await render()
  const ref = state.context.value!.references[0]!
  state.reconnect(ref)
  expect(api.saveContext).not.toHaveBeenCalled()
  await state.readSource(ref)
  state.reconnect(ref)
  await flushPromises()
  expect(api.saveContext).toHaveBeenCalledWith(
    expect.any(Object),
    'home',
    expect.objectContaining({
      references: [
        { kind: 'description', id: 'spec', expectedVersion: 2 },
        { kind: 'check', id: 'gone', expectedVersion: 4 },
      ],
    }),
    expect.any(Object),
  )
})
it('ignores an earlier page source response after page selection changes', async () => {
  const { state } = await render()
  let resolve!: (value: Awaited<ReturnType<typeof api.source>>) => void
  vi.mocked(api.source).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const pending = state.readSource({ kind: 'description', id: 'spec' })
  state.selectPage('child')
  resolve({
    kind: 'description',
    id: 'spec',
    title: 'Old page secret',
    configVersion: 2,
    fields: { purpose: 'old' },
  })
  await pending
  await flushPromises()
  expect(state.pageId.value).toBe('child')
  expect(state.sourceDetail.value).toBeUndefined()
})
it('clears private records on a browser focus after the credential changes', async () => {
  const { token } = await import('@/shared/auth/token')
  const { state } = await render()
  expect(state.relations.value?.total).toBe(1)
  token.set('another-session')
  window.dispatchEvent(new Event('focus'))
  expect(state.denied.value).toBe(true)
  expect(state.relations.value).toBeUndefined()
  state.save()
  expect(api.createRelation).not.toHaveBeenCalled()
  token.clear()
})
