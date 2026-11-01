import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useInspectTools } from '@/modules/protohub-manager-ui/hooks/useInspectTools'
import { useWorkspace } from '@/modules/protohub-manager-ui/hooks/useWorkspace'
import { hookHarness } from '../fixtures/hook-harness'

const wrappers: VueWrapper[] = []
vi.mock('@/modules/protohub-manager-ui/hooks/useWorkspaceLocation', () => ({
  useWorkspaceLocation: () => ({ currentPage: ref('home.html'), error: ref('') }),
}))
const selection = (slot = 'A') => ({
  slot,
  tagName: 'DIV',
  id: slot,
  rect: { x: 10, y: 20, width: 30, height: 40 },
})
const summary = {
  visited: 4,
  truncated: false,
  colors: [{ value: 'rgb(1, 2, 3)', count: 4 }],
  fonts: [],
}
function setup(narrow = false) {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {})
  const context = ref({
    title: 'Project',
    versionName: 'V1',
    revisionId: 'r1',
    runtimeBaseUrl: '/api/runtime/private/grant',
    entryFile: 'home.html',
    pages: [],
  })
  const mode = ref<'preview' | 'inspect'>('inspect')
  const page = ref('home.html')
  const open = ref(narrow)
  let tools!: ReturnType<typeof useInspectTools>
  wrappers.push(
    mount(
      hookHarness(() => {
        tools = useInspectTools(context, page, ref(frame), mode, ref(false), ref(narrow), open)
      }),
    ),
  )
  tools.documentLoaded()
  const command = () => post.mock.calls.at(-1)![0]
  const respond = (
    status: string,
    payload = {},
    extra = {},
    source: MessageEventSource = frame.contentWindow!,
  ) =>
    tools.receive(
      new MessageEvent('message', {
        origin: 'null',
        source,
        data: {
          type: 'PROTOTYPE_INSPECT_TOOL_EVENT',
          channel: command().channel,
          generation: command().generation,
          status,
          ...payload,
          ...extra,
        },
      }),
    )
  return { tools, context, mode, page, frame, post, command, respond, open }
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
it('sends only relative resource identity and accepts the exact root channel/action', () => {
  const { tools, command, respond, frame } = setup()
  expect(command()).toEqual({
    type: 'PROTOTYPE_INSPECT_TOOL_COMMAND',
    channel: expect.any(String),
    generation: 1,
    action: 'ready',
    resourcePath: 'home.html',
    prefixLength: '/api/runtime/private/grant/'.length,
  })
  expect(JSON.stringify(command())).not.toContain('grant')
  respond('ready', {}, {}, window)
  respond('ready', {}, { channel: 'foreign-channel-value' })
  respond('summary', { summary })
  tools.receive(
    new MessageEvent('message', {
      origin: 'https://other.invalid',
      source: frame.contentWindow,
      data: {
        type: 'PROTOTYPE_INSPECT_TOOL_EVENT',
        channel: command().channel,
        generation: 1,
        status: 'ready',
      },
    }),
  )
  expect(tools.state.status).toBe('connecting')
  respond('ready')
  expect(tools.state.status).toBe('ready')
})
it('does not time out human picking after ready ACK and returns the narrow drawer on cancel/select', () => {
  const { tools, respond, open } = setup(true)
  respond('ready')
  tools.pick('A')
  expect(open.value).toBe(false)
  tools.drawerChanged(false)
  respond('ready')
  vi.advanceTimersByTime(30000)
  expect(tools.state.status).toBe('picking')
  respond('selected', { selection: selection() })
  expect(open.value).toBe(true)
  expect(tools.state.selections.A?.id).toBe('A')
  tools.pick('B')
  tools.drawerChanged(false)
  respond('ready')
  respond('cancelled')
  expect(tools.state.selections.A?.id).toBe('A')
  expect(tools.state.selections.B).toBeUndefined()
  expect(open.value).toBe(true)
})
it('invalidates all new-tool snapshots on stale without touching legacy element state', () => {
  const { tools, respond } = setup()
  respond('ready')
  tools.pick('A')
  respond('selected', { selection: selection() })
  tools.summary()
  respond('summary', { summary })
  expect(tools.state.summary).toEqual(summary)
  respond('stale')
  expect(tools.state.status).toBe('stale')
  expect(tools.state.summary).toBeUndefined()
  expect(tools.state.selections).toEqual({})
  respond('summary', { summary })
  expect(tools.state.summary).toBeUndefined()
})
it('timeout, document replacement and explicit reset reject late responses', () => {
  const { tools, respond, command, context } = setup()
  const previous = command()
  vi.advanceTimersByTime(3001)
  respond('ready')
  expect(tools.state.status).toBe('unavailable')
  tools.ready()
  respond('ready', {}, { generation: previous.generation })
  expect(tools.state.status).toBe('connecting')
  respond('ready')
  tools.summary()
  context.value = { ...context.value, revisionId: 'r2' }
  respond('summary', { summary })
  expect(tools.state.summary).toBeUndefined()
  tools.documentLoaded()
  respond('ready', {}, { channel: previous.channel })
  expect(tools.state.status).toBe('connecting')
  tools.reset()
  respond('ready')
  expect(tools.state.status).toBe('idle')
})
it('rejects mismatched slots, extra data, duplicate completion and results for clear', () => {
  const { tools, respond } = setup(true)
  respond('ready')
  tools.pick('A')
  tools.drawerChanged(false)
  respond('selected', { selection: selection('B') })
  respond('selected', { selection: { ...selection(), html: '<input>' } })
  expect(tools.state.selections).toEqual({})
  respond('selected', { selection: selection() })
  const completed = tools.state.pickCompletion
  expect(completed).toBe(1)
  respond('cancelled')
  expect(tools.state.pickCompletion).toBe(completed)
  tools.clear()
  respond('summary', { summary })
  expect(tools.state.selections).toEqual({})
  expect(tools.state.summary).toBeUndefined()
})
it('same-URL context replacement clears tools without leaving an unchanged comparison iframe loading', async () => {
  const context = ref({
    title: 'Project',
    versionName: 'V1',
    revisionId: 'r1',
    runtimeBaseUrl: '/api/runtime/private/grant',
    entryFile: 'home.html',
    pages: [],
  })
  let workspace!: ReturnType<typeof useWorkspace>
  wrappers.push(
    mount(
      hookHarness(() => {
        workspace = useWorkspace(context)
      }),
    ),
  )
  const frame = document.createElement('iframe')
  document.body.append(frame)
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  workspace.frame.value = frame
  workspace.loaded()
  workspace.mode.value = 'inspect'
  await nextTick()
  const originalUrl = workspace.url.value
  context.value = { ...context.value, title: 'Translated or reauthorized context' }
  await nextTick()
  expect(workspace.loading.value).toBe(false)
  expect(workspace.url.value).toBe(originalUrl)
  expect(workspace.inspectTools.state.selections).toEqual({})
  vi.advanceTimersByTime(30001)
  expect(workspace.error.value).toBe('')
  expect(workspace.loading.value).toBe(false)
})
