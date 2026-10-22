import { computed, ref, watch, onScopeDispose } from 'vue'
import { useRoute } from 'vue-router'
import { publicApi } from '@/modules/protohub-manager-ui/api'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
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
    if (share.token !== token.value) throw new Error(t('proto.unavailable'))
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
    token,
    () => {
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
