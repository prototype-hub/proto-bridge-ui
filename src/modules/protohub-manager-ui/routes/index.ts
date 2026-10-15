import type { RouteRecordRaw } from 'vue-router'
import { protoPermissions } from './permissions'
export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: '/prototype-hub/projects/:id',
    alias: ['/protohub/projects/:id', '/PrototypeHub/projects/:id'],
    name: 'project-detail',
    component: () => import('@/modules/protohub-manager-ui/views/project/detail/index.vue'),
    meta: { permission: protoPermissions.project.query },
  },
]
export const independentRoutes: RouteRecordRaw[] = [
  {
    path: '/preview/:projectId/:versionId',
    alias: [
      '/prototype-hub/projects/:projectId/versions/:versionId',
      '/protohub/projects/:projectId/versions/:versionId',
      '/PrototypeHub/projects/:projectId/versions/:versionId',
      '/prototype-hub/preview/:projectId/:versionId',
      '/protohub/preview/:projectId/:versionId',
      '/PrototypeHub/preview/:projectId/:versionId',
    ],
    name: 'PrototypeHub-preview-window',
    component: () => import('@/modules/protohub-manager-ui/views/preview/index.vue'),
    meta: { standalone: true, permission: protoPermissions.version.query },
  },
  {
    path: '/share/:token',
    alias: ['/prototype-hub/share/:token', '/protohub/share/:token', '/PrototypeHub/share/:token'],
    name: 'PrototypeHub-public-share',
    component: () => import('@/modules/protohub-manager-ui/views/share/index.vue'),
    meta: { public: true },
  },
]
