import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import { adaptMenus } from '@/app/router/menu-adapter'
import { splitNavigation, firstPage } from '@/app/router/navigation'

export function useNavigation() {
  const route = useRoute()
  const router = useRouter()
  const session = useSession()
  const { locale } = useI18n()
  const selectedRoot = ref<string>()
  const mobileOpen = ref(false)
  const collapsed = ref(false)
  const links = computed(() => adaptMenus(session.menus, locale.value).links)
  const navigation = computed(() => splitNavigation(links.value, route.path, selectedRoot.value))
  const showSidebar = computed(
    () => route.meta.hideSidebar !== true && navigation.value.secondary.length > 0,
  )
  const openKeys = ref<string[]>([])
  watch(
    () => route.path,
    () => {
      selectedRoot.value = undefined
      mobileOpen.value = false
    },
  )
  watch(
    () => navigation.value.root?.key,
    () => {
      openKeys.value = []
    },
  )
  async function primary(key: string | number) {
    const item = links.value.find((entry) => entry.key === key)
    if (!item) return
    selectedRoot.value = item.key
    const path = firstPage(item)
    openKeys.value = []
    if (path) await router.push(path)
  }
  async function navigate(key: string | number) {
    if (String(key).startsWith('/')) await router.push(String(key))
    mobileOpen.value = false
  }
  return { navigation, showSidebar, openKeys, mobileOpen, collapsed, primary, navigate }
}
