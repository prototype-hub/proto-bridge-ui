import type { RouteRecordRaw } from 'vue-router'

export const publicAuthRoutes: RouteRecordRaw[] = [
  {
    path: '/oauth',
    component: () => import('@/modules/authentication-manager-ui/views/auth/OAuthView.vue'),
    meta: { public: true },
  },
  {
    path: '/oauth/wechat',
    component: () =>
      import('@/modules/authentication-manager-ui/views/auth/WechatCallbackView.vue'),
    meta: { public: true },
  },
  {
    path: '/share/authorize',
    component: () =>
      import('@/modules/authentication-manager-ui/views/auth/PersonalAuthorizeView.vue'),
    meta: { public: true },
  },
  {
    path: '/edge/token/:id',
    component: () => import('@/modules/authentication-manager-ui/views/auth/TokenErrorView.vue'),
    meta: { public: true },
  },
  {
    path: '/login',
    alias: ['/user/login', '/relogin'],
    component: () => import('@/modules/authentication-manager-ui/views/auth/LoginView.vue'),
    meta: { public: true },
  },
]
