import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '@/modules/authentication-manager-ui/api/account/center'
import { sessionApi } from '@/modules/authentication-manager-ui/api/auth/session'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { useSession } from '@/app/stores/session'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
export function useAccount() {
  const session = useSession(),
    router = useRouter(),
    task = useTask(),
    editing = ref<Model>(),
    changing = ref<Model>()
  const resource = useResource(() => sessionApi.user(), undefined)
  // Display only committed data; a cancelled or older load must never overwrite the profile.
  const profile = computed<Model>(() => ({ ...resource.data.value }))
  async function save(data: Model) {
    await task.run(async () => {
      const details = Object.fromEntries(
        ['name', 'avatar', 'telephone', 'email']
          .filter((key) => data[key] !== undefined)
          .map((key) => [key, data[key]]),
      )
      await api.updateMeInfo_api(details)
      saved()
      editing.value = undefined
      await resource.load()
      if (!resource.error.value && resource.data.value) session.user = resource.data.value
    })
  }
  async function passwordChanged() {
    saved()
    changing.value = undefined
    session.clear()
    await router.replace('/login')
  }
  onMounted(resource.load)
  return {
    session,
    task,
    resource,
    profile,
    editing,
    changing,
    save,
    passwordChanged,
  }
}
