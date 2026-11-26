import { onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { secureId } from '@/shared/utils/secure-id'
import type { ReviewElementTarget, WorkspaceContext } from '../types'
import { runtimePageUrl } from '../utils/urls'
import {
  cloneReviewElementTarget,
  isElementResourcePath,
  isReviewElementTarget,
} from '../utils/review-element'

export type ElementStatus =
  | 'ready'
  | 'capturing'
  | 'captured'
  | 'cancelled'
  | 'locating'
  | 'located'
  | 'unavailable'

/** Only the current opaque root answers the shell; all descendant routing stays inside the runtime. */
export function useReviewElements(
  context: Ref<WorkspaceContext>,
  currentPage: Ref<string>,
  frame: Ref<HTMLIFrameElement | undefined>,
  mode: Ref<'preview' | 'inspect'>,
  loading: Ref<boolean>,
) {
  const status = ref<ElementStatus>(),
    capture = shallowRef<{ target?: ReviewElementTarget }>()
  let channel = secureId(),
    generation = 0,
    action: 'ready' | 'capture' | 'locate' | 'clear' | undefined,
    identity = '',
    timer: ReturnType<typeof setTimeout> | undefined
  const scope = () =>
    JSON.stringify([context.value.revisionId, context.value.runtimeBaseUrl, currentPage.value])

  function command(next: NonNullable<typeof action>, target?: ReviewElementTarget) {
    clearTimeout(timer)
    action = next
    identity = scope()
    generation++
    if (next === 'capture') status.value = 'capturing'
    else if (next === 'locate') status.value = 'locating'
    else status.value = undefined
    try {
      const base = new URL(
          context.value.runtimeBaseUrl.replace(/\/$/, '') + '/',
          window.location.origin,
        ),
        page = new URL(runtimePageUrl(context.value.runtimeBaseUrl, currentPage.value)),
        resourcePath = page.pathname.slice(base.pathname.length)
      if (
        !frame.value?.contentWindow ||
        loading.value ||
        !page.pathname.startsWith(base.pathname) ||
        !isElementResourcePath(resourcePath)
      )
        throw new Error('Unavailable document')
      frame.value.contentWindow.postMessage(
        {
          type: 'PROTOTYPE_REVIEW_ELEMENT_COMMAND',
          channel,
          generation,
          action: next,
          resourcePath,
          prefixLength: base.pathname.length,
          ...(target ? { elementTarget: cloneReviewElementTarget(target) } : {}),
        },
        '*',
      )
      if (next !== 'clear') {
        const epoch = generation
        timer = setTimeout(() => {
          if (epoch !== generation) return
          const wasCapture = action === 'capture',
            wasReady = action === 'ready'
          clear()
          status.value = wasReady ? undefined : 'unavailable'
          if (wasCapture) capture.value = {}
        }, 3000)
      }
    } catch {
      action = undefined
      status.value = next === 'ready' || next === 'clear' ? undefined : 'unavailable'
      if (next === 'capture') capture.value = {}
    }
  }
  function clear() {
    if (action === 'capture' || action === 'locate') command('clear')
    else {
      clearTimeout(timer)
      generation++
    }
    action = undefined
    status.value = undefined
    capture.value = undefined
  }
  function reset() {
    if (action === 'capture' || action === 'locate') clear()
    clearTimeout(timer)
    generation++
    action = undefined
    status.value = undefined
    capture.value = undefined
  }
  function cancelCapture() {
    const wasCapture = action === 'capture'
    clear()
    if (wasCapture) capture.value = {}
  }
  function documentLoaded() {
    reset()
    channel = secureId()
    generation = 0
    command('ready')
  }
  function receive(event: MessageEvent<unknown>) {
    if (
      event.origin !== 'null' ||
      event.source !== frame.value?.contentWindow ||
      mode.value !== 'preview' ||
      loading.value ||
      !action ||
      identity !== scope() ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    )
      return
    const result = event.data as Record<string, unknown>
    if (
      result.type !== 'PROTOTYPE_REVIEW_ELEMENT_EVENT' ||
      result.channel !== channel ||
      result.generation !== generation ||
      Object.keys(result).length !== (result.status === 'captured' ? 5 : 4) ||
      Object.keys(result).some(
        (key) =>
          ![
            'type',
            'channel',
            'generation',
            'status',
            ...(result.status === 'captured' ? ['elementTarget'] : []),
          ].includes(key),
      )
    )
      return
    if (action === 'clear') return
    if (result.status === 'ready' && action === 'ready') {
      clearTimeout(timer)
      status.value = 'ready'
      action = undefined
    } else if (result.status === 'capturing' && action === 'capture') {
      clearTimeout(timer)
      status.value = 'capturing'
    } else if (
      result.status === 'captured' &&
      action === 'capture' &&
      isReviewElementTarget(result.elementTarget)
    ) {
      clearTimeout(timer)
      status.value = 'captured'
      capture.value = { target: cloneReviewElementTarget(result.elementTarget) }
      action = undefined
    } else if (result.status === 'cancelled' && action === 'capture') {
      clearTimeout(timer)
      status.value = 'cancelled'
      capture.value = {}
      action = undefined
    } else if (result.status === 'located' && action === 'locate') {
      clearTimeout(timer)
      status.value = 'located'
    } else if (result.status === 'unavailable') {
      clearTimeout(timer)
      const wasCapture = action === 'capture'
      status.value = 'unavailable'
      action = undefined
      if (wasCapture) capture.value = {}
    }
  }
  function captureElement() {
    command('capture')
  }
  function locateElement(target: ReviewElementTarget) {
    if (!isReviewElementTarget(target)) {
      clear()
      status.value = 'unavailable'
      return
    }
    command('locate', target)
  }
  onScopeDispose(reset)
  return {
    status,
    capture,
    captureElement,
    locateElement,
    clear,
    cancelCapture,
    reset,
    documentLoaded,
    receive,
  }
}
