import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import {
  useViewportChecks,
  type ViewportScope,
} from '@/modules/protohub-manager-ui/hooks/useViewportChecks'
import { viewportCheckApi } from '@/modules/protohub-manager-ui/api/viewport-check'
import type { ViewportCheck } from '@/modules/protohub-manager-ui/types/viewport-check'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'

vi.mock('@/modules/protohub-manager-ui/api/viewport-check', () => ({
  viewportCheckApi: { query: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const wrappers: VueWrapper[] = []
const source: ViewportScope = {
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
  initialPage: { pageId: 'home', revisionId: 'fixed', name: 'Home', path: 'index.html' },
}
const row: ViewportCheck = {
  id: 'check',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed',
  pageId: 'home',
  title: 'Submit',
  category: { value: 'normal', text: '正常' },
  result: { value: 'passed', text: '通过' },
  steps: 'Submit form',
  expected: 'Success',
  observed: 'Success shown',
  evidence: '<script>literal evidence</script>',
  viewportWidth: 390,
  viewportHeight: 844,
  viewportScale: 75,
  configVersion: 3,
  createdAt: 1,
  updatedAt: 2,
}
const page = (data: ViewportCheck[] = [], total = data.length) => ({
  data,
  total,
  pageIndex: 0,
  pageSize: 20,
})
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.mocked(viewportCheckApi.query).mockResolvedValue(page([row]))
  vi.mocked(viewportCheckApi.create).mockImplementation(async (_target, input) => ({
    ...row,
    ...input,
    category: { value: input.category, text: input.category },
    result: { value: input.result, text: input.result },
    configVersion: 0,
  }))
  vi.mocked(viewportCheckApi.update).mockResolvedValue({ ...row, configVersion: 4 })
  vi.mocked(viewportCheckApi.remove).mockResolvedValue(true)
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function render(value = source) {
  const scope = ref<ViewportScope | undefined>(structuredClone(value)),
    write = ref(true),
    read = ref(true)
  let state!: ReturnType<typeof useViewportChecks>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useViewportChecks(scope)
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
function fill(state: ReturnType<typeof useViewportChecks>) {
  Object.assign(state.form, {
    title: 'Mobile form',
    expected: 'Success',
    observed: 'Success seen',
    result: 'passed',
    viewportWidth: 390,
    viewportHeight: 844,
    viewportScale: 75,
  })
}
it('loads only trusted fixed pages and restores a record including its real viewport and plain evidence', async () => {
  const { state } = await render()
  expect(viewportCheckApi.query).toHaveBeenCalledWith(
    { versionId: 'v1', revisionId: 'fixed', pageId: 'home' },
    expect.objectContaining({ pageIndex: 0, pageSize: 20 }),
    expect.anything(),
  )
  state.select(row)
  expect(state.form).toMatchObject({
    title: 'Submit',
    viewportWidth: 390,
    viewportHeight: 844,
    viewportScale: 75,
    evidence: row.evidence,
    result: 'passed',
  })
  expect(state.dirty.value).toBe(false)
  state.form.title = 'Changed'
  expect(state.dirty.value).toBe(true)
})
it('creates and CAS updates an immutable page record, then deletes with its original version', async () => {
  const { state } = await render()
  fill(state)
  state.save()
  await flushPromises()
  expect(viewportCheckApi.create).toHaveBeenCalledWith(
    { versionId: 'v1', revisionId: 'fixed', pageId: 'home' },
    expect.objectContaining({
      title: 'Mobile form',
      viewportWidth: 390,
      viewportScale: 75,
      clientRequestId: expect.any(String),
    }),
    expect.anything(),
  )
  state.select(row)
  state.form.observed = 'Second observation'
  state.save()
  await flushPromises()
  expect(viewportCheckApi.update).toHaveBeenCalledWith(
    expect.anything(),
    'check',
    expect.objectContaining({ expectedVersion: 3, observed: 'Second observation' }),
    expect.anything(),
  )
  state.remove()
  await flushPromises()
  expect(viewportCheckApi.remove).toHaveBeenCalledWith(
    expect.anything(),
    'check',
    expect.objectContaining({ expectedVersion: 4 }),
    expect.anything(),
  )
  expect(state.original.value).toBeUndefined()
})
it.each([
  ['viewportWidth', 239],
  ['viewportHeight', 3841],
  ['viewportScale', 24],
  ['viewportWidth', 390.5],
] as const)('rejects invalid %s before a write', async (key, value) => {
  const { state } = await render()
  fill(state)
  state.form[key] = value
  state.save()
  await flushPromises()
  expect(viewportCheckApi.create).not.toHaveBeenCalled()
  expect(state.invalid[key]).toBeTruthy()
})
it('requires observations for completed results but supports independently useful untested scenarios', async () => {
  const { state } = await render()
  fill(state)
  state.form.observed = ''
  state.save()
  expect(state.invalid.observed).toBeTruthy()
  expect(viewportCheckApi.create).not.toHaveBeenCalled()
  state.form.result = 'untested'
  state.save()
  await flushPromises()
  expect(viewportCheckApi.create).toHaveBeenCalledOnce()
})
it('preserves an unknown mutation exactly, locks edits and retries the original request ID and payload', async () => {
  const { state } = await render()
  fill(state)
  vi.mocked(viewportCheckApi.create).mockRejectedValueOnce(new ApiError('Lost response', 503))
  state.save()
  await flushPromises()
  const input = vi.mocked(viewportCheckApi.create).mock.calls[0]![1]
  expect(state.unknown.value).toBe(true)
  expect(state.locked.value).toBe(true)
  expect(state.form.title).toBe('Mobile form')
  state.selectPage('child')
  expect(state.pageId.value).toBe('home')
  state.retry()
  await flushPromises()
  expect(vi.mocked(viewportCheckApi.create).mock.calls[1]![1]).toEqual(input)
  expect(state.unknown.value).toBe(false)
})
it('preserves conflicted local content without silently retrying or replacing it from list reads', async () => {
  const { state } = await render()
  state.select(row)
  state.form.title = 'My changed scenario'
  vi.mocked(viewportCheckApi.update).mockRejectedValue(new ApiError('Changed', 409))
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  expect(state.error.value).toBe(protoLocales.zh.viewportConflict)
  expect(state.form.title).toBe('My changed scenario')
  state.save()
  state.retry()
  await flushPromises()
  expect(viewportCheckApi.update).toHaveBeenCalledOnce()
  await state.load()
  expect(state.error.value).toBe(protoLocales.zh.viewportConflict)
})
it('does not expose revoked or mismatched records and prevents readonly writes', async () => {
  const { state, write, read } = await render()
  state.select(row)
  state.form.title = 'Private draft'
  write.value = false
  await flushPromises()
  expect(state.canEdit.value).toBe(false)
  expect(state.form.title).toBe('')
  state.save()
  expect(viewportCheckApi.create).not.toHaveBeenCalled()
  read.value = false
  await flushPromises()
  expect(state.result.value).toBeUndefined()
  expect(state.page.value).toBeUndefined()
  read.value = true
  write.value = true
  vi.mocked(viewportCheckApi.query).mockResolvedValue(page([{ ...row, revisionId: 'other' }]))
  await flushPromises()
  await state.load()
  expect(state.denied.value).toBe(true)
  expect(state.result.value).toBeUndefined()
})
it('ignores a late query after fixed-page switch and never migrates the previous draft', async () => {
  const { state } = await render()
  fill(state)
  let resolve!: (value: ReturnType<typeof page>) => void
  vi.mocked(viewportCheckApi.query)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    .mockResolvedValue(page([]))
  void state.load()
  state.selectPage('child')
  await flushPromises()
  resolve(page([row]))
  await flushPromises()
  expect(state.pageId.value).toBe('child')
  expect(state.result.value?.data).toEqual([])
  expect(state.form.title).toBe('')
})
it('uses server totals and sends category/result filters with the requested database page', async () => {
  const { state } = await render()
  state.filters.category = 'boundary'
  state.filters.result = 'failed'
  vi.mocked(viewportCheckApi.query).mockResolvedValue(page([], 42))
  state.query(2)
  await flushPromises()
  expect(viewportCheckApi.query).toHaveBeenLastCalledWith(
    expect.anything(),
    { pageIndex: 2, pageSize: 20, category: 'boundary', result: 'failed' },
    expect.anything(),
  )
  expect(state.result.value?.total).toBe(42)
})
