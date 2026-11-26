import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import {
  useDeliveryDocument,
  type DeliveryScope,
} from '@/modules/protohub-manager-ui/hooks/useDeliveryDocument'
import { deliveryDocumentApi } from '@/modules/protohub-manager-ui/api/delivery-document'
import { functionalSpecApi } from '@/modules/protohub-manager-ui/api/functional-spec'
import { revisionMaterialsApi } from '@/modules/protohub-manager-ui/api/revision-material'
import { viewportCheckApi } from '@/modules/protohub-manager-ui/api/viewport-check'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('@/modules/protohub-manager-ui/api/delivery-document', () => ({
  deliveryDocumentApi: { assemble: vi.fn(), export: vi.fn() },
}))
vi.mock('@/modules/protohub-manager-ui/api/functional-spec', () => ({
  functionalSpecApi: { query: vi.fn(), get: vi.fn() },
}))
vi.mock('@/modules/protohub-manager-ui/api/revision-material', () => ({
  revisionMaterialsApi: { query: vi.fn(), get: vi.fn(), content: vi.fn() },
}))
vi.mock('@/modules/protohub-manager-ui/api/viewport-check', () => ({
  viewportCheckApi: { query: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const source: DeliveryScope = {
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
      { name: 'Folder', folder: true },
    ],
  },
}
const wrappers: VueWrapper[] = []
function setup() {
  const scope = ref<DeliveryScope | undefined>(structuredClone(source))
  let state!: ReturnType<typeof useDeliveryDocument>
  wrappers.push(
    mount(
      hookHarness(() => (state = useDeliveryDocument(scope, ref('en')))),
      { global: { provide: { [permissionKey as symbol]: { can: () => true } } } },
    ),
  )
  return { state, scope }
}
beforeEach(() => {
  vi.clearAllMocks()
  const result = { data: [], total: 0, pageIndex: 0, pageSize: 20 }
  vi.mocked(functionalSpecApi.query).mockResolvedValue(result)
  vi.mocked(revisionMaterialsApi.query).mockResolvedValue(result)
  vi.mocked(viewportCheckApi.query).mockResolvedValue(result)
  vi.mocked(deliveryDocumentApi.assemble).mockImplementation(async (_, __, input) => ({
    ...input,
    projectId: 'p1',
    versionId: 'v1',
    revisionId: 'fixed',
    pages: input.pages.map((page) => ({
      ...page,
      name: page.pageId,
      path: `${page.pageId}.html`,
      body: 'Assembled text',
      sourceFingerprint: 'a'.repeat(64),
    })),
  }))
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
it('selects actual non-folder pages, paginates beyond20, retains body on reorder/remove and rejects changed selections until reassembly', async () => {
  const { state } = setup()
  expect(state.pages.value.map((page) => page.pageId)).toEqual(['home', 'child'])
  state.selectPage('home')
  await flushPromises()
  state.indexes.descriptions = 1
  await state.loadSources()
  expect(functionalSpecApi.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ pageId: 'home' }),
    { pageIndex: 1, pageSize: 20 },
    expect.anything(),
  )
  await state.assemble()
  state.active.value!.body = 'Manual edit'
  state.selectPage('child')
  await flushPromises()
  state.move('home', 1)
  expect(state.document.pages[1]?.body).toBe('Manual edit')
  state.removePage('child')
  expect(state.document.pages[0]?.body).toBe('Manual edit')
  state.active.value!.descriptions.push({ id: 'changed', expectedVersion: 0 })
  expect(state.needsAssembly.value).toBe(true)
  await state.exportDocument('html')
  expect(deliveryDocumentApi.export).not.toHaveBeenCalled()
})
it('preserves manual text on409 and clears every private draft on scope or authorization loss', async () => {
  const { state, scope } = setup()
  state.selectPage('home')
  await flushPromises()
  await state.assemble()
  state.active.value!.body = 'Preserved manual text'
  vi.mocked(deliveryDocumentApi.export).mockRejectedValue(new ApiError('Changed', 409))
  await state.exportDocument('html')
  expect(state.conflict.value).toBe(true)
  expect(state.active.value!.body).toBe('Preserved manual text')
  vi.mocked(functionalSpecApi.query).mockRejectedValue(new ApiError('Denied', 403))
  await state.loadSources()
  expect(state.document.pages).toEqual([])
  expect(state.available.value).toBe(false)
  scope.value = undefined
  await flushPromises()
  expect(state.document.introduction).toBe('')
})
it('drops a late assemble response after the fixed scope changes', async () => {
  const { state, scope } = setup()
  state.selectPage('home')
  await flushPromises()
  let resolve!: (value: Awaited<ReturnType<typeof deliveryDocumentApi.assemble>>) => void
  vi.mocked(deliveryDocumentApi.assemble).mockImplementation(
    () => new Promise((done) => (resolve = done)),
  )
  const request = state.assemble()
  scope.value = undefined
  await flushPromises()
  resolve({
    locale: 'en',
    title: 'Late',
    introduction: 'Private',
    projectId: 'p1',
    versionId: 'v1',
    revisionId: 'fixed',
    pages: [],
  })
  await request
  expect(state.document.pages).toEqual([])
  expect(state.document.introduction).toBe('')
})
it('allows a READ/query viewer to assemble without EDIT/save permission', async () => {
  const scope = ref<DeliveryScope>({
    ...structuredClone(source),
    project: {
      ...structuredClone(source.project),
      role: 'viewer',
      capabilities: {
        read: true,
        edit: false,
        manageMembers: false,
        deleteProject: false,
        manageShares: false,
      },
    },
  })
  let state!: ReturnType<typeof useDeliveryDocument>
  wrappers.push(
    mount(
      hookHarness(() => (state = useDeliveryDocument(scope, ref('en')))),
      {
        global: {
          provide: {
            [permissionKey as symbol]: {
              can: (permission: string) => permission.endsWith(':query'),
            },
          },
        },
      },
    ),
  )
  expect(state.available.value).toBe(true)
  state.selectPage('home')
  await flushPromises()
  await state.assemble()
  expect(deliveryDocumentApi.assemble).toHaveBeenCalledOnce()
  expect(state.assembled.value).toBe(true)
})
it('keeps an edited document when a selected source was deleted before explicit reassembly', async () => {
  const { state } = setup()
  state.selectPage('home')
  await flushPromises()
  await state.assemble()
  state.active.value!.body = 'Keep this manual draft'
  state.active.value!.descriptions.push({ id: 'removed-description', expectedVersion: 0 })
  vi.mocked(functionalSpecApi.get).mockRejectedValue(new ApiError('Missing source', 404))
  await state.assemble(true)
  expect(state.available.value).toBe(true)
  expect(state.conflict.value).toBe(true)
  expect(state.active.value!.body).toBe('Keep this manual draft')
})
it('keeps edited body when a selected image is deleted before opening preview', async () => {
  const { state } = setup()
  state.selectPage('home')
  await flushPromises()
  state.active.value!.images.push({
    id: 'deleted-image',
    expectedVersion: 0,
    caption: 'User caption',
  })
  await state.assemble()
  state.active.value!.body = 'Manual body survives a missing image'
  vi.mocked(revisionMaterialsApi.content).mockRejectedValue(new ApiError('Image removed', 404))
  await state.loadImages()
  expect(state.available.value).toBe(true)
  expect(state.conflict.value).toBe(true)
  expect(state.active.value!.body).toBe('Manual body survives a missing image')
  expect(Object.keys(state.imageUrls)).toEqual([])
})
it('creates and revokes one owned object URL when preview image reads overlap', async () => {
  const create = vi.fn(() => 'blob:delivery-image'),
    revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create
      static override revokeObjectURL = revoke
    },
  )
  try {
    const { state, scope } = setup()
    state.selectPage('home')
    await flushPromises()
    state.active.value!.images.push({ id: 'shared-image', expectedVersion: 0, caption: '' })
    await state.assemble()
    const finish: ((value: Awaited<ReturnType<typeof revisionMaterialsApi.content>>) => void)[] = []
    vi.mocked(revisionMaterialsApi.content).mockImplementation(
      () => new Promise((resolve) => finish.push(resolve)),
    )
    const first = state.loadImages(),
      second = state.loadImages()
    expect(finish).toHaveLength(2)
    const response = {
      blob: new Blob(['image'], { type: 'image/png' }),
      contentType: 'image/png',
      filename: 'user.png',
    }
    finish[0]!(response)
    await first
    finish[1]!(response)
    await second
    expect(create).toHaveBeenCalledOnce()
    expect(state.imageUrls['shared-image']).toBe('blob:delivery-image')
    scope.value = undefined
    await flushPromises()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:delivery-image')
    expect(Object.keys(state.imageUrls)).toEqual([])
  } finally {
    vi.unstubAllGlobals()
  }
})
