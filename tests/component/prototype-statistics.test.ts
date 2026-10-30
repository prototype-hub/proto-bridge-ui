import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { useSession } from '@/app/stores/session'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import StatisticsView from '@/modules/protohub-manager-ui/views/statistics/index.vue'
import VisitTrend from '@/modules/protohub-manager-ui/views/statistics/components/VisitTrend.vue'
import { useShareVisit } from '@/modules/protohub-manager-ui/views/share/hooks/useShareVisit'
import { fixtureStatistics } from '../fixtures/statistics'
import { hookHarness } from '../fixtures/hook-harness'
import type { PublicShare, PrototypeStatistics } from '@/modules/protohub-manager-ui/types'

vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { post: vi.fn(), get: vi.fn() } }))
const wrappers: VueWrapper[] = []
const response = <T>(result: T) => ({ success: true, status: 200, result })
const fixture = () => fixtureStatistics(7, Date.UTC(2026, 9, 31, 4))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.setLocaleMessage('zh', { ...i18n.global.messages.value.zh, proto: protoLocales.zh })
  i18n.global.setLocaleMessage('en', { ...i18n.global.messages.value.en, proto: protoLocales.en })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.mocked(request.get).mockResolvedValue(response(fixture()))
  vi.mocked(publicRequest.post).mockResolvedValue(response(true))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function view(path = '/prototype-hub/statistics') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSession()
  session.user = { id: 'u1', username: 'user', name: 'User' }
  session.permissions = new Set([
    'prototype-hub-project:query',
    'prototype-hub-version:query',
    'prototype-hub-share:query',
  ])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/prototype-hub/statistics', component: { render: () => h('div') } },
      {
        path: '/prototype-hub/projects/:id',
        name: 'project-detail',
        component: { render: () => h('div') },
      },
      { path: '/', component: { render: () => h('div') } },
    ],
  })
  await router.push(path)
  const wrapper = mount(StatisticsView, {
    global: { plugins: [pinia, router, i18n], stubs: { ASkeleton: true } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, session, router }
}
it('uses server totals, collected history and real project drill-downs', async () => {
  const { wrapper } = await view()
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/statistics',
    { days: 7 },
    expect.objectContaining({ silent: true }),
  )
  expect(wrapper.findAll('dd').map((node) => node.text())).toEqual(['1', '1', '2', '18'])
  expect(wrapper.text()).toContain('此前历史未采集')
  expect(wrapper.get('a[href="/prototype-hub/projects/p1?focus=shares"]').text()).toBe('管理分享')
  expect(wrapper.get('.visit-trend svg').attributes('role')).toBe('img')
  expect(wrapper.findAll('tbody tr')).toHaveLength(7)
  expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('未采集')
})
it('switches the reporting period through the existing route and requests that window', async () => {
  const { wrapper, router } = await view()
  await wrapper.findAll('input[type="radio"]')[1]!.setValue(true)
  await flushPromises()
  expect(router.currentRoute.value.query.days).toBe('30')
  expect(request.get).toHaveBeenLastCalledWith(
    '/prototype-hub/statistics',
    { days: 30 },
    expect.anything(),
  )
})
it('shows omitted permissions as unauthorized, never as fake zero metrics', async () => {
  vi.mocked(request.get).mockResolvedValue(
    response({
      ...fixture(),
      versionCount: null,
      shareCount: null,
      visits: null,
      trend: null,
      ranking: null,
    }),
  )
  const { wrapper } = await view()
  expect(wrapper.findAll('dd').map((node) => node.text())).toEqual([
    '1',
    '未授权',
    '未授权',
    '未授权',
  ])
  expect(wrapper.find('.visit-trend svg').exists()).toBe(false)
  expect(wrapper.text()).toContain('需要分享查询权限')
})
it('clears old aggregates immediately when query permission is revoked', async () => {
  const { wrapper, session } = await view()
  session.permissions = new Set()
  await flushPromises()
  expect(wrapper.find('dl').exists()).toBe(false)
  expect(wrapper.text()).toContain('暂无统计访问权限')
  expect(request.get).toHaveBeenCalledTimes(1)
})
it('a delayed old period cannot overwrite the latest selected window', async () => {
  const { wrapper, router } = await view()
  const thirty = deferred<ReturnType<typeof response<PrototypeStatistics>>>()
  const seven = deferred<ReturnType<typeof response<PrototypeStatistics>>>()
  vi.mocked(request.get).mockReturnValueOnce(thirty.promise).mockReturnValueOnce(seven.promise)
  await router.replace({ query: { days: '30' } })
  await flushPromises()
  expect(wrapper.find('dl').exists()).toBe(false)
  await router.replace({ query: { days: '7' } })
  await flushPromises()
  thirty.resolve(response({ ...fixture(), visits: 999 }))
  await flushPromises()
  expect(wrapper.find('dl').exists()).toBe(false)
  seven.resolve(response({ ...fixture(), visits: 3 }))
  await flushPromises()
  expect(wrapper.findAll('dd').at(-1)!.text()).toBe('3')
})
it('identity changes hide old statistics while a new scoped response is pending', async () => {
  const { wrapper, session } = await view()
  const current = deferred<ReturnType<typeof response<PrototypeStatistics>>>()
  vi.mocked(request.get).mockReturnValueOnce(current.promise)
  session.user = { id: 'u2', username: 'second', name: 'Second' }
  await flushPromises()
  expect(wrapper.find('dl').exists()).toBe(false)
  expect(wrapper.find('.statistics-rank-list').exists()).toBe(false)
  current.resolve(
    response({
      ...fixture(),
      projectCount: 0,
      versionCount: 0,
      shareCount: 0,
      visits: 0,
      ranking: [],
    }),
  )
  await flushPromises()
  expect(wrapper.findAll('dd').map((node) => node.text())).toEqual(['0', '0', '0', '0'])
})
it('does not replace service errors with a misleading empty state', async () => {
  vi.mocked(request.get).mockRejectedValue(new ApiError('Unavailable', 503))
  const { wrapper } = await view()
  expect(wrapper.text()).toContain('统计暂不可用')
  expect(wrapper.text()).toContain('Unavailable')
  expect(wrapper.find('dl').exists()).toBe(false)
})
it('shows a useful empty-project action without drawing an empty chart', async () => {
  vi.mocked(request.get).mockResolvedValue(
    response({
      ...fixture(),
      projectCount: 0,
      versionCount: 0,
      shareCount: 0,
      visits: 0,
      trend: [],
      ranking: [],
    }),
  )
  const { wrapper } = await view()
  expect(wrapper.text()).toContain('当前没有可访问的项目')
  expect(wrapper.find('.visit-trend svg').exists()).toBe(false)
})
it('renders English definitions and null daily values independently of actual zero', async () => {
  i18n.global.locale.value = 'en'
  const { wrapper } = await view()
  expect(wrapper.text()).toContain('Logical versions')
  expect(wrapper.text()).toContain('Not collected')
  expect(wrapper.text()).toContain('not unique visitors')
})
it('keeps all-uncollected and actual zero chart states distinct', () => {
  const props = { dateLabel: (date: string) => date, numberLabel: String }
  const uncollected = mount(VisitTrend, {
    props: { ...props, points: [{ date: '2026-10-30', visits: null }] },
    global: { plugins: [i18n] },
  })
  const zero = mount(VisitTrend, {
    props: { ...props, points: [{ date: '2026-10-30', visits: 0 }] },
    global: { plugins: [i18n] },
  })
  wrappers.push(uncollected, zero)
  expect(uncollected.text()).toContain('尚未开始采集')
  expect(zero.text()).toContain('已开始采集')
  expect(zero.find('svg').exists()).toBe(false)
})

