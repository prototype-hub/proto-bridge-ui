import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/app/stores/session'
import { token } from '@/shared/auth/token'
import { adaptMenus } from './menu-adapter'
import { defaultPage } from './navigation'
import { i18n } from '@/shared/i18n'
import { watch } from 'vue'
import { protectedRoutes, independentRoutes } from '@/modules/protohub-manager-ui'
import { publicAuthRoutes, accountRoutes } from '@/modules/authentication-manager-ui'
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(
    null,
    '',
    import.meta.env.BASE_URL.replace(/\/$/, '') + window.location.hash.slice(1),
  )
}
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...independentRoutes,
    ...publicAuthRoutes,
    { path: '/403', component: () => import('../views/ErrorView.vue') },
    { path: '/404', component: () => import('../views/ErrorView.vue'), meta: { public: true } },
    {
      path: '/',
      name: 'admin',
      component: () => import('../layouts/AdminLayout.vue'),
      children: [...protectedRoutes, ...accountRoutes],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/ErrorView.vue'),
    },
  ],
})
router.beforeEach(async (to) => {
  if (to.meta.public) return true
  if (!token.get()) return { path: '/login', query: { redirect: to.fullPath } }
  const session = useSession()
  try {
    const neededMenus = !to.meta.standalone
    await session.initialize(neededMenus)
    if (neededMenus) {
      const adapted = adaptMenus(session.menus, i18n.global.locale.value)
      let installed = false
      for (const route of adapted.routes)
        if (route.name && !router.hasRoute(route.name)) {
          session.registerRoutes(router.addRoute('admin', route))
          installed = true
        } else if (route.name) {
          const existing = router.getRoutes().find((record) => record.name === route.name)
          if (existing) existing.meta.title = route.meta?.title
        }
      if (installed) return to.fullPath
      if (to.path === '/') return defaultPage(adapted.links)
    }
    if (typeof to.meta.permission === 'string' && !session.can(to.meta.permission)) return '/403'
    return true
  } catch {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})
watch(i18n.global.locale, (locale) => {
  const session = useSession()
  for (const route of adaptMenus(session.menus, locale).routes) {
    const installed = router.getRoutes().find((record) => record.name === route.name)
    if (installed) installed.meta.title = route.meta?.title
  }
})
