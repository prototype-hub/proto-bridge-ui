import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import {
  safeWorkItemUrl,
  useWorkItems,
  type WorkItemsScope,
} from '@/modules/protohub-manager-ui/views/project/hooks/useWorkItems'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { WorkItem } from '@/modules/protohub-manager-ui/types'
import { ownerProjectAccess } from '../fixtures/project-access'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const wrappers: VueWrapper[] = []
const response = <T>(result: T) => ({ success: true, status: 200, result })
const scope: WorkItemsScope = {
  actorId: 'u1',
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
  version: {
    id: 'v1',
    projectId: 'p1',
    versionName: 'V1',
    entryFile: 'index.html',
    status: 'ready',
    createdBy: 'u1',
    createdAt: 1,
    runtimeBaseUrl: null,
    previewUrl: null,
    currentRevisionId: 'new-revision',
    revisionId: 'new-revision',
    revisionCount: 2,
    migrationRequired: false,
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
const row: WorkItem = {
  id: 'w1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed-old',
  pageId: 'home',
  url: 'https://example.com/tasks/1',
  note: '<script>literal</script>',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
}
function page(data: WorkItem[]) {
  return response({ data, total: data.length, pageIndex: 0, pageSize: 20 })
}
async function render(can = (_permission: string | string[]) => true) {
  const current = ref<WorkItemsScope | undefined>(structuredClone(scope))
  let state!: ReturnType<typeof useWorkItems>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useWorkItems(current)
      }),
      { global: { provide: { [permissionKey]: { can } } } },
    ),
  )
  await flushPromises()
  return { state, current }
}
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.mocked(request.get).mockResolvedValue(
    response([
      {
        name: 'Folder',
        folder: true,
        children: [
          { name: 'Home', pageId: 'home', path: 'index.html' },
          { name: 'Other', pageId: 'other', path: 'other.html' },
        ],
      },
    ]),
  )
  vi.mocked(request.post).mockResolvedValue(page([]))
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
it.each([
  'javascript:alert(1)',
  'data:text/html,hello',
  'https://user:password@example.com',
  'https://example.com/\npath',
  '/relative/path',
  'https://',
  'https://example.com/' + 'x'.repeat(2048),
])('rejects unsafe external URL %s', (value) => expect(safeWorkItemUrl(value)).toBe(false))
it('accepts ordinary HTTP and HTTPS external links', () => {
  expect(safeWorkItemUrl('https://example.com/tasks/1?q=hello#detail')).toBe(true)
  expect(safeWorkItemUrl('http://localhost:8080/work/2')).toBe(true)
})
it('reads and writes the explicit old revision, then reloads its persisted page', async () => {
  const { state } = await render()
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/revisions/fixed-old/pages',
    undefined,
    expect.anything(),
  )
  expect(state.pagesLoading.value).toBe(false)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/work-items/_query',
    { revisionId: 'fixed-old', pageId: 'home', pageIndex: 0, pageSize: 20 },
    expect.anything(),
  )
  vi.mocked(request.post)
    .mockResolvedValueOnce(response(row))
    .mockResolvedValueOnce(page([row]))
  state.edit()
  state.form.url = row.url
  state.form.note = row.note
  state.save()
  await flushPromises()
  const input = vi.mocked(request.post).mock.calls.at(-2)![1] as Record<string, unknown>
  expect(input).toMatchObject({
    revisionId: 'fixed-old',
    pageId: 'home',
    url: row.url,
    note: row.note,
  })
  expect(input.clientRequestId).toMatch(/^[\x21-\x7e]{1,128}$/)
  expect(state.editing.value).toBe(false)
  expect(state.rows.value).toEqual([row])
})
it('keeps the exact input and request ID for an unconfirmed write and never retries automatically', async () => {
  const { state } = await render()
  vi.mocked(request.post).mockRejectedValueOnce(new ApiError('lost response', 0))
  state.edit()
  state.form.url = row.url
  state.form.note = row.note
  state.save()
  await flushPromises()
  expect(state.unknown.value).toBe(true)
  expect(state.form.note).toBe(row.note)
  const sent = vi.mocked(request.post).mock.calls.at(-1)![1]
  const calls = vi.mocked(request.post).mock.calls.length
  state.save()
  state.selectPage('other')
  await flushPromises()
  expect(state.pageId.value).toBe('home')
  expect(request.post).toHaveBeenCalledTimes(calls)
  vi.mocked(request.post)
    .mockResolvedValueOnce(response(row))
    .mockResolvedValueOnce(page([row]))
  state.retry()
  await flushPromises()
  expect(vi.mocked(request.post).mock.calls.at(-2)![1]).toEqual(sent)
  expect(state.unknown.value).toBe(false)
})
it('preserves edits on conflict and only rebases after an explicit successful reread', async () => {
  const { state } = await render()
  state.edit(row)
  state.form.note = 'My unsaved input'
  vi.mocked(request.put).mockRejectedValueOnce(new ApiError('conflict', 409))
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  expect(state.form.note).toBe('My unsaved input')
  const calls = vi.mocked(request.put).mock.calls.length
  state.save()
  expect(request.put).toHaveBeenCalledTimes(calls)
  vi.mocked(request.post).mockResolvedValueOnce(
    page([{ ...row, configVersion: 3, note: 'Another member' }]),
  )
  await state.load(true)
  expect(state.form.note).toBe('My unsaved input')
  expect(state.original.value?.configVersion).toBe(3)
  expect(state.conflict.value).toBe(false)
  vi.mocked(request.put).mockResolvedValueOnce(
    response({ ...row, configVersion: 4, note: state.form.note }),
  )
  state.save()
  await flushPromises()
  expect(vi.mocked(request.put).mock.calls.at(-1)![1]).toMatchObject({
    expectedVersion: 3,
    note: 'My unsaved input',
  })
})
it('clears private rows and drafts when the actor or fixed scope changes and ignores late responses', async () => {
  const { state, current } = await render()
  let finish!: (value: ReturnType<typeof page>) => void
  vi.mocked(request.post).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const loading = state.load()
  const signal = vi.mocked(request.post).mock.calls.at(-1)![2]!.signal as AbortSignal
  state.edit(row)
  state.form.note = 'private draft'
  current.value = undefined
  expect(signal.aborted).toBe(true)
  expect(state.form.note).toBe('')
  expect(state.rows.value).toEqual([])
  finish(page([row]))
  await loading
  expect(state.rows.value).toEqual([])
})
it('keeps viewer access read only and performs no write even if a caller invokes save', async () => {
  const { state } = await render((permission) => String(permission).endsWith(':query'))
  expect(state.target.value).toBeDefined()
  expect(state.canEdit.value).toBe(false)
  state.edit(row)
  state.remove(row)
  state.save()
  await flushPromises()
  expect(state.editing.value).toBe(false)
  expect(vi.mocked(request.post).mock.calls.every(([path]) => path.endsWith('/_query'))).toBe(true)
  expect(request.put).not.toHaveBeenCalled()
})
it('rejects cross-page data and clears sensitive input on an access failure', async () => {
  const { state } = await render()
  state.edit(row)
  state.form.note = 'private draft'
  vi.mocked(request.post).mockResolvedValueOnce(page([{ ...row, pageId: 'another' }]))
  await state.load()
  expect(state.rows.value).toEqual([])
  expect(state.form.note).toBe('')
  expect(state.error.value).toBe(protoLocales.zh.workItemUnavailable)
})
it('unlinks with the observed optimistic version and no DELETE body ambiguity', async () => {
  const { state } = await render()
  vi.mocked(request.post).mockResolvedValueOnce(response(true)).mockResolvedValueOnce(page([]))
  state.remove(row)
  await flushPromises()
  expect(vi.mocked(request.post).mock.calls.at(-2)!.slice(0, 2)).toEqual([
    '/prototype-hub/versions/v1/work-items/w1/_delete',
    {
      revisionId: 'fixed-old',
      pageId: 'home',
      expectedVersion: 0,
      clientRequestId: expect.any(String),
    },
  ])
})

it('uses singular and plural English result, revision and file counts', () => {
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  i18n.global.locale.value = 'en'
  expect(i18n.global.t('proto.revisionCount', { count: 1 })).toBe('1 revision')
  expect(i18n.global.t('proto.revisionCount', { count: 2 })).toBe('2 revisions')
  expect(i18n.global.t('proto.listResults', { count: 1 })).toBe('1 item')
  expect(i18n.global.t('proto.historyFileCount', { count: 2 })).toBe('2 files')
})
