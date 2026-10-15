import { afterEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { shareValidity } from '@/modules/protohub-manager-ui/utils/share'
import { useShares } from '@/modules/protohub-manager-ui/views/project/hooks/useShares'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { copyText } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { Project, Share, Version } from '@/modules/protohub-manager-ui/types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: (path: string) => ({ href: `/tools${path}` }) }),
}))
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  sharesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({
  saved: vi.fn(),
  deleted: vi.fn(),
  copyText: vi.fn().mockResolvedValue(true),
}))
i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
const now = 1791806400000
const version: Version = {
  id: 'v1',
  projectId: 'p1',
  versionName: 'V1',
  entryFile: 'index.html',
  status: 'ready',
  createdBy: 'admin',
  createdAt: now,
  runtimeBaseUrl: '/runtime/',
  previewUrl: '/runtime/index.html',
}
const project: Project = {
  id: 'p1',
  name: '项目',
  createdBy: 'admin',
  createdAt: now,
  updatedAt: now,
}
const share: Share = {
  id: 's1',
  projectId: 'p1',
  versionId: 'v1',
  token: 'a/b',
  enabled: true,
  passwordRequired: false,
  createdAt: now,
  sharePath: '/share/a',
}
let scope: EffectScope | undefined
afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

it.each([
  [true, undefined, 'permanent'],
  [true, null, 'permanent'],
  [true, now + 1, 'temporary'],
  [true, now, 'expired'],
  [true, now - 1, 'expired'],
  [true, 0, 'expired'],
  [false, undefined, 'expired'],
  [false, now + 1, 'expired'],
] as const)('matches backend enabled=%s expires=%s => %s', (enabled, expiresAt, expected) => {
  expect(shareValidity({ enabled, expiresAt }, now)).toBe(expected)
})

it('loads an initially open dialog and updates expiry, stopping and restarting the clock on close/reopen', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const selected = ref<Version | undefined>(version)
  scope = effectScope()
  const state = scope.run(() => useShares(selected, ref(project)))!
  expect(sharesApi.list).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({ silent: true, signal: expect.any(AbortSignal) }),
  )
  const temporary = { ...share, expiresAt: now + 1000 }
  expect(state.validity(temporary)).toBe('temporary')
  await vi.advanceTimersByTimeAsync(1000)
  expect(state.validity(temporary)).toBe('expired')
  selected.value = undefined
  await nextTick()
  expect(vi.getTimerCount()).toBe(0)
  vi.setSystemTime(now + 10000)
  selected.value = version
  await nextTick()
  expect(state.validity({ ...share, expiresAt: now + 9000 })).toBe('expired')
  expect(vi.getTimerCount()).toBe(1)
  scope.stop()
  expect(vi.getTimerCount()).toBe(0)
})

it('passes the fully resolved URL and clicked button to the shared copier', async () => {
  const selected = ref<Version | undefined>(version)
  scope = effectScope()
  const state = scope.run(() => useShares(selected, ref(project)))!
  const button = document.createElement('button')
  document.body.append(button)
  button.addEventListener('click', (event) => {
    void state.copy(share, event)
  })
  button.click()
  expect(copyText).toHaveBeenCalledWith(
    `项目-V1：${window.location.origin}/tools/share/a%2Fb`,
    button,
  )
})
