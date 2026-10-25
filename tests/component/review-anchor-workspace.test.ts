import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useWorkspace } from '@/modules/protohub-manager-ui/hooks/useWorkspace'
import type { ReviewAnchor } from '@/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'
vi.mock('@/modules/protohub-manager-ui/hooks/useWorkspaceLocation', () => ({
  useWorkspaceLocation: () => ({ currentPage: ref('中文% file.html'), error: ref('') }),
}))
const anchor: ReviewAnchor = {
  space: 'root-document-css-px-v1',
  shape: 'point',
  x: 2,
  y: 4,
  width: 0,
  height: 0,
  documentWidth: 800,
  documentHeight: 1000,
  viewportWidth: 800,
  viewportHeight: 600,
}
const wrappers: VueWrapper[] = []
function setup() {
  let state!: ReturnType<typeof useWorkspace>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useWorkspace(
          ref({
            title: 'Project',
            versionName: 'V1',
            runtimeBaseUrl: '/api/runtime/private/grant',
            entryFile: '中文% file.html',
            pages: [],
          }),
        )
      }),
    ),
  )
  const frame = document.createElement('iframe')
  document.body.append(frame)
  state.frame.value = frame
  const messages = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  state.loaded()
  const command = () =>
    messages.mock.calls
      .map(([data]) => data)
      .filter((data) => data.type === 'PROTOTYPE_REVIEW_ANCHOR_COMMAND')
      .at(-1)!
  const respond = (
    status: string,
    extra = {},
    source: MessageEventSource = frame.contentWindow!,
    origin = 'null',
  ) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source,
        data: {
          type: 'PROTOTYPE_REVIEW_ANCHOR_EVENT',
          channel: command().channel,
          generation: command().generation,
          status,
          ...extra,
        },
      }),
    )
  return { state, frame, messages, command, respond }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('sends only encoded relative path and prefix length, never scope capabilities', () => {
  const { command } = setup()
  expect(command()).toEqual({
    type: 'PROTOTYPE_REVIEW_ANCHOR_COMMAND',
    channel: expect.any(String),
    generation: 1,
    resourcePath: '%E4%B8%AD%E6%96%87%25%20file.html',
    prefixLength: '/api/runtime/private/grant/'.length,
    action: 'ready',
  })
  expect(JSON.stringify(command())).not.toContain('grant')
})
it('requires the current root, null origin, current channel and mode before accepting geometry', async () => {
  const { state, respond, frame, command } = setup()
  state.captureAnchor('point')
  respond('captured', { anchor }, window)
  respond('captured', { anchor }, frame.contentWindow!, 'https://platform.invalid')
  respond('captured', { anchor, channel: 'foreign' })
  respond('captured', { anchor, generation: command().generation - 1 })
  respond('captured', { anchor: { ...anchor, x: '2' } })
  expect(state.anchorCapture.value).toBeUndefined()
  respond('capturing')
  state.mode.value = 'inspect'
  respond('captured', { anchor })
  expect(state.anchorCapture.value).toBeUndefined()
  await nextTick()
  state.captureAnchor('point')
  respond('capturing')
  respond('captured', { anchor })
  expect(state.anchorCapture.value).toEqual({ anchor })
})
it('times out missing initialization, but permits long drawing after the exact capturing ACK', () => {
  const { state, respond } = setup()
  state.captureAnchor('point')
  respond('capturing', { channel: 'foreign' })
  vi.advanceTimersByTime(3001)
  expect(state.anchorStatus.value).toBe('unavailable')
  state.captureAnchor('point')
  respond('capturing')
  vi.advanceTimersByTime(30000)
  expect(state.anchorStatus.value).toBe('capturing')
  respond('captured', { anchor })
  expect(state.anchorCapture.value).toEqual({ anchor })
})
it('rejects old frame-load results and never forwards an invalid saved anchor', () => {
  const { state, respond, command, messages } = setup()
  state.captureAnchor('point')
  const previous = command()
  state.loaded()
  respond('captured', { anchor, channel: previous.channel, generation: previous.generation })
  expect(state.anchorCapture.value).toBeUndefined()
  const count = messages.mock.calls.length
  state.locateAnchor({ ...anchor, x: Infinity })
  expect(state.anchorStatus.value).toBe('unavailable')
  expect(messages).toHaveBeenCalledTimes(count + 1)
  expect(command().action).toBe('clear')
})

it('explicit draft cancellation invalidates a late captured result without reopening a new scope', () => {
  const { state, respond, command } = setup()
  state.captureAnchor('point')
  respond('capturing')
  const previous = command()
  state.clearAnchor()
  respond('captured', { anchor, channel: previous.channel, generation: previous.generation })
  expect(state.anchorCapture.value).toBeUndefined()
})
