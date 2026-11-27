import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { revisionApprovalApi as api } from '@/modules/protohub-manager-ui/api/revision-approval'
import {
  useRevisionApproval,
  approvalAllowed,
  type ApprovalScope,
} from '@/modules/protohub-manager-ui/hooks/useRevisionApproval'
import type { RevisionApproval } from '@/modules/protohub-manager-ui/types/revision-approval'
import { ApiError } from '@/shared/api/errors'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ownerProjectAccess } from '../fixtures/project-access'
import { hookHarness } from '../fixtures/hook-harness'
const credential = vi.hoisted(() => ({ value: 'one' }))
vi.mock('@/shared/auth/token', () => ({ token: { get: () => credential.value } }))
vi.mock('@/modules/protohub-manager-ui/api/revision-approval', () => ({
  revisionApprovalApi: { get: vi.fn(), act: vi.fn(), history: vi.fn() },
}))
const wrappers: VueWrapper[] = []
const scope: ApprovalScope = {
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
    id: 'old',
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
const empty: RevisionApproval = {
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'old',
  configVersion: 0,
  approved: false,
  published: false,
  approval: null,
  publication: null,
  revision: {
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 2,
    totalBytes: 100,
    createTime: 1,
  },
}
async function render() {
  const current = ref<ApprovalScope | undefined>(structuredClone(scope)),
    edit = ref(true),
    read = ref(true)
  let state!: ReturnType<typeof useRevisionApproval>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useRevisionApproval(current)
      }),
      {
        global: {
          provide: {
            [permissionKey]: {
              can: (p: string) => (p.endsWith(':save') ? edit.value : read.value),
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, current, edit, read }
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
  credential.value = 'one'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.mocked(api.get).mockResolvedValue(structuredClone(empty))
  vi.mocked(api.history).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 10 })
})
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))
it('enables only legal formal transitions', () => {
  expect(
    ['approve', 'revoke', 'publish', 'withdraw'].map((action) =>
      approvalAllowed(empty, action as 'approve'),
    ),
  ).toEqual([true, false, false, false])
  const approved = { ...empty, approved: true }
  expect(approvalAllowed(approved, 'publish')).toBe(true)
  expect(approvalAllowed(approved, 'revoke')).toBe(true)
  expect(approvalAllowed({ ...approved, published: true }, 'withdraw')).toBe(true)
  expect(approvalAllowed({ ...approved, published: true }, 'publish')).toBe(false)
})
it('reads an exact old revision and loads history only on demand with server paging', async () => {
  const { state } = await render()
  expect(api.get).toHaveBeenCalledWith('v1', 'old', expect.anything())
  expect(api.history).not.toHaveBeenCalled()
  state.historyOpen.value = true
  await flushPromises()
  state.page(3)
  await flushPromises()
  expect(api.history).toHaveBeenLastCalledWith(
    'v1',
    'old',
    { pageIndex: 2, pageSize: 10 },
    expect.anything(),
  )
})
it('sends only the four fixed-contract fields and clears note after acknowledged completion', async () => {
  const { state } = await render()
  state.note.value = 'Approved'
  vi.mocked(api.act).mockResolvedValue({ ...empty, approved: true, configVersion: 1 })
  await state.act('approve')
  const body = vi.mocked(api.act).mock.calls[0]![2]
  expect(Object.keys(body).sort()).toEqual(['action', 'clientRequestId', 'expectedVersion', 'note'])
  expect(body).toMatchObject({ action: 'approve', expectedVersion: 0, note: 'Approved' })
  expect(state.note.value).toBe('')
  expect(state.current.value?.approved).toBe(true)
})
it('retains the exact original request after unknown, GET does not acknowledge it, replay adopts current state', async () => {
  const { state } = await render()
  state.note.value = 'Exact note'
  vi.mocked(api.act).mockRejectedValueOnce(new ApiError('lost', 503))
  await state.act('approve')
  const original = vi.mocked(api.act).mock.calls[0]![2]
  expect(state.unknown.value).toBe(true)
  expect(Object.isFrozen(original)).toBe(true)
  vi.mocked(api.get).mockResolvedValue({ ...empty, approved: true, configVersion: 1 })
  await state.load()
  expect(state.unknown.value).toBe(true)
  state.note.value = 'Changed programmatically'
  vi.mocked(api.act).mockResolvedValue({ ...empty, configVersion: 4 })
  await state.retry()
  expect(vi.mocked(api.act).mock.calls[1]![2]).toBe(original)
  expect(state.current.value?.approved).toBe(false)
  expect(state.unknown.value).toBe(false)
})
it('keeps notes on CAS conflict and requires explicit refresh before a new key', async () => {
  const { state } = await render()
  state.note.value = 'Keep'
  vi.mocked(api.act).mockRejectedValueOnce(new ApiError('conflict', 409))
  await state.act('approve')
  expect(state.conflict.value).toBe(true)
  expect(state.note.value).toBe('Keep')
  await state.act('approve')
  expect(api.act).toHaveBeenCalledTimes(1)
  vi.mocked(api.get).mockResolvedValue({ ...empty, configVersion: 2 })
  await state.load()
  expect(state.conflict.value).toBe(false)
  expect(state.note.value).toBe('Keep')
  vi.mocked(api.act).mockResolvedValue({ ...empty, configVersion: 3, approved: true })
  await state.act('approve')
  expect(vi.mocked(api.act).mock.calls[1]![2].expectedVersion).toBe(2)
  expect(vi.mocked(api.act).mock.calls[1]![2].clientRequestId).not.toBe(
    vi.mocked(api.act).mock.calls[0]![2].clientRequestId,
  )
})
it('does not submit invalid notes or illegal publish', async () => {
  const { state } = await render()
  await state.act('publish')
  state.note.value = 'x'.repeat(2001)
  await state.act('approve')
  expect(api.act).not.toHaveBeenCalled()
  expect(state.invalid.value).toBeTruthy()
})
it('clears sensitive drafts and pending requests on EDIT loss', async () => {
  const { state, edit } = await render()
  state.note.value = 'private'
  vi.mocked(api.act).mockRejectedValue(new ApiError('lost', 503))
  await state.act('approve')
  edit.value = false
  await flushPromises()
  expect(state.note.value).toBe('')
  expect(state.unknown.value).toBe(false)
  expect(state.canEdit.value).toBe(false)
  await state.retry()
  expect(api.act).toHaveBeenCalledTimes(1)
})
it('clears state and ignores an old write after fixed revision changes', async () => {
  const { state, current } = await render()
  const result = deferred<RevisionApproval>()
  vi.mocked(api.act).mockReturnValue(result.promise)
  const write = state.act('approve')
  vi.mocked(api.get).mockResolvedValue({ ...empty, revisionId: 'new' })
  current.value = { ...scope, revision: { ...scope.revision, id: 'new' } }
  await flushPromises()
  result.resolve({ ...empty, approved: true })
  await write
  expect(state.current.value?.revisionId).toBe('new')
  expect(state.current.value?.approved).toBe(false)
})
it('rejects cross-scope status and history instead of rendering it', async () => {
  vi.mocked(api.get).mockResolvedValue({ ...empty, projectId: 'other' })
  const { state } = await render()
  expect(state.unavailable.value).toBe(true)
  expect(state.current.value).toBeUndefined()
})
it('clears sensitive data when a response belongs to a replaced credential', async () => {
  const { state } = await render()
  const result = deferred<RevisionApproval>()
  vi.mocked(api.get).mockReturnValue(result.promise)
  const read = state.load()
  state.note.value = 'private'
  credential.value = 'two'
  result.resolve({ ...empty, approved: true })
  await read
  expect(state.current.value).toBeUndefined()
  expect(state.note.value).toBe('')
  expect(state.unavailable.value).toBe(true)
})
it('retains note on an ordinary rejected action without falsely entering unknown', async () => {
  const { state } = await render()
  state.note.value = 'retain'
  vi.mocked(api.act).mockRejectedValue(new ApiError('bad', 400))
  await state.act('approve')
  expect(state.note.value).toBe('retain')
  expect(state.unknown.value).toBe(false)
})
it('READ loss clears current state and blocks new reads', async () => {
  const { state, read } = await render()
  read.value = false
  await flushPromises()
  expect(state.current.value).toBeUndefined()
  expect(state.unavailable.value).toBe(true)
  const count = vi.mocked(api.get).mock.calls.length
  await state.load()
  expect(api.get).toHaveBeenCalledTimes(count)
})

