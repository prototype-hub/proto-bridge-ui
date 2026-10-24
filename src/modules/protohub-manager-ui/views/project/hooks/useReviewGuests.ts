import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { reviewGuestsApi } from '@/modules/protohub-manager-ui/api/review-guest'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import type { Project, ReviewGuest } from '@/modules/protohub-manager-ui/types'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'

/** One drawer owns its masked results; scope, pagination and close invalidate every late callback. */
export function useReviewGuests(project: Ref<Project | undefined>, open: Ref<boolean>) {
  const permissions = usePermissions()
  const readable = computed(
    () => projectAllows(project.value, 'manageShares') && permissions.can(p.share.query),
  )
  const editable = computed(() => readable.value && permissions.can(p.share.save))
  const rows = shallowRef<ReviewGuest[]>([])
  const total = ref(0)
  const pageIndex = ref(0)
  const pageSize = ref(20)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  let generation = 0
  let queryRequest: AbortController | undefined
  let mutationRequest: AbortController | undefined

  function invalidate() {
    generation++
    queryRequest?.abort()
    mutationRequest?.abort()
    rows.value = []
    total.value = 0
    loading.value = false
    busy.value = false
    error.value = ''
    notice.value = ''
  }
  async function load() {
    invalidate()
    if (!open.value || !readable.value || !project.value) return
    const current = generation
    const id = project.value.id
    const request = new AbortController()
    queryRequest = request
    loading.value = true
    try {
      const result = await reviewGuestsApi.query(
        id,
        { pageIndex: pageIndex.value, pageSize: pageSize.value },
        { signal: request.signal, silent: true },
      )
      if (current !== generation || request.signal.aborted) return
      rows.value = result.data
      total.value = result.total
    } catch (cause) {
      if (current !== generation || request.signal.aborted) return
      error.value = t(
        cause instanceof ApiError && [403, 404].includes(cause.status)
          ? 'proto.reviewGuestsAccessChanged'
          : 'proto.reviewGuestsUnavailable',
      )
    } finally {
      if (current === generation) loading.value = false
    }
  }
  function page(number: number, size = pageSize.value) {
    if (busy.value) return
    // The pager is one-based; the backend accepts only bounded zero-based pages.
    pageSize.value = Math.min(100, Math.max(1, size))
    pageIndex.value = Math.min(10000, Math.max(0, number - 1))
    void load()
  }
  async function setEnabled(guest: ReviewGuest) {
    if (!open.value || !editable.value || !project.value || busy.value || loading.value) return
    const selected = rows.value.find((row) => row.id === guest.id)
    // A confirmation opened before a refresh must never submit its stale snapshot.
    if (selected !== guest) return
    const current = generation
    const id = project.value.id
    const request = new AbortController()
    mutationRequest = request
    busy.value = true
    notice.value = ''
    try {
      await reviewGuestsApi.setEnabled(id, guest.id, !guest.enabled, guest.configVersion, {
        signal: request.signal,
        silent: true,
      })
      if (current !== generation || request.signal.aborted) return
      await load()
      if (generation === current + 1 && !error.value) notice.value = t('proto.reviewGuestUpdated')
    } catch (cause) {
      if (current !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 409) {
        // Refresh current state after a conflict, but require a new explicit confirmation to change it.
        await load()
        if (generation === current + 1) notice.value = t('proto.reviewGuestConflict')
      } else if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
        // A denied scope check clears sibling data as well as the failed action.
        invalidate()
        error.value = t('proto.reviewGuestsAccessChanged')
      } else notice.value = t('proto.reviewGuestUpdateFailed')
    } finally {
      if (current === generation) busy.value = false
    }
  }
  watch(
    () => [open.value, project.value?.id, readable.value, editable.value],
    () => {
      pageIndex.value = 0
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(invalidate)
  return {
    readable,
    editable,
    rows,
    total,
    pageIndex,
    pageSize,
    loading,
    busy,
    error,
    notice,
    load,
    page,
    setEnabled,
  }
}