const granted = (): PublicShare => ({
  token: 'open',
  accessKey: 'grant',
  revisionId: 'r1',
  revisionMode: 'fixed',
  projectName: 'Project',
  versionName: 'V1',
  passwordRequired: false,
  visitTicket: 'opaque-ticket',
})
function visit() {
  const share = ref<PublicShare | undefined>(granted())
  let state!: ReturnType<typeof useShareVisit>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useShareVisit(share)
      }),
    ),
  )
  return { share, state }
}
it('acknowledges once per outer grant after readiness, not on setup or page switches', async () => {
  const { state } = visit()
  expect(publicRequest.post).not.toHaveBeenCalled()
  state.opened()
  state.opened()
  await flushPromises()
  expect(publicRequest.post).toHaveBeenCalledTimes(1)
  expect(publicRequest.post).toHaveBeenCalledWith(
    '/prototype-hub/public/shares/open/grant/revisions/r1/visits',
    { ticket: 'opaque-ticket' },
    expect.objectContaining({ silent: true }),
  )
})
it('a refreshed grant can record a new opening while a password form cannot', async () => {
  const { state, share } = visit()
  share.value = { ...granted(), accessKey: undefined, visitTicket: null }
  await flushPromises()
  state.opened()
  expect(publicRequest.post).not.toHaveBeenCalled()
  share.value = granted()
  await flushPromises()
  state.opened()
  await flushPromises()
  share.value = { ...granted(), visitTicket: 'new-ticket' }
  await flushPromises()
  state.opened()
  expect(publicRequest.post).toHaveBeenCalledTimes(2)
})
it('retries a transient failure only once with the original ticket and aborts on grant changes', async () => {
  vi.useFakeTimers()
  vi.mocked(publicRequest.post).mockRejectedValue(new ApiError('Unavailable', 503))
  const { state, share } = visit()
  state.opened()
  await vi.advanceTimersByTimeAsync(1500)
  expect(publicRequest.post).toHaveBeenCalledTimes(2)
  expect(vi.mocked(publicRequest.post).mock.calls[1]![1]).toEqual({ ticket: 'opaque-ticket' })
  share.value = { ...granted(), visitTicket: 'another-ticket' }
  await vi.advanceTimersByTimeAsync(0)
  state.opened()
  await vi.advanceTimersByTimeAsync(0)
  const signal = vi.mocked(publicRequest.post).mock.calls.at(-1)![2]!.signal
  share.value = undefined
  await vi.advanceTimersByTimeAsync(3000)
  expect(signal?.aborted).toBe(true)
  expect(publicRequest.post).toHaveBeenCalledTimes(3)
})
it('does not retry expired or rejected tickets', async () => {
  vi.useFakeTimers()
  vi.mocked(publicRequest.post).mockRejectedValue(new ApiError('Expired', 403))
  const { state } = visit()
  state.opened()
  await vi.advanceTimersByTimeAsync(10000)
  expect(publicRequest.post).toHaveBeenCalledTimes(1)
})
