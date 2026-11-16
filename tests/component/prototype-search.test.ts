import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useSession } from '@/app/stores/session'
import { usePrototypeSearch } from '@/modules/protohub-manager-ui/hooks/usePrototypeSearch'
import { prototypeSearchApi } from '@/modules/protohub-manager-ui/api/search'
import type { PrototypeSearchPage, SearchScope } from '@/modules/protohub-manager-ui/types/search'
import { hookHarness } from '../fixtures/hook-harness'
vi.mock('@/modules/protohub-manager-ui/api/search', () => ({
  prototypeSearchApi: { query: vi.fn() },
}))
const wrappers: VueWrapper[] = []
const empty = { data: [], total: 0, pageIndex: 0, pageSize: 20 }
beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const session = useSession()
  session.user = { id: 'u1', name: 'User', username: 'user' }
  session.permissions = new Set(['prototype-hub-version:query'])
  vi.mocked(prototypeSearchApi.query).mockResolvedValue(empty)
})
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))
function setup() {
  const scope = ref<SearchScope | null>({ projectId: 'p1' })
  let state!: ReturnType<typeof usePrototypeSearch>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = usePrototypeSearch(scope)
      }),
    ),
  )
  return { state, scope, session: useSession() }
}
it('submits trimmed text, keeps draft edits separate from paging, and resets pages on scope/type changes', async () => {
  const { state, scope } = setup()
  state.keyword.value = '  collected copy  '
  expect(state.submit()).toBe(true)
  await flushPromises()
  expect(prototypeSearchApi.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ keyword: 'collected copy', projectId: 'p1', pageIndex: 0 }),
    expect.anything(),
  )
  state.keyword.value = 'unsubmitted'
  state.paginate(3, 20)
  await flushPromises()
  expect(prototypeSearchApi.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ keyword: 'collected copy', pageIndex: 2 }),
    expect.anything(),
  )
  state.type.value = 'MATERIAL'
  await flushPromises()
  expect(prototypeSearchApi.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'MATERIAL', pageIndex: 0 }),
    expect.anything(),
  )
  scope.value = { revisionId: 'r1' }
  await flushPromises()
  expect(prototypeSearchApi.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ revisionId: 'r1', pageIndex: 0 }),
    expect.anything(),
  )
})
it('aborts earlier search and rejects its stale result after a scope change', async () => {
  let finish!: (value: PrototypeSearchPage) => void
  vi.mocked(prototypeSearchApi.query).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { state, scope } = setup()
  state.keyword.value = 'private'
  state.submit()
  const signal = vi.mocked(prototypeSearchApi.query).mock.calls[0]![1]!.signal
  scope.value = { projectId: 'p2' }
  await flushPromises()
  expect(signal!.aborted).toBe(true)
  finish({ ...empty, total: 999 })
  await flushPromises()
  expect(state.resource.data.value?.total).toBe(0)
})
it('clears prior content and pending requests on identity/permission changes; never calls search without access or valid scope', async () => {
  const { state, scope, session } = setup()
  state.keyword.value = 'sensitive'
  state.submit()
  await flushPromises()
  session.permissions = new Set()
  await flushPromises()
  expect(state.keyword.value).toBe('')
  expect(state.submitted.value).toBe('')
  expect(state.resource.data.value).toBeUndefined()
  const calls = vi.mocked(prototypeSearchApi.query).mock.calls.length
  state.keyword.value = 'blocked'
  state.submit()
  await flushPromises()
  scope.value = null
  await flushPromises()
  expect(prototypeSearchApi.query).toHaveBeenCalledTimes(calls)
})
it('validates blank and overlong input inline and exposes server errors with recoverable retry', async () => {
  const { state } = setup()
  for (const keyword of ['  ', 'a'.repeat(101)]) {
    state.keyword.value = keyword
    expect(state.submit()).toBe(false)
    await flushPromises()
    expect(state.invalid.value).not.toBe('')
  }
  expect(prototypeSearchApi.query).not.toHaveBeenCalled()
  vi.mocked(prototypeSearchApi.query).mockRejectedValueOnce(new Error('Service unavailable'))
  state.keyword.value = 'valid'
  state.submit()
  await flushPromises()
  expect(state.resource.error.value).toBe('Service unavailable')
  await state.resource.load()
  expect(state.resource.error.value).toBe('')
  expect(state.resource.data.value).toEqual(empty)
})
