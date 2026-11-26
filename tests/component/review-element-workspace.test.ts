import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ref, defineComponent, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import PrototypeWorkspace from '../../src/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { useReviewElements } from '../../src/modules/protohub-manager-ui/hooks/useReviewElements'
import type {
  ReviewElementTarget,
  WorkspaceContext,
} from '../../src/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/modules/protohub-manager-ui/hooks/useWorkspaceLocation', () => ({
  useWorkspaceLocation: () => ({
    currentPage: ref('page.html'),
    error: ref(''),
    selectedPage: ref(),
    pageId: ref(),
    canCopy: ref(false),
  }),
}))

const target: ReviewElementTarget = {
  space: 'frame-element-v1',
  frames: [{ elementId: 'childFrame', resourcePath: 'child.html' }],
  elementId: 'saveButton',
  tagName: 'button',
  textHint: 'Save',
  viewportWidth: 440,
  viewportHeight: 360,
}
const wrappers: VueWrapper[] = []
function setup() {
  const context = ref<WorkspaceContext>({
      title: 'Project',
      versionName: 'V1',
      revisionId: 'r1',
      runtimeBaseUrl: '/api/runtime/private/secret-grant',
      entryFile: 'page.html',
      pages: [],
    }),
    mode = ref<'preview' | 'inspect'>('preview'),
    loading = ref(false),
    currentPage = ref('page.html'),
    element = document.createElement('iframe')
  document.body.append(element)
  const frame = ref<HTMLIFrameElement | undefined>(element),
    messages = vi.spyOn(element.contentWindow!, 'postMessage').mockImplementation(() => {})
  let state!: ReturnType<typeof useReviewElements>
  wrappers.push(
    mount(
      hookHarness(() => (state = useReviewElements(context, currentPage, frame, mode, loading))),
    ),
  )
  state.documentLoaded()
  const command = () => messages.mock.calls.at(-1)![0]
  const respond = (
    status: string,
    extra = {},
    source: MessageEventSource = element.contentWindow!,
    origin = 'null',
  ) =>
    state.receive(
      new MessageEvent('message', {
        source,
        origin,
        data: {
          type: 'PROTOTYPE_REVIEW_ELEMENT_EVENT',
          channel: command().channel,
          generation: command().generation,
          status,
          ...extra,
        },
      }),
    )
  return { state, context, currentPage, mode, loading, frame, messages, command, respond }
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

it('sends credential-free paths and a deep target snapshot only to the current root', () => {
  const { state, command } = setup()
  expect(command()).toMatchObject({
    action: 'ready',
    resourcePath: 'page.html',
    prefixLength: '/api/runtime/private/secret-grant/'.length,
  })
  expect(JSON.stringify(command())).not.toContain('secret-grant')
  const draft = { ...target, frames: target.frames.map((frame) => ({ ...frame })) }
  state.locateElement(draft)
  draft.frames[0]!.resourcePath = 'new.html'
  expect(command().elementTarget.frames[0].resourcePath).toBe('child.html')
  expect(Object.keys(command()).sort()).toEqual(
    [
      'type',
      'channel',
      'generation',
      'action',
      'resourcePath',
      'prefixLength',
      'elementTarget',
    ].sort(),
  )
})

it('rejects foreign windows/origins, stale generations, extra keys and another page or mode', () => {
  const { state, command, respond, currentPage, mode, frame } = setup()
  state.captureElement()
  respond('captured', { elementTarget: target }, window)
  respond(
    'captured',
    { elementTarget: target },
    frame.value!.contentWindow!,
    'https://platform.invalid',
  )
  respond('captured', { elementTarget: target, generation: command().generation - 1 })
  respond('captured', { elementTarget: target, html: 'extra' })
  currentPage.value = 'other.html'
  respond('captured', { elementTarget: target })
  currentPage.value = 'page.html'
  mode.value = 'inspect'
  respond('captured', { elementTarget: target })
  expect(state.capture.value).toBeUndefined()
  mode.value = 'preview'
  respond('captured', { elementTarget: target })
  expect(state.capture.value).toEqual({ target })
})

it('limits initialization while allowing a person to choose after the capturing acknowledgement', () => {
  const { state, command, respond } = setup()
  state.captureElement()
  vi.advanceTimersByTime(3001)
  expect(state.status.value).toBe('unavailable')
  expect(state.capture.value).toEqual({})
  expect(command().action).toBe('clear')
  state.captureElement()
  respond('capturing')
  vi.advanceTimersByTime(30000)
  expect(state.status.value).toBe('capturing')
  respond('captured', { elementTarget: target })
  expect(state.capture.value?.target).toEqual(target)
})

it('clears descendants on reset and ignores late capture results after a new document load', () => {
  const { state, command, respond } = setup()
  state.captureElement()
  respond('capturing')
  const previous = command()
  state.reset()
  expect(command().action).toBe('clear')
  state.documentLoaded()
  respond('captured', {
    elementTarget: target,
    channel: previous.channel,
    generation: previous.generation,
  })
  expect(state.capture.value).toBeUndefined()
  state.captureElement()
  respond('cancelled')
  expect(state.capture.value).toEqual({})
})

it('preserves exact-locate invalidation and never forwards an invalid saved target', () => {
  const { state, command, respond, messages } = setup()
  state.locateElement(target)
  respond('located')
  expect(state.status.value).toBe('located')
  respond('unavailable')
  expect(state.status.value).toBe('unavailable')
  const count = messages.mock.calls.length
  state.locateElement({
    ...target,
    frames: [{ elementId: 'childFrame', resourcePath: '../x.html' }],
  })
  expect(messages).toHaveBeenCalledTimes(count)
  expect(command().action).toBe('locate')
})

it('returns a cancelled mode-switch capture without projecting a target or reopening after a silent scope reset', () => {
  const { state, respond, command } = setup()
  state.captureElement()
  respond('capturing')
  state.cancelCapture()
  expect(command().action).toBe('clear')
  expect(state.capture.value).toEqual({})
  state.captureElement()
  respond('capturing')
  state.reset()
  state.cancelCapture()
  expect(state.capture.value).toBeUndefined()
})

it('emits cancellation through the real workspace component when mode switches, while epoch changes stay silent', async () => {
  const ModeSwitch = defineComponent({
    emits: ['update:value'],
    template: "<button @click=\"$emit('update:value', 'inspect')\">Inspect</button>",
  })
  const wrapper = mount(PrototypeWorkspace, {
    attachTo: document.body,
    props: {
      context: {
        title: 'Project',
        versionName: 'V1',
        revisionId: 'r1',
        runtimeBaseUrl: '/api/runtime/private/grant',
        entryFile: 'page.html',
        pages: [],
      },
    },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en',
          missingWarn: false,
          fallbackWarn: false,
          messages: { en: {} },
        }),
      ],
      stubs: {
        PageTree: true,
        InspectorPanel: true,
        ADrawer: true,
        ARadioGroup: ModeSwitch,
        ARadioButton: true,
      },
    },
  })
  wrappers.push(wrapper)
  const frame = wrapper.get('iframe').element as HTMLIFrameElement,
    messages = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  await wrapper.get('iframe').trigger('load')
  const latest = () =>
    messages.mock.calls
      .map(([value]) => value)
      .filter((value) => value.type === 'PROTOTYPE_REVIEW_ELEMENT_COMMAND')
      .at(-1)!
  const respond = (command: ReturnType<typeof latest>, status: string, extra = {}) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'null',
        data: {
          type: 'PROTOTYPE_REVIEW_ELEMENT_EVENT',
          channel: command.channel,
          generation: command.generation,
          status,
          ...extra,
        },
      }),
    )
  const exposed = wrapper.vm as unknown as { captureElement(): void }
  exposed.captureElement()
  respond(latest(), 'capturing')
  await nextTick()
  await wrapper.getComponent(ModeSwitch).trigger('click')
  await nextTick()
  expect(wrapper.emitted('elementCapture')).toEqual([[undefined]])
  exposed.captureElement()
  await nextTick()
  respond(latest(), 'capturing')
  await nextTick()
  const previous = latest()
  await wrapper.setProps({ anchorEpoch: 1 })
  respond(previous, 'captured', { elementTarget: target })
  await nextTick()
  expect(wrapper.emitted('elementCapture')).toHaveLength(1)
})
