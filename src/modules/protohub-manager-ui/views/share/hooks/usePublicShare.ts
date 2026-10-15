import { computed, ref, watch } from 'vue'
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
  const resource = useResource<{ share?: PublicShare; context?: WorkspaceContext }>(
    async (signal) => prepare(await publicApi.get(token.value, { signal }), signal),
    {},
  )
  async function prepare(share: PublicShare, signal?: AbortSignal) {
    if (!share.accessKey) {
      if (!share.passwordRequired) throw new Error(t('proto.unavailable'))
      return { share }
    }
    if (!share.runtimeBaseUrl || !share.previewUrl) throw new Error(t('proto.unavailable'))
    const pages = await publicApi.pages(share.token, share.accessKey, { signal })
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
    if (!password.value) {
      task.error.value = t('proto.passwordRequired')
      return
    }
    const key = token.value
    await task.run(async () => {
      const result = await prepare(await publicApi.verify(key, password.value))
      if (token.value === key) resource.data.value = result
      password.value = ''
    })
  }
  watch(
    token,
    () => {
      resource.data.value = {}
      password.value = ''
      task.error.value = ''
      void resource.load()
    },
    { immediate: true },
  )
  return { resource, task, password, verify }
}