it('rejects invalid or out-of-contract history cursors without a request', async () => {
  const { state } = await render()
  state.historyOpen.value = true
  await flushPromises()
  const count = vi.mocked(api.history).mock.calls.length
  for (const n of [0, -1, 1.5, 10002, Number.NaN]) state.page(n)
  await flushPromises()
  expect(api.history).toHaveBeenCalledTimes(count)
  state.page(10001)
  await flushPromises()
  expect(api.history).toHaveBeenLastCalledWith(
    'v1',
    'old',
    { pageIndex: 10000, pageSize: 10 },
    expect.anything(),
  )
})

it('does not retry a pending original request under a replaced credential', async () => {
  const { state } = await render()
  vi.mocked(api.act).mockRejectedValue(new ApiError('lost', 503))
  await state.act('approve')
  expect(state.unknown.value).toBe(true)
  credential.value = 'two'
  await state.retry()
  expect(api.act).toHaveBeenCalledTimes(1)
  expect(state.unknown.value).toBe(false)
  expect(state.current.value).toBeUndefined()
  expect(state.unavailable.value).toBe(true)
})
it('clears idle sensitive state when the browser regains focus with another credential', async () => {
  const { state } = await render()
  state.note.value = 'private'
  credential.value = 'two'
  window.dispatchEvent(new Event('focus'))
  expect(state.current.value).toBeUndefined()
  expect(state.note.value).toBe('')
  expect(state.unavailable.value).toBe(true)
})
