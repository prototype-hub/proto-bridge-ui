import { useBranding } from '@/app/stores/branding'
import type { Branding } from '@/modules/authentication-manager-ui/types/basis'
import { onMounted, ref } from 'vue'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
import {
  getDetails_api,
  save_api,
  systemVersion,
} from '@/modules/authentication-manager-ui/api/basis/basis'
import { resultOf, isRecord } from '@/modules/authentication-manager-ui/utils/model'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { assertBasePath } from '@/modules/authentication-manager-ui/utils/branding'
export function useBasicSettings() {
  const form = ref<Model>({
    front: { headerTheme: 'light', showRecordNumber: false },
    amap: {},
    paths: { 'base-path': `${window.location.origin}/api` },
  })
  const task = useTask()
  const version = ref<Model>({})
  const resource = useResource(async () => {
    const [response, release] = await Promise.all([
      getDetails_api(['front', 'amap', 'paths']),
      systemVersion(),
    ])
    const data = resultOf(response)
    const output: Model = {}
    if (Array.isArray(data))
      for (const item of data.filter(isRecord)) output[String(item.scope)] = item.properties || {}
    const metadata = resultOf(release)
    version.value = isRecord(metadata) ? metadata : {}
    return output
  }, {})
  async function load() {
    await resource.load()
    if (!resource.error.value)
      form.value = {
        ...resource.data.value,
        front: {
          headerTheme: 'light',
          showRecordNumber: false,
          ...(isRecord(resource.data.value.front) ? resource.data.value.front : {}),
        },
        amap: isRecord(resource.data.value.amap) ? resource.data.value.amap : {},
        paths: {
          'base-path': `${window.location.origin}/api`,
          ...(isRecord(resource.data.value.paths) ? resource.data.value.paths : {}),
        },
      }
  }
  async function save() {
    await task.run(async () => {
      assertBasePath(isRecord(form.value.paths) ? form.value.paths['base-path'] : undefined)
      await save_api(
        ['front', 'amap', 'paths'].map((scope) => ({ scope, properties: form.value[scope] || {} })),
      )
      if (isRecord(form.value.front)) useBranding().apply(form.value.front as Branding)
      saved()
      await load()
    })
  }
  onMounted(load)
  return { form, task, resource, version, load, save }
}
