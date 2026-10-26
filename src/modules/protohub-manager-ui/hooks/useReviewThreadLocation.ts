import { computed, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ReviewPage, ReviewThread, WorkspaceContext } from '../types'
import { reviewThreadTarget, resolvePreviewPage } from '../utils/preview-location'
import { copyText } from '@/shared/utils/feedback'

/** Shareable identity stays in the shell route; grants and invitation intent stay in memory. */
export function useReviewThreadLocation(
  page: Ref<ReviewPage | undefined>,
  open: Ref<boolean>,
  available: Ref<boolean>,
) {
  const route = useRoute(),
    router = useRouter()
  const target = computed(() => reviewThreadTarget(route.query))
  const threadId = computed(() => (target.value === null ? null : target.value?.threadId))
  const invalid = computed(() => target.value === null)
  const unavailable = computed(() => !!target.value && !available.value)
  watch(
    [
      () => JSON.stringify(target.value),
      () => JSON.stringify(page.value && [page.value.revisionId, page.value.pageId]),
      available,
    ],
    () => {
      const value = target.value
      if (
        available.value &&
        value &&
        page.value &&
        value.revisionId === page.value.revisionId &&
        value.pageId === page.value.pageId
      )
        open.value = true
    },
    { immediate: true },
  )
  function query(thread?: ReviewThread) {
    if (!page.value) return undefined
    return {
      revisionId: page.value.revisionId,
      pageId: page.value.pageId,
      ...(thread ? { threadId: thread.id } : {}),
    }
  }
  function select(thread?: ReviewThread) {
    if (
      !page.value ||
      (thread &&
        (thread.revisionId !== page.value.revisionId || thread.pageId !== page.value.pageId))
    )
      return
    void router.push({ path: route.path, query: query(thread), hash: '' })
  }
  function close() {
    open.value = false
    if (route.query.threadId !== undefined) {
      const next = { ...route.query }
      delete next.threadId
      void router.replace({ path: route.path, query: next, hash: route.hash })
    }
  }
  /** Overview rows only locate an existing shell page; the scoped detail API still grants access. */
  async function view(thread: ReviewThread, context: WorkspaceContext) {
    const path = route.path
    const next = reviewThreadTarget({
      revisionId: thread.revisionId,
      pageId: thread.pageId,
      threadId: thread.id,
    })
    if (!available.value || !next || next.revisionId !== context.revisionId) return false
    const resolved = resolvePreviewPage(context.pages, context.runtimeBaseUrl, next.pageId)
    if (resolved.invalid || !resolved.page) return false
    if (
      route.query.revisionId !== next.revisionId ||
      route.query.pageId !== next.pageId ||
      route.query.threadId !== next.threadId
    )
      if (await router.push({ path, query: { ...next }, hash: '' })) return false
    // A cancelled or superseded navigation must not reopen feedback in another shell or revision.
    if (
      !available.value ||
      route.path !== path ||
      page.value?.revisionId !== next.revisionId ||
      route.query.revisionId !== next.revisionId ||
      route.query.pageId !== next.pageId ||
      route.query.threadId !== next.threadId
    )
      return false
    open.value = true
    return true
  }
  function copy(thread: ReviewThread | undefined, event?: MouseEvent) {
    if (
      !thread ||
      !page.value ||
      thread.revisionId !== page.value.revisionId ||
      thread.pageId !== page.value.pageId
    )
      return false
    const href = router.resolve({ path: route.path, query: query(thread), hash: '' }).href
    return copyText(
      new URL(href, new URL(window.location.pathname, window.location.origin)).href,
      event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined,
    )
  }
  return { threadId, invalid, unavailable, select, close, copy, view }
}
