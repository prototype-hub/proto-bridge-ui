import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import {
  useFunctionalSpecs,
  type FunctionalScope,
} from '@/modules/protohub-manager-ui/hooks/useFunctionalSpecs'
import { functionalSpecApi } from '@/modules/protohub-manager-ui/api/functional-spec'
import type { FunctionalSpec } from '@/modules/protohub-manager-ui/types/functional-spec'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'

vi.mock('@/modules/protohub-manager-ui/api/functional-spec', () => ({
  functionalSpecApi: {
    query: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const wrappers: VueWrapper[] = []
const source: FunctionalScope = {
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
      { pageId: 'home', name: 'Home', path: 'index.html' },
      { pageId: 'child', name: 'Child', path: 'child.html' },
    ],
  },
  page: { pageId: 'home', revisionId: 'fixed', name: 'Home', path: 'index.html' },
}
const row: FunctionalSpec = {
  id: 'spec',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed',
  pageId: 'home',
  title: 'Submit',
  purpose: 'Save an order',
  inputRules: '',
  permissionRules: '',
  navigationRules: '',
  notes: '<script>literal text</script>',
  anchor: null,
  configVersion: 3,
  createdAt: 1,
  updatedAt: 2,
}
const page = (data: FunctionalSpec[] = []) => ({
  data,
  total: data.length,
  pageIndex: 0,
  pageSize: 20,
})
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.mocked(functionalSpecApi.query).mockResolvedValue(page([row]))
  vi.mocked(functionalSpecApi.get).mockResolvedValue({
    ...row,
    purpose: 'Server revision',
    configVersion: 4,
  })
  vi.mocked(functionalSpecApi.create).mockImplementation(async (_target, input) => ({
    ...row,
    ...input,
    configVersion: 0,
  }))
  vi.mocked(functionalSpecApi.update).mockImplementation(async (_target, _id, input) => ({
    ...row,
    ...input,
    configVersion: 4,
  }))
  vi.mocked(functionalSpecApi.remove).mockResolvedValue(true)
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function render(value = source) {
  const scope = ref<FunctionalScope | undefined>(structuredClone(value)),
    write = ref(true),
    read = ref(true)
  let state!: ReturnType<typeof useFunctionalSpecs>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useFunctionalSpecs(scope)
      }),
      {
        global: {
          provide: {
            [permissionKey as symbol]: {
              can: (permission: string) =>
                permission.endsWith(':query') ? read.value : write.value,
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, scope, write, read }
}
it('saves literal text and region against the exact immutable scope', async () => {
  const { state } = await render()
  state.select()
  state.form.title = '  Submit  '
  state.form.notes = '<script>literal text</script>'
  state.form.anchor = {
    space: 'root-document-css-px-v1',
    shape: 'rect',
    x: 12,
    y: 22,
    width: 40,
    height: 50,
    documentWidth: 1600,
    documentHeight: 2200,
    viewportWidth: 390,
    viewportHeight: 844,
  }
  state.save()
  await flushPromises()
  expect(functionalSpecApi.create).toHaveBeenCalledWith(
    { versionId: 'v1', revisionId: 'fixed', pageId: 'home' },
    expect.objectContaining({
      title: 'Submit',
      notes: '<script>literal text</script>',
      anchor: expect.objectContaining({ x: 12 }),
      revisionId: 'fixed',
      pageId: 'home',
      clientRequestId: expect.any(String),
    }),
    expect.anything(),
  )
  expect(state.dirty.value).toBe(false)
})
it('retries an unknown write with the original key and unchanged payload, even after a lost response', async () => {
  const { state } = await render()
  vi.mocked(functionalSpecApi.create).mockRejectedValueOnce(new ApiError('lost', 503))
  state.select()
  state.form.title = 'Receipt'
  state.save()
  await flushPromises()
  expect(state.unknown.value).toBe(true)
  expect(state.locked.value).toBe(true)
  const operation = vi.mocked(functionalSpecApi.create).mock.calls[0]![1]
  state.select(row)
  expect(state.original.value).toBeUndefined()
  state.retry()
  await flushPromises()
  expect(vi.mocked(functionalSpecApi.create).mock.calls[1]![1]).toEqual(operation)
  expect(state.unknown.value).toBe(false)
})
it('preserves a CAS draft, reads the current server row directly, and only adopts it explicitly', async () => {
  const { state } = await render()
  state.select(row)
  state.form.purpose = 'My draft'
  vi.mocked(functionalSpecApi.update).mockRejectedValueOnce(new ApiError('changed', 409))
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  await state.readConflict()
  expect(functionalSpecApi.get).toHaveBeenCalledWith(
    expect.objectContaining({ revisionId: 'fixed', pageId: 'home' }),
    'spec',
    expect.anything(),
  )
  expect(state.form.purpose).toBe('My draft')
  expect(state.serverRecord.value?.purpose).toBe('Server revision')
  state.select(state.serverRecord.value)
  expect(state.form.purpose).toBe('Server revision')
})
it('keeps the draft for an explicitly deleted row but clears private data after permission loss', async () => {
  const { state } = await render()
  state.select(row)
  state.form.purpose = 'My draft'
  vi.mocked(functionalSpecApi.update).mockRejectedValueOnce(new ApiError('changed', 409))
  state.save()
  await flushPromises()
  vi.mocked(functionalSpecApi.get).mockRejectedValueOnce(
    new ApiError('deleted', 404, 'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_NOT_FOUND'),
  )
  await state.readConflict()
  expect(state.form.purpose).toBe('My draft')
  expect(state.conflict.value).toBe(true)
  vi.mocked(functionalSpecApi.get).mockRejectedValueOnce(new ApiError('forbidden', 403))
  await state.readConflict()
  expect(state.denied.value).toBe(true)
  expect(state.form.title).toBe('')
  expect(state.result.value).toBeUndefined()
})
it('rejects late writes after actor and page changes and clears on local edit revocation', async () => {
  const { state, scope, write } = await render()
  let finish!: (value: FunctionalSpec) => void
  vi.mocked(functionalSpecApi.create).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  state.select()
  state.form.title = 'Private'
  state.save()
  scope.value = {
    ...source,
    actorId: 'u2',
    page: { pageId: 'child', revisionId: 'fixed', name: 'Child', path: 'child.html' },
  }
  vi.mocked(functionalSpecApi.query).mockResolvedValue(page())
  finish({ ...row, title: 'Private' })
  await flushPromises()
  expect(state.form.title).toBe('')
  expect(state.original.value).toBeUndefined()
  state.select()
  state.form.title = 'New draft'
  write.value = false
  await flushPromises()
  expect(state.form.title).toBe('')
  expect(state.canEdit.value).toBe(false)
})
it('rejects foreign rows and scopes that are not manifest leaf pages', async () => {
  vi.mocked(functionalSpecApi.query).mockResolvedValue(page([{ ...row, pageId: 'child' }]))
  const { state } = await render()
  expect(state.denied.value).toBe(true)
  expect(state.result.value).toBeUndefined()
  vi.mocked(functionalSpecApi.query).mockClear()
  await render({ ...source, page: { ...source.page, path: 'elsewhere.html' } })
  expect(functionalSpecApi.query).not.toHaveBeenCalled()
})
it('queries server pagination by title keyword and sends a CAS deletion for only the selected record', async () => {
  const { state } = await render()
  state.search.value = ' Submit '
  state.query(2)
  await flushPromises()
  expect(functionalSpecApi.query).toHaveBeenLastCalledWith(
    expect.anything(),
    { pageIndex: 2, pageSize: 20, keyword: 'Submit' },
    expect.anything(),
  )
  state.select(row)
  state.remove()
  await flushPromises()
  expect(functionalSpecApi.remove).toHaveBeenCalledWith(
    expect.anything(),
    'spec',
    expect.objectContaining({
      revisionId: 'fixed',
      pageId: 'home',
      expectedVersion: 3,
      clientRequestId: expect.any(String),
    }),
    expect.anything(),
  )
  expect(state.editing.value).toBe(false)
})
it('validates title and field limits without sending a write', async () => {
  const { state } = await render()
  state.select()
  state.save()
  expect(state.invalid.title).toBeTruthy()
  state.form.title = 'Valid'
  state.form.notes = 'a'.repeat(4001)
  state.save()
  expect(state.invalid.notes).toBeTruthy()
  expect(functionalSpecApi.create).not.toHaveBeenCalled()
})
