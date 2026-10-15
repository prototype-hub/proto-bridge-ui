import type { RouteRecordRaw } from 'vue-router'

export const accountRoutes: RouteRecordRaw[] = [
  {
    path: '/account/center',
    component: () => import('@/modules/authentication-manager-ui/views/account/index.vue'),
    meta: { hideSidebar: true },
  },
  {
    path: '/account/center/bind',
    component: () => import('@/modules/authentication-manager-ui/views/auth/AccountBindView.vue'),
    meta: { hideSidebar: true },
  },
  { path: '/account', redirect: '/account/center' },
]
