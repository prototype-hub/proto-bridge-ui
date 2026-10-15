import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { useResource } from '@/shared/composables/useResource'
import type { WorkspaceContext } from '@/modules/protohub-manager-ui/types'
export function usePreview() {
  const route = useRoute()
  const resource = useResource<WorkspaceContext | undefined>(async (signal) => {
    const [project, version, pages] = await Promise.all([
      projectsApi.get(String(route.params.projectId), { signal, silent: true }),
      versionsApi.get(String(route.params.versionId), { signal, silent: true }),
      versionsApi.pages(String(route.params.versionId), { signal, silent: true }),
    ])
    return {
      title: project.name,
      versionName: version.versionName,
      runtimeBaseUrl: version.runtimeBaseUrl,
      entryFile: version.entryFile,
      pages,
    }
  }, undefined)
  const key = computed(() => `${route.params.projectId}/${route.params.versionId}`)
  watch(key, resource.load, { immediate: true })
  return resource
}
