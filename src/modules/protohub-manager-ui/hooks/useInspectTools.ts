import { reactive, onScopeDispose, type Ref } from 'vue'
import { secureId } from '@/shared/utils/secure-id'
import { runtimePageUrl } from '../utils/urls'
import { isInspectToolEvent } from '../utils/inspect-tools'
import type {
  InspectToolAction,
  InspectToolSlot,
  InspectToolState,
  WorkspaceContext,
} from '../types'

/** One credential-free root-document channel per load; legacy recursive Inspect stays independent. */
export function useInspectTools(
  context: Ref<WorkspaceContext>,
  currentPage: Ref<string>,
  frame: Ref<HTMLIFrameElement | undefined>,
  mode: Ref<'preview' | 'inspect'>,
  loading: Ref<boolean>,
  isNarrow: Ref<boolean>,
  inspectorOpen: Ref<boolean>,
) {
  const state = reactive<InspectToolState>({
    tab: 'element',
    status: 'idle',
    selections: {},
    pickCompletion: 0,
  })
  let channel = secureId(),
    generation = 0,
    action: InspectToolAction | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    accepted = false,
    identity = ''
  const scope = () =>
    `${context.value.revisionId || ''}\n${context.value.runtimeBaseUrl}\n${currentPage.value}`
  function clearResults() {
    state.selections = {}
    state.summary = undefined
  }
  function finishPick() {
    state.focusSlot = state.picking
    state.picking = undefined
    state.pickCompletion++
    if (isNarrow.value) inspectorOpen.value = true
  }
  /** Changing documents/mode invalidates timers and every previous generation, including timed-out responses. */
  function reset() {
    clearTimeout(timer)
    action = undefined
    accepted = false
    generation++
    clearResults()
    state.picking = undefined
    state.focusSlot = undefined
    state.status = 'idle'
  }
  function unavailable() {
    clearTimeout(timer)
    const wasPicking = action === 'pick'
    action = undefined
    accepted = false
    clearResults()
    state.status = 'unavailable'
    if (wasPicking) finishPick()
  }
  /** Commands contain only the encoded relative resource path, never the capability-bearing runtime base. */
  function command(next: InspectToolAction, slot?: InspectToolSlot) {
    clearTimeout(timer)
    if (mode.value !== 'inspect' || loading.value || !frame.value?.contentWindow) {
      unavailable()
      return
    }
    try {
      const base = new URL(
        context.value.runtimeBaseUrl.replace(/\/$/, '') + '/',
        window.location.origin,
      )
      const page = new URL(runtimePageUrl(context.value.runtimeBaseUrl, currentPage.value))
      if (!page.pathname.startsWith(base.pathname)) throw new Error('Unavailable document')
      action = next
      accepted = false
      identity = scope()
      generation++
      if (next === 'ready') state.status = 'connecting'
      if (next === 'summary') state.status = 'loading'
      if (next !== 'pick') state.picking = undefined
      if (next === 'pick') {
        state.status = 'picking'
        state.picking = slot
        if (isNarrow.value) inspectorOpen.value = false
      }
      frame.value.contentWindow.postMessage(
        {
          type: 'PROTOTYPE_INSPECT_TOOL_COMMAND',
          channel,
          generation,
          action: next,
          resourcePath: page.pathname.slice(base.pathname.length),
          prefixLength: base.pathname.length,
          ...(slot ? { slot } : {}),
        },
        '*',
      )
      if (next !== 'clear') timer = setTimeout(unavailable, 3000)
      if (next === 'pick') frame.value.contentWindow.focus()
    } catch {
      unavailable()
    }
  }
  function documentLoaded() {
    reset()
    channel = secureId()
    generation = 0
    if (mode.value === 'inspect') command('ready')
  }
  /** Status/action pairing blocks unsolicited payloads; only the exact opaque root window can respond. */
  function receive(event: MessageEvent<unknown>) {
    if (
      event.origin !== 'null' ||
      event.source !== frame.value?.contentWindow ||
      mode.value !== 'inspect' ||
      loading.value ||
      !action ||
      identity !== scope() ||
      !isInspectToolEvent(event.data) ||
      event.data.channel !== channel ||
      event.data.generation !== generation
    )
      return
    const result = event.data
    if (action === 'clear') return
    if (result.status === 'stale') {
      if (action !== 'summary' && !accepted) return
      clearTimeout(timer)
      clearResults()
      state.status = 'stale'
      if (state.picking) finishPick()
      action = undefined
      return
    }
    if (accepted) return
    if (result.status === 'ready') {
      if (action !== 'ready' && action !== 'pick') return
      clearTimeout(timer)
      if (action === 'ready') {
        state.status = 'ready'
        accepted = true
      }
      return
    }
    if (result.status === 'unavailable') {
      unavailable()
      return
    }
    if (action === 'pick' && result.status === 'cancelled') {
      clearTimeout(timer)
      state.status = 'ready'
      accepted = true
      finishPick()
      return
    }
    if (
      action === 'pick' &&
      result.status === 'selected' &&
      result.selection.slot === state.picking
    ) {
      clearTimeout(timer)
      state.selections[result.selection.slot] = result.selection
      state.status = 'ready'
      accepted = true
      finishPick()
      return
    }
    if (action === 'summary' && result.status === 'summary') {
      clearTimeout(timer)
      state.summary = result.summary
      state.status = 'ready'
      accepted = true
    }
  }
  function clear() {
    clearResults()
    command('clear')
    state.picking = undefined
    if (state.status !== 'unavailable') state.status = 'ready'
  }
  function pick(slot: InspectToolSlot) {
    if (isNarrow.value && inspectorOpen.value) {
      // Let Ant finish its focus restoration before the opaque runtime takes keyboard focus.
      clearTimeout(timer)
      action = undefined
      state.status = 'picking'
      state.picking = slot
      inspectorOpen.value = false
      return
    }
    command('pick', slot)
  }
  function drawerChanged(open: boolean) {
    if (!open && state.status === 'picking' && state.picking) command('pick', state.picking)
  }
  onScopeDispose(reset)
  return {
    state,
    reset,
    documentLoaded,
    receive,
    ready: () => command('ready'),
    pick,
    drawerChanged,
    summary: () => command('summary'),
    clear,
  }
}
