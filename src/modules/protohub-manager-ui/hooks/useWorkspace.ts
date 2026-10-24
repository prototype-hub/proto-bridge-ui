import { ref, computed, watch, onMounted, onScopeDispose, type Ref } from 'vue'
import type { WorkspaceContext, InspectElement } from '@/modules/protohub-manager-ui/types'
import { runtimePageUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { useWorkspaceLocation } from './useWorkspaceLocation'
import { isFrameSource, isInspectElement } from '@/modules/protohub-manager-ui/utils/inspect'
import { t } from '@/shared/i18n'

export function useWorkspace(context: Ref<WorkspaceContext>) {
  const mode = ref<'preview' | 'inspect'>('preview')
  const navVisible = ref(true)
  const isNarrow = ref(false)
  const inspectorOpen = ref(false)
  const frame = ref<HTMLIFrameElement>()
  const location = useWorkspaceLocation(context)
  const currentPage = location.currentPage
  const url = ref('')
  const loading = ref(true)
  const error = ref('')
  const element = ref<InspectElement | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const media = window.matchMedia('(max-width: 760px)')
  const resize = () => {
    isNarrow.value = media.matches
    navVisible.value = !media.matches
  }
  const toggleTitle = computed(() => t(navVisible.value ? 'proto.hidePages' : 'proto.showPages'))
  function load() {
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
  }
  function failed() {
    clearTimeout(timer)
    loading.value = false
    error.value = t('proto.runtimeError')
  }
  // Opaque origin alone is not identity: accept messages only from this prototype frame tree.
  function receive(event: MessageEvent<unknown>) {
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
    clearTimeout(timer)
    media.removeEventListener('change', resize)
    window.removeEventListener('message', receive)
  })
  return {
    ...location,
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
