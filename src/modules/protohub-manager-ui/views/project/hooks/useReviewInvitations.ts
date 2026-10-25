import { computed, ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { reviewInvitationsApi } from '@/modules/protohub-manager-ui/api/review-invitation'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { reviewInvitationUrl } from '@/modules/protohub-manager-ui/utils/review-invitation'
import type {
  Project,
  Share,
  ReviewInvitation,
  ReviewPolicy,
} from '@/modules/protohub-manager-ui/types'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { copyText } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'

/** Keep the only raw invitation link in its management dialog, scoped to current project access. */
export function useReviewInvitations(share: Ref<Share>, project: Ref<Project | undefined>) {
  const permissions = usePermissions(),
    router = useRouter()
  const readable = computed(
    () =>
      project.value?.id === share.value.projectId &&
      projectAllows(project.value, 'manageShares') &&
      permissions.can(p.share.query),
  )
  const editable = computed(() => readable.value && permissions.can(p.share.save))
  const rows = shallowRef<ReviewInvitation[]>([]),
    policy = shallowRef<ReviewPolicy>()
  const email = ref(''),
    link = ref(''),
    createdId = ref(''),
    error = ref(''),
    notice = ref('')
  const pageIndex = ref(0),
    total = ref(0),
    loading = ref(false),
    busy = ref(false),
    now = ref(Date.now())
  let generation = 0,
    controller: AbortController | undefined
  const clock = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  const active = () =>
    !share.value.revoked &&
    share.value.enabled &&
    (!share.value.expiresAt || share.value.expiresAt > Math.max(now.value, Date.now()))
  const canCreate = computed(
    () =>
      editable.value &&
      active() &&
      share.value.revisionMode === 'fixed' &&
      !!share.value.revisionId &&
      policy.value?.enabled === true,
  )
  function clearLink() {
    link.value = ''
    createdId.value = ''
  }
  function invalidate() {
    generation++
    controller?.abort()
    loading.value = busy.value = false
    rows.value = []
    total.value = 0
    error.value = notice.value = ''
  }
  async function load() {
    invalidate()
    policy.value = undefined
    if (!readable.value) {
      clearLink()
      return
    }
    const epoch = generation,
      id = share.value.id,
      request = new AbortController()
    controller = request
    loading.value = true
    try {
      const [page, current] = await Promise.all([
        reviewInvitationsApi.query(
          id,
          { pageIndex: pageIndex.value, pageSize: 20 },
          { signal: request.signal, silent: true },
        ),
        sharesApi.reviewPolicy(id, { signal: request.signal, silent: true }),
      ])
      if (epoch !== generation || request.signal.aborted) return
      rows.value = page.data
      total.value = page.total
      policy.value = current
      if (rows.value.some((row) => row.id === createdId.value && row.status !== 'pending'))
        clearLink()
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && [403, 404].includes(cause.status)) clearLink()
      error.value = t('proto.reviewInvitationsUnavailable')
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  function page(number: number) {
    if (busy.value) return
    pageIndex.value = Math.max(0, Math.min(10000, number - 1))
    void load()
  }
  function revocable(row: ReviewInvitation) {
    return (
      editable.value &&
      active() &&
      policy.value?.enabled === true &&
      share.value.revisionMode === 'fixed' &&
      row.status === 'pending' &&
      row.expiresAt > Math.max(now.value, Date.now())
    )
  }
  async function change(action: (signal: AbortSignal) => Promise<void>) {
    const epoch = generation,
      request = new AbortController()
    controller?.abort()
    controller = request
    busy.value = true
    notice.value = ''
    try {
      await action(request.signal)
      if (epoch !== generation || request.signal.aborted) return
      await load()
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 409) {
        clearLink()
        await load()
        if (generation === epoch + 1) notice.value = t('proto.reviewInvitationConflict')
      } else {
        if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
          clearLink()
          rows.value = []
          total.value = 0
        }
        notice.value = t(
          cause instanceof ApiError && cause.status === 429
            ? 'proto.reviewInvitationRateLimited'
            : 'proto.reviewInvitationMutationUnknown',
        )
      }
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  async function create() {
    if (!canCreate.value || busy.value || loading.value || !policy.value) return
    const recipient = email.value.trim()
    if (!recipient || recipient.length > 254) {
      notice.value = t('proto.reviewInvitationEmailRequired')
      return
    }
    const selected = share.value,
      version = policy.value.configVersion
    clearLink()
    await change(async (signal) => {
      const result = await reviewInvitationsApi.create(selected.id, recipient, version, {
        signal,
        silent: true,
      })
      if (signal.aborted) return
      link.value = reviewInvitationUrl(router, selected.token, result.invitationToken)
      createdId.value = result.invitation.id
      email.value = ''
    })
  }
  async function revoke(row: ReviewInvitation) {
    if (
      busy.value ||
      loading.value ||
      !revocable(row) ||
      rows.value.find((value) => value.id === row.id) !== row
    )
      return
    if (createdId.value === row.id) clearLink()
    const id = share.value.id
    await change(async (signal) => {
      await reviewInvitationsApi.revoke(id, row.id, row.configVersion, { signal, silent: true })
    })
  }
  function copy(event?: MouseEvent) {
    if (!link.value || !editable.value || !active()) return Promise.resolve(false)
    return copyText(
      link.value,
      event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined,
    )
  }
  watch(
    () => [
      share.value.id,
      share.value.token,
      share.value.configVersion,
      project.value?.id,
      readable.value,
      editable.value,
    ],
    () => {
      clearLink()
      email.value = ''
      pageIndex.value = 0
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    clearInterval(clock)
    invalidate()
    clearLink()
    email.value = ''
  })
  return {
    readable,
    editable,
    canCreate,
    rows,
    email,
    link,
    error,
    notice,
    pageIndex,
    total,
    loading,
    busy,
    load,
    page,
    create,
    revoke,
    revocable,
    copy,
  }
}
