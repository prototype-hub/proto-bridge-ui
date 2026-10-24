import { computed, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PrototypePage, WorkspaceContext } from '../types'
import {
  previewIdentity,
  resolvePreviewPage,
  stablePageId,
  flattenPages,
  selectablePage,
} from '../utils/preview-location'
import { copyText } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'

/** Keep page navigation in the app route; runtime grants and credentials never enter copied links. */
export function useWorkspaceLocation(context: Ref<WorkspaceContext>) {
  const route = useRoute()
  const router = useRouter()
  const currentPage = ref('')
  const selectedPage = ref<PrototypePage>()
  const error = ref('')
  let legacySelection: PrototypePage | undefined
  watch(
    context,
    () => {
      legacySelection = undefined
    },
    { flush: 'sync' },
  )
  const pageId = computed(
    () => selectedPage.value && stablePageId(selectedPage.value, context.value.pages),
  )
  const canCopy = computed(() => !!context.value.revisionId && !!pageId.value && !error.value)

  function query(id?: string) {
    return { revisionId: context.value.revisionId, ...(id ? { pageId: id } : {}) }
  }
  watch(
    [context, () => route.path, () => route.query.pageId, () => route.query.revisionId],
    () => {
      error.value = ''
      selectedPage.value = undefined
      currentPage.value = ''
      if (context.value.locationPath && context.value.locationPath !== route.path) {
        error.value = t('proto.invalidPageTarget')
        return
      }
      const requestedRevision = previewIdentity(route.query.revisionId)
      if (
        requestedRevision === null ||
        (requestedRevision !== undefined && requestedRevision !== context.value.revisionId)
      ) {
        error.value = t('proto.invalidPageTarget')
        return
      }
      const target = resolvePreviewPage(
        context.value.pages,
        context.value.runtimeBaseUrl,
        route.query.pageId,
      )
      if (target.invalid) {
        error.value = t('proto.invalidPageTarget')
        return
      }
      if (route.query.pageId !== undefined) legacySelection = undefined
      const page = legacySelection || target.page
      selectedPage.value = page
      currentPage.value = page?.path || context.value.entryFile
      const id = page && stablePageId(page, context.value.pages)
      if (
        context.value.revisionId &&
        (route.query.revisionId !== context.value.revisionId || (id && route.query.pageId !== id))
      ) {
        // Replace only the legacy entry; user page selections below create useful Back/Forward entries.
        void router.replace({ path: route.path, query: query(id) })
      }
    },
    { immediate: true },
  )
  function select(path: string, id?: string, source?: PrototypePage) {
    const candidates = flattenPages(context.value.pages).filter(
      (item) =>
        item.path === path &&
        (id === undefined ? !item.pageId : item.pageId === id) &&
        selectablePage(item, context.value.runtimeBaseUrl),
    )
    // Preserve an exact tree selection; a bare legacy path is usable only when unambiguous.
    const page = source
      ? candidates.find((item) => item === source)
      : candidates.length === 1
        ? candidates[0]
        : undefined
    if (!page) {
      selectedPage.value = undefined
      currentPage.value = ''
      error.value = t('proto.invalidPageTarget')
      return
    }
    const stableId = stablePageId(page, context.value.pages)
    if (id !== undefined && stableId !== id) {
      selectedPage.value = undefined
      currentPage.value = ''
      error.value = t('proto.invalidPageTarget')
      return
    }
    if (stableId && context.value.revisionId) {
      void router.push({ path: route.path, query: query(stableId) })
    } else {
      // Legacy manifest pages remain usable, but cannot advertise a stable page link.
      legacySelection = page
      selectedPage.value = page
      currentPage.value = path
      error.value = ''
      if (route.query.pageId !== undefined)
        void router.replace({ path: route.path, query: query() })
    }
  }
  async function copyCurrentPage() {
    if (!canCopy.value) return false
    const href = router.resolve({ path: route.path, query: query(pageId.value) }).href
    return copyText(new URL(href, window.location.origin).href)
  }
  return { currentPage, selectedPage, pageId, error, canCopy, select, copyCurrentPage }
}
