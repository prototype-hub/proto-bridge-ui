import { onScopeDispose, watch, type Ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { publicApi } from '../../../api'
import type { PublicShare } from '../../../types'

/** The outer shell owns one acknowledgement; page switches never create a new visit. */
export function useShareVisit(share: Ref<PublicShare | undefined>) {
  let submitted = false
  let controller = new AbortController()
  let retry: ReturnType<typeof setTimeout> | undefined
  watch(
    () => [
      share.value?.token,
      share.value?.accessKey,
      share.value?.revisionId,
      share.value?.visitTicket,
    ],
    () => {
      controller.abort()
      clearTimeout(retry)
      controller = new AbortController()
      submitted = false
    },
  )
  function opened() {
    const current = share.value
    if (submitted || !current?.accessKey || !current.visitTicket) return
    submitted = true
    const signal = controller.signal
    const record = async (retrying = false) => {
      try {
        await publicApi.visit(current, { signal })
      } catch (cause) {
        // Reuse the signed event on a single transient retry; counting never interrupts viewing.
        if (
          !signal.aborted &&
          !retrying &&
          (!(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500)
        )
          retry = setTimeout(() => void record(true), 1500)
      }
    }
    void record()
  }
  onScopeDispose(() => {
    controller.abort()
    clearTimeout(retry)
  })
  return { opened }
}
