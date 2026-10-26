import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { publicReviewThreadsApi, reviewThreadsApi } from '../api/review-thread'
import type { Project, PublicShare, ReviewContext, ReviewThread, ReviewThreadState } from '../types'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'

export type ReviewOverviewScope =
  | { kind: 'public'; revisionId: string; share: PublicShare; pendingInvitation: boolean }
  | { kind: 'member'; revisionId: string; versionId: string; project: Project; actorId: string }

/** Read-only fixed-revision list; page-specific drafts and mutation receipts remain in their owner. */
export function useReviewThreadsOverview(
  scope: Ref<ReviewOverviewScope | undefined>,
  open: Ref<boolean>,
  identity: Ref<ReviewContext | undefined> = shallowRef(),
) {
  const permissions = usePermissions()
  const rows = shallowRef<ReviewThread[]>([])
  const total = ref(0),
    pageIndex = ref(0),
    filter = ref<ReviewThreadState | ''>('')
  const loading = ref(false),
    error = ref(''),
    needsIdentity = ref(false)
  let generation = 0,
    controller: AbortController | undefined,
    lastScope = '',
    lastActor = ''
  const scopeKey = computed(() => {
    const value = scope.value
    return value
      ? JSON.stringify([
          value.kind,
          value.kind === 'public' ? [value.share.token, value.share.accessKey] : value.versionId,
          value.revisionId,
        ])
      : ''
  })
  const actor = computed(() =>
    scope.value?.kind === 'member'
      ? scope.value.actorId
      : identity.value?.session
        ? `${identity.value.session.verificationLevel}:${identity.value.session.guestId}`
        : '',
  )
  const isPublic = computed(() => scope.value?.kind === 'public')
  const policyEnabled = computed(
    () =>
      !isPublic.value ||
      (scope.value?.kind === 'public' &&
        scope.value.share.reviewEnabled === true &&
        scope.value.share.revisionMode === 'fixed' &&
        identity.value?.enabled !== false &&
        identity.value?.allowComment !== false),
  )
  const authenticationRequired = computed(
    () =>
      isPublic.value &&
      (needsIdentity.value ||
        !identity.value?.session ||
        identity.value.session.expiresAt <= Date.now() ||
        (scope.value?.kind === 'public' && scope.value.pendingInvitation)),
  )
  function authorized() {
    const target = scope.value
    if (!target) return false
    if (target.kind === 'member')
      return (
        !!target.actorId &&
        projectAllows(target.project, 'edit') &&
        permissions.can(p.version.query)
      )
    return (
      target.share.reviewEnabled === true &&
      target.share.revisionMode === 'fixed' &&
      target.revisionId === target.share.revisionId &&
      !!target.share.accessKey &&
      identity.value?.revisionId === target.revisionId &&
      identity.value.enabled === true &&
      identity.value.allowComment === true &&
      !!identity.value.session &&
      identity.value.session.expiresAt > Date.now() &&
      !needsIdentity.value &&
      !target.pendingInvitation
    )
  }
  const readable = computed(() => authorized())
  function invalidate() {
    generation++
    controller?.abort()
    rows.value = []
    total.value = 0
    loading.value = false
    error.value = ''
  }
  async function load() {
    invalidate()
    if (
      scope.value?.kind === 'public' &&
      identity.value?.session &&
      identity.value.session.expiresAt <= Date.now()
    )
      needsIdentity.value = true
    if (!open.value || !authorized()) return
    const target = scope.value!,
      epoch = generation,
      request = new AbortController()
    controller = request
    loading.value = true
    const data = {
      revisionId: target.revisionId,
      pageIndex: pageIndex.value,
      pageSize: 20,
      ...(filter.value ? { state: filter.value } : {}),
    }
    try {
      const result =
        target.kind === 'public'
          ? await publicReviewThreadsApi.overview(
              {
                token: target.share.token,
                revisionId: target.revisionId,
                accessKey: target.share.accessKey!,
              },
              data,
              identity.value!.csrfToken,
              request.signal,
            )
          : await reviewThreadsApi.overview(target.versionId, data, {
              signal: request.signal,
              silent: true,
            })
      if (epoch !== generation || request.signal.aborted) return
      if (result.data.some((row) => row.revisionId !== target.revisionId))
        throw new ApiError(t('proto.feedbackUnavailable'), 404)
      rows.value = result.data
      total.value = result.total
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && cause.code === 'PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED') {
        needsIdentity.value = true
        error.value = t('proto.overviewAuthenticate')
      } else
        error.value = t(
          cause instanceof ApiError && cause.status === 429
            ? 'proto.reviewRateLimited'
            : 'proto.feedbackUnavailable',
        )
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function page(number: number) {
    if (!Number.isInteger(number) || number < 1 || number > 10001) return
    pageIndex.value = number - 1
    void load()
  }
  function changeFilter(value: ReviewThreadState | '') {
    if (!['', 'open', 'resolved'].includes(value)) return
    filter.value = value
    pageIndex.value = 0
    void load()
  }
  watch(
    identity,
    (value) => {
      if (value?.session) needsIdentity.value = false
    },
    { flush: 'sync' },
  )
  watch(
    [scopeKey, open, readable, actor, () => identity.value?.csrfToken],
    () => {
      if (scopeKey.value !== lastScope) {
        lastScope = scopeKey.value
        lastActor = ''
        filter.value = ''
        pageIndex.value = 0
        needsIdentity.value = false
      }
      // Expiry and same-actor verification preserve the current query, never another actor's list.
      if (actor.value) {
        if (lastActor && lastActor !== actor.value) {
          filter.value = ''
          pageIndex.value = 0
        }
        lastActor = actor.value
      }
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(invalidate)
  return {
    rows,
    total,
    pageIndex,
    filter,
    loading,
    error,
    isPublic,
    policyEnabled,
    authenticationRequired,
    readable,
    load,
    page,
    changeFilter,
  }
}
export type ReviewThreadsOverviewController = ReturnType<typeof useReviewThreadsOverview>
