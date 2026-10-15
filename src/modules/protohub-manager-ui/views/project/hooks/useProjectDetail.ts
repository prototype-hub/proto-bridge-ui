import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { deleted } from '@/shared/utils/feedback'
import type { Version, UploadContext, Project } from '@/modules/protohub-manager-ui/types'
export function useProjectDetail() {
  const route = useRoute()
  const router = useRouter()
  const id = computed(() => String(route.params.id))
  const task = useTask()
  const uploadOpen = ref(false)
  const uploadContext = ref<UploadContext>({ projectId: id.value })
  const shareVersion = ref<Version>()
  const resource = useResource(
    async (signal) => {
      const [project, versions] = await Promise.all([
        projectsApi.get(id.value, { signal, silent: true }),
        versionsApi.list(id.value, { signal, silent: true }),
      ])
      return { project, versions }
    },
    { project: undefined as Project | undefined, versions: [] as Version[] },
  )
  function upload(version?: Version) {
    uploadContext.value = { projectId: id.value, version }
    uploadOpen.value = true
  }
  function preview(version: Version) {
    window.open(
      applicationUrl(
        router,
        router.resolve({
          name: 'PrototypeHub-preview-window',
          params: { projectId: id.value, versionId: version.id },
        }).path,
      ),
      '_blank',
      'noopener,noreferrer',
    )
  }
  async function remove(key: string) {
    await task.run(async () => {
      await versionsApi.remove(key)
      deleted()
      await resource.load()
    })
  }
  watch(
    id,
    () => {
      shareVersion.value = undefined
      uploadOpen.value = false
      void resource.load()
    },
    { immediate: true },
  )
  return { resource, task, uploadOpen, uploadContext, shareVersion, upload, preview, remove }
}
