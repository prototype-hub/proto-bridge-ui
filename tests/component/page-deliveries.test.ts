import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { pageDeliveriesApi } from '@/modules/protohub-manager-ui/api'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import {
  usePageDeliveries,
  type PageDeliveriesScope,
} from '@/modules/protohub-manager-ui/views/project/hooks/usePageDeliveries'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { PageDelivery } from '@/modules/protohub-manager-ui/types'
import { ownerProjectAccess } from '../fixtures/project-access'
import { hookHarness } from '../fixtures/hook-harness'

const credential = vi.hoisted(() => ({ value: 'session-1' }))
vi.mock('@/shared/auth/token', () => ({ token: { get: () => credential.value } }))
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  pageDeliveriesApi: { get: vi.fn(), save: vi.fn(), query: vi.fn(), candidates: vi.fn() },
}))
const wrappers: VueWrapper[] = []
const scope: PageDeliveriesScope = {
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
    id: 'fixed-old',
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 2,
    totalBytes: 100,
    createdBy: 'u1',
    createdAt: 1,
  },
}
const untouched: PageDelivery = {
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed-old',
  pageId: 'home',
  pageName: 'Home',
  pagePath: 'index.html',
  state: null,
  assignee: null,
  reason: '',
  configVersion: 0,
  updatedAt: null,
}
const saved: PageDelivery = {
  ...untouched,
  state: 'READY',
  reason: 'Ready',
  configVersion: 1,
  updatedAt: 1,
}
const pager = <T>(data: T[], total = data.length) => ({ data, total, pageIndex: 0, pageSize: 20 })
async function render(pageId?: string) {
  const current = ref<PageDeliveriesScope | undefined>(structuredClone(scope)),
    initialPage = ref(pageId),
    saveAllowed = ref(true),
    queryAllowed = ref(true)
  let state!: ReturnType<typeof usePageDeliveries>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = usePageDeliveries(current, initialPage)
      }),
      {
        global: {
          provide: {
            [permissionKey]: {
              can: (permission: string) =>
                permission.endsWith(':save') ? saveAllowed.value : queryAllowed.value,
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, current, initialPage, saveAllowed, queryAllowed }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  credential.value = 'session-1'
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.mocked(pageDeliveriesApi.query).mockResolvedValue(pager([]))
  vi.mocked(pageDeliveriesApi.get).mockResolvedValue(structuredClone(untouched))
  vi.mocked(pageDeliveriesApi.candidates).mockResolvedValue(
    pager([{ userId: 'viewer', name: 'Viewer' }]),
  )
})
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))
it('queries only persisted status rows with bounded pages and the explicit old revision', async () => {
  const { state } = await render()
  expect(pageDeliveriesApi.query).toHaveBeenCalledWith(
    'v1',
    { revisionId: 'fixed-old', pageIndex: 0, pageSize: 20 },
    expect.anything(),
  )
  expect(pageDeliveriesApi.get).not.toHaveBeenCalled()
  state.changeFilter('DONE')
  await flushPromises()
  state.page(3)
  await flushPromises()
  expect(pageDeliveriesApi.query).toHaveBeenLastCalledWith(
    'v1',
    { revisionId: 'fixed-old', state: 'DONE', pageIndex: 2, pageSize: 20 },
    expect.anything(),
  )
})
it('reads an unset page and saves expectedVersion zero, allowing a current viewer as assignee', async () => {
  const { state } = await render('home')
  expect(pageDeliveriesApi.get).toHaveBeenCalledWith('v1', 'home', 'fixed-old', expect.anything())
  expect(state.dirty.value).toBe(false)
  state.form.state = 'READY'
  state.form.reason = 'Ready'
  state.form.assigneeId = 'viewer'
  vi.mocked(pageDeliveriesApi.save).mockResolvedValue(saved)
  state.save()
  await flushPromises()
  expect(pageDeliveriesApi.save).toHaveBeenCalledWith(
    'v1',
    'home',
    expect.objectContaining({
      revisionId: 'fixed-old',
      state: 'READY',
      reason: 'Ready',
      assigneeId: 'viewer',
      expectedVersion: 0,
      clientRequestId: expect.any(String),
    }),
    expect.anything(),
  )
  expect(state.current.value).toEqual(saved)
  expect(state.dirty.value).toBe(false)
})
it('keeps the exact request after unknown outcome; GET cannot confirm it and retry can return a newer current record', async () => {
  const { state } = await render('home')
  state.form.state = 'READY'
  state.form.reason = 'Exact input'
  vi.mocked(pageDeliveriesApi.save).mockRejectedValueOnce(new ApiError('lost', 0))
  state.save()
  await flushPromises()
  const first = vi.mocked(pageDeliveriesApi.save).mock.calls[0]![2]
  expect(state.unknown.value).toBe(true)
  state.selectPage('other')
  state.changeFilter('DONE')
  state.page(2)
  state.discard()
  state.save()
  expect(state.selectedPageId.value).toBe('home')
  expect(pageDeliveriesApi.save).toHaveBeenCalledTimes(1)
  vi.mocked(pageDeliveriesApi.get).mockResolvedValue(saved)
  await state.loadDetail(true)
  expect(state.unknown.value).toBe(true)
  expect(state.form.reason).toBe('Exact input')
  const latest = { ...saved, state: 'DONE' as const, configVersion: 3, reason: 'Changed later' }
  vi.mocked(pageDeliveriesApi.save).mockResolvedValue(latest)
  state.retry()
  await flushPromises()
  expect(vi.mocked(pageDeliveriesApi.save).mock.calls[1]![2]).toEqual(first)
  expect(state.current.value).toEqual(latest)
  expect(state.unknown.value).toBe(false)
  expect(state.dirty.value).toBe(false)
})
it('retains a conflict draft and only updates its expected version after explicit refresh', async () => {
  const { state } = await render('home')
  state.form.state = 'IN_PROGRESS'
  state.form.reason = 'Mine'
  vi.mocked(pageDeliveriesApi.save).mockRejectedValueOnce(
    new ApiError('conflict', 409, 'PROTOTYPE_HUB_PAGE_DELIVERY_CONFLICT'),
  )
  state.save()
  await flushPromises()
  state.save()
  expect(pageDeliveriesApi.save).toHaveBeenCalledTimes(1)
  expect(state.form.reason).toBe('Mine')
  vi.mocked(pageDeliveriesApi.get).mockResolvedValue({ ...saved, configVersion: 9 })
  await state.loadDetail(true)
  expect(state.conflict.value).toBe(false)
  expect(state.form.reason).toBe('Mine')
  vi.mocked(pageDeliveriesApi.save).mockResolvedValue(saved)
  state.save()
  await flushPromises()
  expect(vi.mocked(pageDeliveriesApi.save).mock.calls[1]![2].expectedVersion).toBe(9)
  expect(vi.mocked(pageDeliveriesApi.save).mock.calls[1]![2].clientRequestId).not.toBe(
    vi.mocked(pageDeliveriesApi.save).mock.calls[0]![2].clientRequestId,
  )
})
it.each([400, 422])(
  'known rejection %i retains editable input without an unknown retry',
  async (status) => {
    const { state } = await render('home')
    state.form.state = 'READY'
    state.form.reason = 'Keep'
    vi.mocked(pageDeliveriesApi.save).mockRejectedValue(new ApiError('invalid', status))
    state.save()
    await flushPromises()
    expect(state.form.reason).toBe('Keep')
    expect(state.unknown.value).toBe(false)
    expect(state.busy.value).toBe(false)
  },
)
it.each([401, 403, 404])(
  'clears draft, records and candidates on authorization/scope rejection %i',
  async (status) => {
    const { state } = await render('home')
    state.form.state = 'READY'
    vi.mocked(pageDeliveriesApi.save).mockRejectedValue(new ApiError('denied', status))
    state.save()
    await flushPromises()
    expect(state.current.value).toBeUndefined()
    expect(state.rows.value).toEqual([])
    expect(state.candidates.value).toEqual([])
    expect(state.canEdit.value).toBe(false)
    expect(state.unavailable.value).toBe(true)
  },
)
it('shows an old unavailable assignee, and requires clearing or replacement', async () => {
  vi.mocked(pageDeliveriesApi.get).mockResolvedValue({
    ...saved,
    assignee: { userId: 'old', name: 'Old', available: false },
  })
  const { state } = await render('home')
  state.form.reason = 'changed'
  state.save()
  expect(pageDeliveriesApi.save).not.toHaveBeenCalled()
  expect(state.invalid.value).toBeTruthy()
  state.form.assigneeId = null
  vi.mocked(pageDeliveriesApi.save).mockResolvedValue(saved)
  state.save()
  await flushPromises()
  expect(pageDeliveriesApi.save).toHaveBeenCalledTimes(1)
})
it('rejects absent state and notes beyond 2000 characters before mutation', async () => {
  const { state } = await render('home')
  state.save()
  expect(state.invalid.value).toBeTruthy()
  state.form.state = 'DRAFT'
  state.form.reason = 'x'.repeat(2001)
  state.save()
  expect(pageDeliveriesApi.save).not.toHaveBeenCalled()
})
it('ignores a late previous-page response', async () => {
  const { state } = await render('home'),
    late = deferred<PageDelivery>()
  vi.mocked(pageDeliveriesApi.get)
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce({ ...untouched, pageId: 'other' })
  state.selectPage('home')
  state.selectPage('other')
  await flushPromises()
  late.resolve(saved)
  await flushPromises()
  expect(state.current.value?.pageId).toBe('other')
})
it.each(['actor', 'revision', 'credential', 'read', 'edit'] as const)(
  'discards a late write after %s changes',
  async (change) => {
    const { state, current, queryAllowed, saveAllowed } = await render('home'),
      late = deferred<PageDelivery>()
    state.form.state = 'READY'
    vi.mocked(pageDeliveriesApi.save).mockReturnValueOnce(late.promise)
    state.save()
    if (change === 'actor') current.value = undefined
    if (change === 'revision')
      current.value = { ...scope, revision: { ...scope.revision, id: 'new-revision' } }
    if (change === 'credential') credential.value = 'replaced-session'
    if (change === 'read') queryAllowed.value = false
    if (change === 'edit') saveAllowed.value = false
    late.resolve(saved)
    await flushPromises()
    expect(state.current.value?.configVersion).not.toBe(1)
    expect(state.form.reason).not.toBe('Ready')
  },
)
it('rejects a response for another project instead of showing its data', async () => {
  vi.mocked(pageDeliveriesApi.get).mockResolvedValue({ ...saved, projectId: 'other' })
  const { state } = await render('home')
  expect(state.current.value).toBeUndefined()
  expect(state.unavailable.value).toBe(true)
})
it('candidate search is bounded and suppresses late earlier search results', async () => {
  const { state } = await render('home'),
    late = deferred<ReturnType<typeof pager<{ userId: string; name: string }>>>()
  vi.mocked(pageDeliveriesApi.candidates)
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce(pager([{ userId: 'new', name: 'New' }]))
  state.searchCandidates('old')
  state.searchCandidates('new')
  await flushPromises()
  late.resolve(pager([{ userId: 'old', name: 'Old' }]))
  await flushPromises()
  expect(state.candidates.value).toEqual([{ userId: 'new', name: 'New' }])
  state.candidatePage(2)
  await flushPromises()
  expect(pageDeliveriesApi.candidates).toHaveBeenLastCalledWith(
    'v1',
    { revisionId: 'fixed-old', keyword: 'new', pageIndex: 1, pageSize: 20 },
    expect.anything(),
  )
})
it('viewer project access remains read-only and does not enumerate assignees', async () => {
  const { state, current } = await render()
  current.value = {
    ...scope,
    project: {
      ...scope.project,
      role: 'viewer',
      capabilities: { ...scope.project.capabilities!, edit: false },
    },
  }
  state.selectPage('home')
  await flushPromises()
  state.form.state = 'READY'
  state.save()
  expect(state.canEdit.value).toBe(false)
  expect(pageDeliveriesApi.save).not.toHaveBeenCalled()
  expect(pageDeliveriesApi.candidates).not.toHaveBeenCalled()
})
