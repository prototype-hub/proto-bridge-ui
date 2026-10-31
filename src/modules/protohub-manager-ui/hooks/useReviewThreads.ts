import { computed, ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { publicReviewThreadsApi, reviewThreadsApi } from '../api/review-thread'
import type { ReviewGrant } from '../api/review'
import type {
  Project,
  PublicShare,
  ReviewPage,
  ReviewThread,
  ReviewMessage,
  ReviewContext,
  ReviewThreadState,
  ReviewAnchor,
} from '../types'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { ApiError } from '@/shared/api/errors'
import { copyText } from '@/shared/utils/feedback'
import { secureId } from '@/shared/utils/secure-id'
import { useReviewAssignment } from './useReviewAssignment'
import { isReviewAnchor } from '../utils/review-anchor'
import { t } from '@/shared/i18n'

export type ReviewThreadScope =
  | { kind: 'public'; page: ReviewPage; share: PublicShare; pendingInvitation: boolean }
  | { kind: 'member'; page: ReviewPage; versionId: string; project: Project; actorId: string }

/** A single shell owns its draft and request receipt key; neither is a runtime/iframe capability. */
export function useReviewThreads(
  scope: Ref<ReviewThreadScope | undefined>,
  open: Ref<boolean>,
  identity: Ref<ReviewContext | undefined> = shallowRef(),
  location?: { threadId: Ref<string | null | undefined>; select: (thread?: ReviewThread) => void },
) {
  const permissions = usePermissions()
  const threads = shallowRef<ReviewThread[]>([]),
    messages = shallowRef<ReviewMessage[]>([])
  const selectedId = ref<string>(),
    text = ref(''),
    visibility = ref<ReviewMessage['visibility']>('public')
  const detail = shallowRef<ReviewThread>()
  const anchor = shallowRef<ReviewAnchor>(),
    anchorEpoch = ref(0)
  function selectAnchor(value?: ReviewAnchor) {
    if (busy.value || selectedId.value || !isPublic.value) return
    if (value && !isReviewAnchor(value)) return
    anchor.value = value ? { ...value } : undefined
    pending.value = undefined
    anchorEpoch.value++
  }
  const imageFile = shallowRef<File>(),
    imagePreview = ref(''),
    imageView = shallowRef<{ messageId: string; url?: string; loading?: boolean; error?: string }>()
  let imageSequence = 0,
    viewSequence = 0,
    imageController: AbortController | undefined
  const filter = ref<ReviewThreadState | ''>(''),
    pageIndex = ref(0),
    messagesPageIndex = ref(0),
    total = ref(0),
    messagesTotal = ref(0)
  const loading = ref(false),
    busy = ref(false),
    error = ref(''),
    notice = ref(''),
    needsIdentity = ref(false)
  let generation = 0,
    controller: AbortController | undefined,
    lastScope = '',
    lastActor = '',
    lastTarget: string | null | undefined
  const pending = shallowRef<{
    semantic: string
    clientRequestId: string
    expectedVersion?: number
  }>()
  const hasPendingRequest = computed(() => !!pending.value)
  const selected = computed(() => detail.value)
  const targeted = computed(() => location?.threadId.value !== undefined)
  const isPublic = computed(() => scope.value?.kind === 'public')
  const scopeKey = computed(() => {
    const target = scope.value
    return target
      ? JSON.stringify([
          target.kind,
          target.kind === 'public'
            ? [target.share.token, target.share.accessKey]
            : target.versionId,
          target.page.revisionId,
          target.page.pageId,
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
  const policyEnabled = computed(() => !isPublic.value || identity.value?.allowComment === true)
  const authenticationRequired = computed(
    () =>
      isPublic.value &&
      (needsIdentity.value ||
        !identity.value?.session ||
        (scope.value?.kind === 'public' && scope.value.pendingInvitation)),
  )
  function authorized() {
    const target = scope.value
    if (!target) return false
    if (target.kind === 'member')
      return (
        projectAllows(target.project, 'edit') &&
        permissions.can(p.version.query) &&
        !!target.actorId
      )
    const session = identity.value?.session
    return (
      target.share.reviewEnabled === true &&
      target.share.revisionMode === 'fixed' &&
      target.page.revisionId === target.share.revisionId &&
      !!target.share.accessKey &&
      identity.value?.enabled === true &&
      identity.value.allowComment === true &&
      !!session &&
      session.expiresAt > Date.now() &&
      !needsIdentity.value &&
      !target.pendingInvitation
    )
  }
  const readable = computed(() => authorized())
  const writable = computed(
    () =>
      readable.value &&
      (!targeted.value || !!selected.value) &&
      (isPublic.value || permissions.can(p.version.save)),
  )
  const assignment = useReviewAssignment(scope, open, selectedId, readable)
  function abort() {
    generation++
    controller?.abort()
    loading.value = busy.value = false
    clearImageView()
  }
  function clearImageView() {
    viewSequence++
    imageController?.abort()
    if (imageView.value?.url) URL.revokeObjectURL(imageView.value.url)
    imageView.value = undefined
  }
  function selectImage(file?: File) {
    if (busy.value) return
    if (file && !selectedId.value && !isPublic.value) {
      notice.value = t('proto.feedbackImageThreadRequired')
      return
    }
    if (
      file &&
      (!['image/png', 'image/jpeg'].includes(file.type) ||
        !file.size ||
        file.size > 5 * 1024 * 1024)
    ) {
      notice.value = t('proto.feedbackImageInvalid')
      return
    }
    imageSequence++
    imageFile.value = file
    notice.value = ''
  }
  watch(
    [imageFile, open, messages],
    () => {
      if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
      imagePreview.value = imageFile.value && open.value ? URL.createObjectURL(imageFile.value) : ''
    },
    { flush: 'sync' },
  )
  async function viewImage(message: ReviewMessage) {
    if (imageView.value?.messageId === message.id && !imageView.value.error) {
      clearImageView()
      return
    }
    if (
      !open.value ||
      !authorized() ||
      !selected.value ||
      !messages.value.includes(message) ||
      !message.image
    )
      return
    clearImageView()
    const target = scope.value!,
      id = selected.value.id,
      epoch = generation,
      viewEpoch = viewSequence,
      request = new AbortController(),
      info = message.image
    imageController = request
    imageView.value = { messageId: message.id, loading: true }
    try {
      const page = { revisionId: target.page.revisionId, pageId: target.page.pageId }
      const blob =
        target.kind === 'public'
          ? await publicReviewThreadsApi.image(
              grant(target),
              id,
              message.id,
              page,
              identity.value!.csrfToken,
              request.signal,
            )
          : await reviewThreadsApi.image(target.versionId, id, message.id, page, {
              signal: request.signal,
              silent: true,
            })
      if (epoch !== generation || viewEpoch !== viewSequence || request.signal.aborted) return
      if (
        !['image/png', 'image/jpeg'].includes(info.contentType) ||
        blob.type !== info.contentType ||
        !Number.isInteger(info.size) ||
        info.size <= 0 ||
        info.size > 5 * 1024 * 1024 ||
        blob.size !== info.size ||
        !Number.isInteger(info.width) ||
        !Number.isInteger(info.height) ||
        info.width < 1 ||
        info.height < 1 ||
        info.width > 16384 ||
        info.height > 16384 ||
        info.width * info.height > 16000000
      )
        throw new ApiError(t('proto.feedbackImageUnavailable'))
      imageView.value = { messageId: message.id, url: URL.createObjectURL(blob) }
    } catch (cause) {
      if (epoch !== generation || viewEpoch !== viewSequence || request.signal.aborted) return
      if (
        cause instanceof ApiError &&
        (cause.status === 403 ||
          (cause.status === 404 && cause.code !== 'PROTOTYPE_HUB_REVIEW_IMAGE_UNAVAILABLE'))
      )
        failed(cause)
      else imageView.value = { messageId: message.id, error: t('proto.feedbackImageUnavailable') }
    }
  }
  function imageFailed(messageId: string) {
    if (imageView.value?.messageId !== messageId) return
    clearImageView()
    imageView.value = { messageId, error: t('proto.feedbackImageUnavailable') }
  }
  function clearDraft() {
    anchor.value = undefined
    anchorEpoch.value++
    text.value = ''
    visibility.value = 'public'
    pending.value = undefined
    imageFile.value = undefined
  }
  function clearData() {
    clearImageView()
    threads.value = []
    messages.value = []
    detail.value = undefined
    total.value = messagesTotal.value = 0
  }
  function grant(target: Extract<ReviewThreadScope, { kind: 'public' }>): ReviewGrant {
    return {
      token: target.share.token,
      revisionId: target.page.revisionId,
      accessKey: target.share.accessKey!,
    }
  }
  function failed(cause: unknown) {
    if (cause instanceof ApiError) {
      if (cause.code === 'PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED') {
        needsIdentity.value = true
        clearData()
        error.value = t('proto.feedbackAuthenticate')
        return
      }
      if (cause.status === 403 || cause.status === 404) {
        clearDraft()
        clearData()
        if (!targeted.value) selectedId.value = undefined
        error.value = t(
          cause.code === 'PROTOTYPE_HUB_REVIEW_COMMENTS_DISABLED'
            ? 'proto.feedbackDisabled'
            : 'proto.feedbackUnavailable',
        )
        return
      }
      if (cause.status === 429) {
        notice.value = t('proto.reviewRateLimited')
        return
      }
    }
    error.value = t('proto.feedbackUnavailable')
  }
  async function load() {
    abort()
    clearData()
    error.value = ''
    notice.value = ''
    if (location?.threadId.value === null) {
      error.value = t('proto.feedbackInvalidTarget')
      return
    }
    if (!open.value || !authorized()) return
    const target = scope.value!,
      epoch = generation,
      request = new AbortController(),
      id = selectedId.value
    controller = request
    loading.value = true
    const page = {
      revisionId: target.page.revisionId,
      pageId: target.page.pageId,
      pageIndex: pageIndex.value,
      pageSize: 20,
      ...(filter.value ? { state: filter.value } : {}),
    }
    try {
      const result =
        target.kind === 'public'
          ? await publicReviewThreadsApi.query(
              grant(target),
              page,
              identity.value!.csrfToken,
              request.signal,
            )
          : await reviewThreadsApi.query(target.versionId, page, {
              signal: request.signal,
              silent: true,
            })
      if (epoch !== generation || request.signal.aborted) return
      if (
        result.data.some(
          (row) => row.revisionId !== target.page.revisionId || row.pageId !== target.page.pageId,
        )
      )
        throw new ApiError('Invalid feedback scope', 404)
      threads.value = result.data
      total.value = result.total
      if (id) {
        // A known thread is independent of the list's current page and status filter.
        const input = { revisionId: target.page.revisionId, pageId: target.page.pageId }
        const row =
          target.kind === 'public'
            ? await publicReviewThreadsApi.detail(
                grant(target),
                id,
                input,
                identity.value!.csrfToken,
                request.signal,
              )
            : await reviewThreadsApi.detail(target.versionId, id, input, {
                signal: request.signal,
                silent: true,
              })
        if (epoch !== generation || request.signal.aborted) return
        if (row.id !== id || row.revisionId !== input.revisionId || row.pageId !== input.pageId)
          throw new ApiError('Invalid feedback scope', 404)
        detail.value = row
        const query = {
          revisionId: target.page.revisionId,
          pageId: target.page.pageId,
          pageIndex: messagesPageIndex.value,
          pageSize: 20,
        }
        const rows =
          target.kind === 'public'
            ? await publicReviewThreadsApi.messages(
                grant(target),
                id,
                query,
                identity.value!.csrfToken,
                request.signal,
              )
            : await reviewThreadsApi.messages(target.versionId, id, query, {
                signal: request.signal,
                silent: true,
              })
        if (epoch !== generation || request.signal.aborted) return
        // A contradictory public response must never render an internal note or another thread.
        if (
          rows.data.some(
            (row) =>
              row.threadId !== id || (target.kind === 'public' && row.visibility !== 'public'),
          )
        )
          throw new ApiError('Invalid feedback scope', 404)
        messages.value = rows.data
        messagesTotal.value = rows.total
      }
    } catch (cause) {
      if (epoch === generation && !request.signal.aborted) failed(cause)
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function choose(thread?: ReviewThread) {
    if (busy.value || (thread && !threads.value.includes(thread))) return
    if (location) {
      location.select(thread)
      return
    }
    if (selectedId.value !== thread?.id) clearDraft()
    selectedId.value = thread?.id
    messagesPageIndex.value = 0
    void load()
  }
  function page(number: number) {
    if (busy.value) return
    if (!targeted.value) {
      selectedId.value = undefined
      clearDraft()
    }
    pageIndex.value = Math.max(0, Math.min(10000, number - 1))
    void load()
  }
  function messagePage(number: number) {
    if (busy.value) return
    messagesPageIndex.value = Math.max(0, Math.min(10000, number - 1))
    void load()
  }
  function changeFilter(value: ReviewThreadState | '') {
    if (busy.value) return
    filter.value = value
    if (!targeted.value) {
      selectedId.value = undefined
      clearDraft()
    }
    pageIndex.value = 0
    void load()
  }
  async function mutate(state?: ReviewThreadState) {
    const target = scope.value,
      thread = selected.value
    if (!target || !open.value || !authorized() || !writable.value || busy.value || loading.value)
      return
    if (targeted.value && !thread) return
    if (selectedId.value && !thread) return
    if (
      state &&
      (!thread || (target.kind === 'public' && (state !== 'open' || thread.canReopen !== true)))
    )
      return
    if (!state && target.kind === 'member' && !thread) return
    const file = !state ? imageFile.value : undefined
    const body = text.value.trim()
    if (!state && (!body || body.length > 4000)) {
      notice.value = t('proto.feedbackTextRequired')
      return
    }
    const page = { revisionId: target.page.revisionId, pageId: target.page.pageId }
    const semantic = JSON.stringify([
      scopeKey.value,
      actor.value,
      thread?.id || '',
      state ? 'status' : file ? 'image' : 'text',
      state || body,
      state ? '' : target.kind === 'member' ? visibility.value : 'public',
      ...(file ? [imageSequence] : []),
      ...(!thread && !state && anchor.value ? [anchor.value] : []),
    ])
    if (pending.value?.semantic !== semantic)
      pending.value = {
        semantic,
        clientRequestId: secureId(),
        ...(state ? { expectedVersion: thread!.configVersion } : {}),
      }
    const receipt = pending.value,
      epoch = generation,
      request = new AbortController()
    controller?.abort()
    controller = request
    busy.value = true
    error.value = notice.value = ''
    try {
      if (state) {
        const input = {
          ...page,
          state,
          expectedVersion: receipt.expectedVersion!,
          clientRequestId: receipt.clientRequestId,
        }
        if (target.kind === 'public')
          await publicReviewThreadsApi.status(
            grant(target),
            thread!.id,
            { ...input, state: 'open' },
            identity.value!.csrfToken,
            request.signal,
          )
        else
          await reviewThreadsApi.status(target.versionId, thread!.id, input, {
            signal: request.signal,
            silent: true,
          })
      } else {
        const input = {
          ...page,
          text: body,
          clientRequestId: receipt.clientRequestId,
          ...(!thread && target.kind === 'public' && anchor.value
            ? { anchor: { ...anchor.value } }
            : {}),
        }
        if (target.kind === 'public' && !thread) {
          // Create the thread and first image message together; never leave a text-only shell.
          const created = file
            ? await publicReviewThreadsApi.createImage(
                grant(target),
                input,
                file,
                identity.value!.csrfToken,
                request.signal,
              )
            : await publicReviewThreadsApi.create(
                grant(target),
                input,
                identity.value!.csrfToken,
                request.signal,
              )
          if (epoch !== generation || request.signal.aborted) return
          if (created.revisionId !== page.revisionId || created.pageId !== page.pageId)
            throw new ApiError('Invalid feedback scope', 404)
          selectedId.value = created.id
          location?.select(created)
          pageIndex.value = 0
          filter.value = ''
        } else if (file && target.kind === 'public')
          await publicReviewThreadsApi.replyImage(
            grant(target),
            thread!.id,
            input,
            file,
            identity.value!.csrfToken,
            request.signal,
          )
        else if (file && target.kind === 'member')
          await reviewThreadsApi.replyImage(
            target.versionId,
            thread!.id,
            { ...input, visibility: visibility.value },
            file,
            { signal: request.signal, silent: true },
          )
        else if (target.kind === 'public')
          await publicReviewThreadsApi.reply(
            grant(target),
            thread!.id,
            input,
            identity.value!.csrfToken,
            request.signal,
          )
        else
          await reviewThreadsApi.reply(
            target.versionId,
            thread!.id,
            { ...input, visibility: visibility.value },
            { signal: request.signal, silent: true },
          )
      }
      if (epoch !== generation || request.signal.aborted) return
      pending.value = undefined
      if (!state) clearDraft()
      filter.value = ''
      messagesPageIndex.value = 0
      await load()
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 409) {
        pending.value = undefined
        await load()
        if (generation === epoch + 1) notice.value = t('proto.feedbackConflict')
      } else if (cause instanceof ApiError && [403, 404, 429].includes(cause.status)) failed(cause)
      else if (file && cause instanceof ApiError && [400, 413].includes(cause.status))
        notice.value = t('proto.feedbackImageInvalid')
      else notice.value = t('proto.feedbackResultUnknown')
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  const send = () => mutate()
  const status = (state: ReviewThreadState) => mutate(state)
  function copyDraft(event?: MouseEvent) {
    return copyText(
      text.value,
      event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined,
    )
  }
  watch(
    identity,
    (current) => {
      if (current?.session) needsIdentity.value = false
    },
    { flush: 'sync' },
  )
  watch(
    [
      scopeKey,
      open,
      readable,
      actor,
      () => identity.value?.csrfToken,
      () => location?.threadId.value,
    ],
    () => {
      const changedScope = scopeKey.value !== lastScope
      if (changedScope) {
        lastScope = scopeKey.value
        lastActor = ''
        selectedId.value = undefined
        clearDraft()
        filter.value = ''
        pageIndex.value = messagesPageIndex.value = 0
        needsIdentity.value = false
      }
      if (actor.value) {
        if (lastActor && actor.value !== lastActor) {
          selectedId.value = location?.threadId.value || undefined
          clearDraft()
        }
        lastActor = actor.value
      }
      if (location && (changedScope || location.threadId.value !== lastTarget)) {
        lastTarget = location.threadId.value
        selectedId.value = lastTarget || undefined
        clearDraft()
        messagesPageIndex.value = 0
      }
      if (
        (scope.value?.kind === 'member' && !authorized()) ||
        (scope.value?.kind === 'public' && identity.value && identity.value.allowComment !== true)
      ) {
        selectedId.value = location?.threadId.value || undefined
        clearDraft()
      }
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    abort()
    if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
    imagePreview.value = ''
    clearData()
    clearDraft()
  })
  return {
    assignment,
    anchor,
    anchorEpoch,
    selectAnchor,
    imageFile,
    imagePreview,
    imageView,
    selectImage,
    viewImage,
    imageFailed,
    threads,
    messages,
    selected,
    selectedId,
    targeted,
    text,
    visibility,
    filter,
    pageIndex,
    messagesPageIndex,
    total,
    messagesTotal,
    loading,
    busy,
    hasPendingRequest,
    error,
    notice,
    isPublic,
    policyEnabled,
    authenticationRequired,
    readable,
    writable,
    load,
    choose,
    page,
    messagePage,
    changeFilter,
    send,
    status,
    copyDraft,
  }
}
export type ReviewThreadsController = ReturnType<typeof useReviewThreads>
