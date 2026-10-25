import { ref, watch, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseReviewInvitation } from '@/modules/protohub-manager-ui/utils/review-invitation'
import { t } from '@/shared/i18n'

/** A page-local handoff survives password/drawer/logout, but never a different share or page disposal. */
export function useShareInvitation() {
  const route = useRoute(),
    router = useRouter()
  const invitation = ref<string | null>()
  const ready = ref(false),
    error = ref('')
  let share = '',
    generation = 0
  async function clean() {
    const epoch = ++generation
    ready.value = false
    error.value = ''
    try {
      await router.replace({ path: route.path, query: route.query, hash: '' })
      if (epoch === generation) ready.value = !route.hash
    } catch {
      if (epoch === generation) error.value = t('proto.reviewInvitationCleanFailed')
    }
  }
  watch(
    () => [route.params.token, route.hash],
    () => {
      if (share !== route.params.token) {
        generation++
        share = String(route.params.token)
        invitation.value = undefined
        error.value = ''
      }
      const found = parseReviewInvitation(route.hash)
      if (found !== undefined) {
        invitation.value = found
        void clean()
      } else ready.value = true
    },
    { immediate: true, flush: 'sync' },
  )
  const abandon = () => {
    invitation.value = undefined
  }
  onScopeDispose(() => {
    generation++
    abandon()
  })
  return { invitation, ready, error, clean, abandon }
}
