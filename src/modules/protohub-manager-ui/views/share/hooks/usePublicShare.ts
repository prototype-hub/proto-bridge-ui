import { computed, ref, watch, onScopeDispose } from 'vue'
import { useRoute } from 'vue-router'
import { publicApi } from '@/modules/protohub-manager-ui/api'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { previewIdentity } from '@/modules/protohub-manager-ui/utils/preview-location'
import { entryFromUrls } from '@/modules/protohub-manager-ui/utils/urls'
import { t } from '@/shared/i18n'
import type { PublicShare, WorkspaceContext } from '@/modules/protohub-manager-ui/types'
export function usePublicShare() {
  const route = useRoute()
  const token = computed(() => String(route.params.token))
  const password = ref('')
  const task = useTask()
  let generation = 0
  let verification: AbortController | undefined
  const resource = useResource<{ share?: PublicShare; context?: WorkspaceContext }>(
    async (signal) => {
      resource.data.value = {}
      return prepare(await publicApi.get(token.value, { signal }), signal)
    },
    {},
  )
  async function prepare(share: PublicShare, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error(t('proto.unavailable'))
    if (share.token !== token.value) throw new Error(t('proto.unavailable'))
    const revisionId = previewIdentity(route.query?.revisionId)
    if (revisionId === null) throw new Error(t('proto.invalidPageTarget'))
    // A deep link cannot grant historical access beyond the share's freshly resolved policy.
    if (revisionId !== undefined && revisionId !== share.revisionId)
      throw new Error(t('proto.sharePageChanged'))
    if (!share.accessKey) {
      if (!share.passwordRequired) throw new Error(t('proto.unavailable'))
      return { share }
    }
    if (
      !share.runtimeBaseUrl ||
      !share.previewUrl ||
      !share.pagesUrl ||
      share.runtimeBaseUrl !== share.pagesUrl.replace(/\/pages$/, '/runtime')
    )
      throw new Error(t('proto.unavailable'))
    const pages = await publicApi.pages(share, { signal })
    return {
      share,
      context: {
        revisionId: share.revisionId,
        locationPath: route.path,
        title: share.projectName,
        versionName: share.versionName,
        runtimeBaseUrl: share.runtimeBaseUrl,
        entryFile: entryFromUrls(share.runtimeBaseUrl, share.previewUrl),
        pages,
      },
    }
  }
  async function verify() {
    if (task.busy.value) return
    if (!password.value) {
      task.error.value = t('proto.passwordRequired')
      return
    }
    const key = token.value
    const submittedGeneration = generation
    const request = new AbortController()
    verification?.abort()
    verification = request
    await task.run(async () => {
      try {
        const result = await prepare(
          await publicApi.verify(key, password.value, { signal: request.signal }),
          request.signal,
        )
        if (submittedGeneration !== generation || request.signal.aborted) return
        resource.data.value = result
        password.value = ''
      } catch (cause) {
        if (submittedGeneration === generation && !request.signal.aborted) throw cause
      }
    })
  }
  watch(
    computed(() => JSON.stringify([token.value, route.query?.revisionId])),
    () => {
      if (
        resource.data.value.share?.token === token.value &&
        resource.data.value.context?.revisionId === route.query?.revisionId
      )
        return
      generation++
      verification?.abort()
      resource.data.value = {}
      password.value = ''
      task.error.value = ''
      void resource.load()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    generation++
    verification?.abort()
  })
  return { resource, task, password, verify }
}
