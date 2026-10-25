import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, reactive, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useShareInvitation } from '@/modules/protohub-manager-ui/views/share/hooks/useShareInvitation'
const { location, replace } = vi.hoisted(() => ({
  location: {
    current: {
      params: { token: 'open' },
      path: '/share/open',
      query: { pageId: 'page' },
      hash: '',
    },
  },
  replace: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () =>
    new Proxy({}, { get: (_target, key) => Reflect.get(reactive(location).current, key) }),
  useRouter: () => ({ replace }),
}))
let scope: EffectScope
beforeEach(() => {
  scope = effectScope()
  location.current = {
    params: { token: 'open' },
    path: '/share/open',
    query: { pageId: 'page' },
    hash: `#reviewInvitation=${'A'.repeat(43)}`,
  }
  replace.mockReset().mockImplementation(async () => {
    reactive(location).current = { ...location.current, hash: '' }
  })
})
afterEach(() => scope.stop())
it('captures before navigation, cleans the fragment while retaining path/query and keeps same-share state', async () => {
  const state = scope.run(useShareInvitation)!
  expect(state.invitation.value).toBe('A'.repeat(43))
  await flushPromises()
  expect(replace).toHaveBeenCalledExactlyOnceWith({
    path: '/share/open',
    query: { pageId: 'page' },
    hash: '',
  })
  expect(state.ready.value).toBe(true)
  expect(state.invitation.value).toBe('A'.repeat(43))
  reactive(location).current.query = { pageId: 'other' }
  await flushPromises()
  expect(state.invitation.value).toBe('A'.repeat(43))
  state.abandon()
  expect(state.invitation.value).toBeUndefined()
})
it('gates workspace construction until cleaning actually finishes and cannot reinstate an invitation after share change', async () => {
  let done!: () => void
  replace.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        done = resolve
      }),
  )
  const state = scope.run(useShareInvitation)!
  expect(state.ready.value).toBe(false)
  reactive(location).current = {
    ...location.current,
    params: { token: 'other' },
    path: '/share/other',
    hash: '',
  }
  expect(state.invitation.value).toBeUndefined()
  done()
  await flushPromises()
  expect(state.invitation.value).toBeUndefined()
  expect(state.ready.value).toBe(true)
})
it('retains invalid intent after cleaning instead of silently switching to ordinary verification', async () => {
  location.current.hash = '#reviewInvitation=bad&reviewInvitation=again'
  const state = scope.run(useShareInvitation)!
  await flushPromises()
  expect(location.current.hash).toBe('')
  expect(state.invitation.value).toBeNull()
  state.abandon()
  expect(state.invitation.value).toBeUndefined()
})
it('clears invitation credentials on disposal', async () => {
  const state = scope.run(useShareInvitation)!
  await flushPromises()
  scope.stop()
  expect(state.invitation.value).toBeUndefined()
})
