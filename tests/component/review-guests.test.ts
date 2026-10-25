import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { reviewGuestsApi } from '@/modules/protohub-manager-ui/api/review-guest'
import { useReviewGuests } from '@/modules/protohub-manager-ui/views/project/hooks/useReviewGuests'
import ReviewGuestsDrawer from '@/modules/protohub-manager-ui/views/project/components/ReviewGuestsDrawer.vue'
import ProjectDetail from '@/modules/protohub-manager-ui/views/project/detail/index.vue'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { Project, ReviewGuest } from '@/modules/protohub-manager-ui/types'
import type { PageResult } from '@/shared/api/types'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'

vi.mock('@/modules/protohub-manager-ui/api/review-guest', () => ({
  reviewGuestsApi: { query: vi.fn(), setEnabled: vi.fn() },
}))
vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const project: Project = {
  id: 'p1',
  name: 'Project',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
}
const guest: ReviewGuest = {
  id: 'g1',
  displayName: 'Visitor',
  company: 'Self declared',
  maskedEmail: 'v***@example.invalid',
  verificationLevel: 'email',
  enabled: true,
  configVersion: 3,
  createTime: 1,
  modifyTime: 2,
}
const result = (data = [guest], total = data.length): PageResult<ReviewGuest> => ({
  data,
  total,
  pageIndex: 0,
  pageSize: 20,
})
const wrappers: VueWrapper[] = []
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
function setup(grants = [p.share.query, p.share.save] as string[], initial = project) {
  const selected = ref<Project | undefined>(structuredClone(initial))
  const open = ref(true)
  const allowed = ref(grants)
  let state!: ReturnType<typeof useReviewGuests>
  const wrapper = mount(
    hookHarness(() => {
      state = useReviewGuests(selected, open)
    }),
    {
      global: {
        provide: {
          [permissionKey]: {
            can: (value: string | string[]) => allowed.value.includes(String(value)),
          },
        },
      },
    },
  )
  wrappers.push(wrapper)
  return { wrapper, state, selected, open, allowed }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(reviewGuestsApi.query).mockReset().mockResolvedValue(result())
  vi.mocked(reviewGuestsApi.setEnabled)
    .mockReset()
    .mockResolvedValue({ ...guest, enabled: false, configVersion: 4 })
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
it('intersects project SHARE with query and save actions and discards rows when access is lost', async () => {
  const { state, allowed } = setup([])
  expect(reviewGuestsApi.query).not.toHaveBeenCalled()
  allowed.value = [p.share.query]
  await flushPromises()
  expect(state.rows.value).toEqual([guest])
  await state.setEnabled(state.rows.value[0]!)
  expect(reviewGuestsApi.setEnabled).not.toHaveBeenCalled()
  allowed.value = [p.share.query, p.share.save]
  await flushPromises()
  expect(state.editable.value).toBe(true)
  allowed.value = [p.share.save]
  expect(state.rows.value).toEqual([])
  expect(state.editable.value).toBe(false)
  const viewer = setup([p.share.query, p.share.save], {
    ...project,
    capabilities: { ...project.capabilities, manageShares: false },
  })
  await flushPromises()
  expect(viewer.state.rows.value).toEqual([])
  expect(viewer.state.readable.value).toBe(false)
})
it('uses zero-based real pagination and ignores old page responses even when abort is not honored', async () => {
  const late = deferred<PageResult<ReviewGuest>>()
  vi.mocked(reviewGuestsApi.query).mockReturnValueOnce(late.promise)
  const { state } = setup()
  const firstSignal = vi.mocked(reviewGuestsApi.query).mock.calls[0]![2]!.signal as AbortSignal
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce({ ...result([], 25), pageIndex: 1 })
  state.page(2)
  expect(firstSignal.aborted).toBe(true)
  await flushPromises()
  expect(reviewGuestsApi.query).toHaveBeenLastCalledWith(
    'p1',
    { pageIndex: 1, pageSize: 20 },
    expect.anything(),
  )
  late.resolve(result([guest], 99))
  await flushPromises()
  expect(state.rows.value).toEqual([])
  expect(state.total.value).toBe(25)
  expect(state.pageIndex.value).toBe(1)
})
it('submits the visible row CAS, refreshes on 409 and never retries the mutation', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(reviewGuestsApi.setEnabled).mockRejectedValueOnce(new ApiError('conflict', 409))
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(
    result([{ ...guest, enabled: false, configVersion: 4 }]),
  )
  await state.setEnabled(state.rows.value[0]!)
  expect(reviewGuestsApi.setEnabled).toHaveBeenCalledExactlyOnceWith(
    'p1',
    'g1',
    false,
    3,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(reviewGuestsApi.query).toHaveBeenCalledTimes(2)
  expect(state.notice.value).toBe(protoLocales.zh.reviewGuestConflict)
  expect(state.rows.value[0]).toMatchObject({ enabled: false, configVersion: 4 })
  expect(state.busy.value).toBe(false)
})
it('refreshes after a successful change and rejects an old confirmation snapshot', async () => {
  const { state } = setup()
  await flushPromises()
  const original = state.rows.value[0]!
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(
    result([{ ...guest, enabled: false, configVersion: 4 }]),
  )
  await state.setEnabled(original)
  expect(state.notice.value).toBe(protoLocales.zh.reviewGuestUpdated)
  await state.setEnabled(original)
  expect(reviewGuestsApi.setEnabled).toHaveBeenCalledOnce()
})
it('aborts mutations on project change and does not let late success refresh or populate the new project', async () => {
  const { state, selected } = setup()
  await flushPromises()
  const late = deferred<ReviewGuest>()
  vi.mocked(reviewGuestsApi.setEnabled).mockReturnValueOnce(late.promise)
  const changing = state.setEnabled(state.rows.value[0]!)
  const signal = vi.mocked(reviewGuestsApi.setEnabled).mock.calls[0]![4]!.signal as AbortSignal
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(result([], 0))
  selected.value = { ...project, id: 'p2' }
  expect(signal.aborted).toBe(true)
  await flushPromises()
  late.resolve({ ...guest, enabled: false })
  await changing
  expect(state.rows.value).toEqual([])
  expect(state.notice.value).toBe('')
  expect(reviewGuestsApi.query).toHaveBeenCalledTimes(2)
})
it('clears the visible visitor list when a mutation loses project authorization', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(reviewGuestsApi.setEnabled).mockRejectedValueOnce(new ApiError('denied', 403))
  await state.setEnabled(state.rows.value[0]!)
  expect(state.rows.value).toEqual([])
  expect(state.error.value).toBe(protoLocales.zh.reviewGuestsAccessChanged)
  expect(state.busy.value).toBe(false)
  expect(reviewGuestsApi.setEnabled).toHaveBeenCalledOnce()
  expect(reviewGuestsApi.query).toHaveBeenCalledOnce()
})
it('clears and cancels on close and unmount; query and ambiguous write errors remain explicit without retry', async () => {
  vi.mocked(reviewGuestsApi.query).mockRejectedValueOnce(new Error('untrusted raw detail'))
  const { state, open, wrapper } = setup()
  await flushPromises()
  expect(state.error.value).toBe(protoLocales.zh.reviewGuestsUnavailable)
  await state.load()
  vi.mocked(reviewGuestsApi.setEnabled).mockRejectedValueOnce(new Error('untrusted mailbox'))
  await state.setEnabled(state.rows.value[0]!)
  expect(state.notice.value).toBe(protoLocales.zh.reviewGuestUpdateFailed)
  expect(reviewGuestsApi.setEnabled).toHaveBeenCalledOnce()
  const late = deferred<PageResult<ReviewGuest>>()
  vi.mocked(reviewGuestsApi.query).mockReturnValueOnce(late.promise)
  const loading = state.load()
  const signal = vi.mocked(reviewGuestsApi.query).mock.calls.at(-1)![2]!.signal as AbortSignal
  open.value = false
  expect(signal.aborted).toBe(true)
  expect(state.rows.value).toEqual([])
  wrapper.unmount()
  wrappers.splice(wrappers.indexOf(wrapper), 1)
  late.resolve(result())
  await loading
  expect(state.rows.value).toEqual([])
  expect(state.loading.value).toBe(false)
})
it('renders masked identity, enabled state and honest verification copy, with read-only actions omitted', async () => {
  const grants = ref<string[]>([p.share.query])
  const wrapper = mount(ReviewGuestsDrawer, {
    props: { open: true, project },
    attachTo: document.body,
    global: {
      plugins: [i18n],
      provide: {
        [permissionKey]: { can: (permission: string) => grants.value.includes(permission) },
      },
      stubs: { ADrawer: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.get('[role="dialog"]').attributes()).toMatchObject({
    'aria-modal': 'true',
    'aria-label': protoLocales.zh.reviewGuests,
  })
  expect(wrapper.text()).toContain(guest.maskedEmail!)
  expect(wrapper.text()).toContain(protoLocales.zh.reviewGuestEnabled)
  expect(wrapper.text()).toContain(protoLocales.zh.reviewEmailVerified)
  expect(wrapper.text()).toContain(protoLocales.zh.reviewGuestsHint)
  expect(wrapper.findComponent({ name: 'ActionButton' }).exists()).toBe(false)
  grants.value = [p.share.query, p.share.save]
  await flushPromises()
  await wrapper.get(`button[aria-label="${protoLocales.zh.reviewGuestDisable}"]`).trigger('click')
  await vi.waitFor(() =>
    expect(wrapper.get('[role="dialog"] .ant-popconfirm-message-title').text()).toBe(
      protoLocales.zh.reviewGuestDisableConfirm,
    ),
  )
  expect(reviewGuestsApi.setEnabled).not.toHaveBeenCalled()
  await wrapper.setProps({ open: false })
  await flushPromises()
  expect(wrapper.text()).not.toContain(guest.maskedEmail!)
  expect(document.querySelector('.ant-popconfirm-message-title')).toBeNull()
})
it('shows retry and empty states without confusing an empty result with a load failure', async () => {
  vi.mocked(reviewGuestsApi.query).mockRejectedValueOnce(new ApiError('denied', 403))
  const wrapper = mount(ReviewGuestsDrawer, {
    props: { open: true, project },
    global: {
      plugins: [i18n],
      provide: { [permissionKey]: { can: () => true } },
      stubs: { ADrawer: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.text()).toContain(protoLocales.zh.reviewGuestsAccessChanged)
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(result([], 0))
  const state = wrapper.findComponent({ name: 'LoadState' })
  state.vm.$emit('retry')
  await flushPromises()
  expect(wrapper.text()).not.toContain(protoLocales.zh.reviewGuestsAccessChanged)
  expect(wrapper.find('.ant-empty').exists()).toBe(true)
})
it('shows the project entry only when share query and project SHARE both apply', async () => {
  const scope = ref(true)
  const grants = ref<string[]>([p.project.query, p.share.query])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:id', component: { template: '<div />' } }],
  })
  await router.push('/projects/p1')
  vi.mocked(request.get).mockResolvedValue({ success: true, status: 200, result: project })
  const wrapper = mount(ProjectDetail, {
    global: {
      plugins: [createPinia(), router, i18n],
      provide: {
        [permissionKey]: {
          can: (permission: string) => scope.value && grants.value.includes(permission),
        },
      },
      stubs: {
        UploadDialog: true,
        ShareDialog: true,
        ProjectMembersDialog: true,
        RevisionHistoryDrawer: true,
        CapacityNotice: true,
        DataTable: true,
        PrototypeListToolbar: true,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.find(`button[aria-label="${protoLocales.zh.reviewGuests}"]`).exists()).toBe(true)
  grants.value = [p.project.query, p.share.save]
  await flushPromises()
  expect(wrapper.find(`button[aria-label="${protoLocales.zh.reviewGuests}"]`).exists()).toBe(false)
})
const unverifiedGuest = (): ReviewGuest => ({
  ...guest,
  id: 'low-g1',
  verificationLevel: 'unverified',
  maskedEmail: null,
  expiresAt: Date.now() + 8 * 3600000,
})
it('switches to a separate unverified page, resets pagination and rejects late email results', async () => {
  const late = deferred<PageResult<ReviewGuest>>()
  vi.mocked(reviewGuestsApi.query).mockReturnValueOnce(late.promise)
  const { state } = setup()
  const signal = vi.mocked(reviewGuestsApi.query).mock.calls[0]![2]!.signal as AbortSignal
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(result([unverifiedGuest()]))
  state.verificationLevel.value = 'unverified'
  expect(signal.aborted).toBe(true)
  expect(state.rows.value).toEqual([])
  await flushPromises()
  expect(reviewGuestsApi.query).toHaveBeenLastCalledWith(
    'p1',
    {
      pageIndex: 0,
      pageSize: 20,
      verificationLevel: 'unverified',
    },
    expect.anything(),
  )
  late.resolve(result([guest], 99))
  await flushPromises()
  expect(state.rows.value[0]?.verificationLevel).toBe('unverified')
  expect(state.total.value).toBe(1)
  expect(state.pageIndex.value).toBe(0)
})
it('targets unverified CAS explicitly and discards its late mutation after switching type', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(result([unverifiedGuest()]))
  state.verificationLevel.value = 'unverified'
  await flushPromises()
  const late = deferred<ReviewGuest>()
  vi.mocked(reviewGuestsApi.setEnabled).mockReturnValueOnce(late.promise)
  const changing = state.setEnabled(state.rows.value[0]!)
  const options = vi.mocked(reviewGuestsApi.setEnabled).mock.calls[0]![4]!
  expect(reviewGuestsApi.setEnabled).toHaveBeenCalledExactlyOnceWith(
    'p1',
    'low-g1',
    false,
    3,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
    'unverified',
  )
  state.verificationLevel.value = 'email'
  expect((options.signal as AbortSignal).aborted).toBe(true)
  await flushPromises()
  late.resolve({ ...unverifiedGuest(), enabled: false })
  await changing
  expect(state.rows.value).toEqual([guest])
  expect(state.notice.value).toBe('')
  expect(reviewGuestsApi.query).toHaveBeenCalledTimes(3)
})
it('does not enable an expired unverified row or extend a near-expired confirmation', async () => {
  vi.useFakeTimers()
  const { state } = setup()
  await flushPromises()
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(
    result([{ ...unverifiedGuest(), enabled: false, expiresAt: Date.now() + 1000 }]),
  )
  state.verificationLevel.value = 'unverified'
  await flushPromises()
  const visible = state.rows.value[0]!
  expect(state.isExpired(visible)).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  expect(state.isExpired(visible)).toBe(true)
  await state.setEnabled(visible)
  expect(reviewGuestsApi.setEnabled).not.toHaveBeenCalled()
  vi.useRealTimers()
})
it('refreshes unverified CAS conflicts without retrying and never promises OTP recovery', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(reviewGuestsApi.query).mockResolvedValue(result([unverifiedGuest()]))
  state.verificationLevel.value = 'unverified'
  await flushPromises()
  vi.mocked(reviewGuestsApi.setEnabled).mockRejectedValueOnce(new ApiError('Conflict', 409))
  await state.setEnabled(state.rows.value[0]!)
  expect(reviewGuestsApi.setEnabled).toHaveBeenCalledOnce()
  expect(state.notice.value).toBe(protoLocales.zh.reviewGuestConflict)
  await state.setEnabled(state.rows.value[0]!)
  expect(state.notice.value).toBe(protoLocales.zh.reviewUnverifiedGuestUpdated)
})
it('rejects mixed or incorrect verification types instead of labeling email rows as unverified', async () => {
  const { state } = setup()
  await flushPromises()
  state.verificationLevel.value = 'unverified'
  await flushPromises()
  expect(state.rows.value).toEqual([])
  expect(state.total.value).toBe(0)
  expect(state.error.value).toBe(protoLocales.zh.reviewGuestsUnavailable)
})
it('blocks an expired enabled identity and rechecks the wall clock before submitting without waiting for a timer tick', async () => {
  vi.useFakeTimers()
  const { state } = setup()
  await flushPromises()
  const deadline = Date.now() + 500
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(
    result([{ ...unverifiedGuest(), enabled: true, expiresAt: deadline }]),
  )
  state.verificationLevel.value = 'unverified'
  await flushPromises()
  const visible = state.rows.value[0]!
  expect(state.isExpired(visible)).toBe(false)
  vi.setSystemTime(deadline)
  await state.setEnabled(visible)
  expect(state.isExpired(visible)).toBe(true)
  expect(reviewGuestsApi.setEnabled).not.toHaveBeenCalled()
})
