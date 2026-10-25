import { ref, computed, watch, onMounted, onScopeDispose, type Ref } from 'vue'
import type {
  WorkspaceContext,
  InspectElement,
  WorkspacePane,
  ReviewAnchor,
} from '@/modules/protohub-manager-ui/types'
import { runtimePageUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { useWorkspaceLocation } from './useWorkspaceLocation'
import { isFrameSource, isInspectElement } from '@/modules/protohub-manager-ui/utils/inspect'
import { secureId } from '@/shared/utils/secure-id'
import { isAnchorEvent, isReviewAnchor, type AnchorStatus } from '../utils/review-anchor'
import { t } from '@/shared/i18n'

export function useWorkspace(
  context: Ref<WorkspaceContext>,
  pane?: WorkspacePane,
  compact = false,
) {
  const mode = ref<'preview' | 'inspect'>('preview')
  const navVisible = ref(true)
  const isNarrow = ref(false)
  const inspectorOpen = ref(false)
  const frame = ref<HTMLIFrameElement>()
  const location = useWorkspaceLocation(context, pane)
  const currentPage = location.currentPage
  const url = ref('')
  const loading = ref(true)
  const error = ref('')
  const element = ref<InspectElement | null>(null)
  const anchorStatus = ref<AnchorStatus | 'capturing' | 'locating'>(),
    anchorCapture = ref<{ anchor?: ReviewAnchor }>()
  let anchorChannel = secureId(),
    anchorGeneration = 0,
    anchorTimer: ReturnType<typeof setTimeout> | undefined
  function anchorCommand(
    action: 'ready' | 'capture' | 'locate' | 'clear',
    geometry?: ReviewAnchor | ReviewAnchor['shape'],
  ) {
    clearTimeout(anchorTimer)
    const previous = anchorStatus.value
    if (action === 'capture' || action === 'locate') {
      mode.value = 'preview'
      sendMode()
    }
    anchorStatus.value =
      action === 'capture' ? 'capturing' : action === 'locate' ? 'locating' : undefined
    try {
      const base = new URL(
          context.value.runtimeBaseUrl.replace(/\/$/, '') + '/',
          window.location.origin,
        ),
        page = new URL(runtimePageUrl(context.value.runtimeBaseUrl, currentPage.value))
      if (!frame.value?.contentWindow || loading.value || !page.pathname.startsWith(base.pathname))
        throw new Error('Unavailable document')
      const generation = ++anchorGeneration
      frame.value.contentWindow.postMessage(
        {
          type: 'PROTOTYPE_REVIEW_ANCHOR_COMMAND',
          channel: anchorChannel,
          generation,
          action,
          resourcePath: page.pathname.slice(base.pathname.length),
          prefixLength: base.pathname.length,
          ...(typeof geometry === 'string'
            ? { shape: geometry }
            : geometry
              ? { anchor: geometry }
              : {}),
        },
        '*',
      )
      if (action !== 'clear')
        anchorTimer = setTimeout(() => {
          if (generation !== anchorGeneration) return
          if (action === 'capture') anchorCommand('clear')
          anchorStatus.value = action === 'ready' ? undefined : 'unavailable'
          if (action === 'capture') anchorCapture.value = {}
        }, 3000)
    } catch {
      anchorStatus.value = 'unavailable'
      if (action === 'capture' || previous === 'capturing') anchorCapture.value = {}
    }
  }
  function captureAnchor(shape: ReviewAnchor['shape']) {
    anchorCommand('capture', shape)
  }
  function locateAnchor(anchor: ReviewAnchor) {
    clearAnchor()
    if (!isReviewAnchor(anchor)) {
      anchorStatus.value = 'unavailable'
      return
    }
    anchorCommand('locate', anchor)
  }
  function clearAnchor() {
    if (!frame.value?.contentWindow || loading.value) {
      anchorStatus.value = undefined
      return
    }
    anchorCommand('clear')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const media = window.matchMedia('(max-width: 760px)')
  const resize = () => {
    isNarrow.value = compact || media.matches
    navVisible.value = !isNarrow.value
  }
  const toggleTitle = computed(() => t(navVisible.value ? 'proto.hidePages' : 'proto.showPages'))
  function load() {
    clearTimeout(anchorTimer)
    anchorGeneration++
    anchorStatus.value = undefined
    clearTimeout(timer)
    element.value = null
    error.value = ''
    loading.value = true
    if (location.error.value) {
      url.value = ''
      loading.value = false
      error.value = location.error.value
      return
    }
    try {
      url.value = runtimePageUrl(context.value.runtimeBaseUrl, currentPage.value)
      timer = setTimeout(() => {
        loading.value = false
        error.value = t('proto.runtimeError')
      }, 30000)
    } catch {
      url.value = ''
      loading.value = false
      error.value = t('proto.runtimeError')
    }
  }
  // Sandboxed prototype documents have opaque origins; send only this credential-free mode flag.
  function sendMode() {
    frame.value?.contentWindow?.postMessage(
      { type: 'AXURE_INSPECT_MODE', enabled: mode.value === 'inspect' },
      '*',
    )
  }
  function loaded() {
    clearTimeout(timer)
    loading.value = false
    sendMode()
    anchorChannel = secureId()
    anchorGeneration = 0
    anchorCommand('ready')
  }
  function failed() {
    clearTimeout(timer)
    loading.value = false
    error.value = t('proto.runtimeError')
  }
  // Opaque origin alone is not identity: accept messages only from this prototype frame tree.
  function receive(event: MessageEvent<unknown>) {
    // Geometry is root-only; recursive inspect messages retain their separate established policy.
    if (
      mode.value === 'preview' &&
      event.origin === 'null' &&
      event.source === frame.value?.contentWindow &&
      isAnchorEvent(event.data) &&
      event.data.channel === anchorChannel &&
      event.data.generation === anchorGeneration
    ) {
      const current = anchorStatus.value,
        result = event.data
      if (['captured', 'capturing'].includes(result.status) && current !== 'capturing') return
      if (result.status === 'located' && current !== 'locating') return
      clearTimeout(anchorTimer)
      anchorStatus.value = result.status
      if (
        current === 'capturing' &&
        ['captured', 'cancelled', 'unavailable'].includes(result.status)
      )
        anchorCapture.value = { anchor: result.anchor }
      return
    }
    if (
      event.origin !== 'null' ||
      !isFrameSource(frame.value?.contentWindow || null, event.source) ||
      mode.value !== 'inspect'
    )
      return
    const data = event.data
    if (typeof data !== 'object' || data === null) return
    if ('type' in data && data.type === 'AXURE_INSPECT_CLEAR') element.value = null
    if (
      'type' in data &&
      data.type === 'AXURE_INSPECT_ELEMENT' &&
      'payload' in data &&
      isInspectElement(data.payload)
    ) {
      element.value = data.payload
      if (isNarrow.value) inspectorOpen.value = true
    }
  }
  watch([currentPage, () => context.value.runtimeBaseUrl, location.error], load, {
    immediate: true,
  })
  watch(mode, () => {
    if (mode.value === 'inspect') clearAnchor()
    element.value = null
    inspectorOpen.value = false
    sendMode()
  })
  onMounted(() => {
    resize()
    media.addEventListener('change', resize)
    window.addEventListener('message', receive)
  })
  onScopeDispose(() => {
    clearTimeout(anchorTimer)
    clearTimeout(timer)
    media.removeEventListener('change', resize)
    window.removeEventListener('message', receive)
  })
  return {
    ...location,
    anchorStatus,
    anchorCapture,
    captureAnchor,
    locateAnchor,
    clearAnchor,
    mode,
    navVisible,
    isNarrow,
    inspectorOpen,
    frame,
    currentPage,
    url,
    loading,
    error,
    element,
    toggleTitle,
    load,
    loaded,
    failed,
  }
}
