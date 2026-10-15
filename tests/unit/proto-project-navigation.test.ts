import { expect, it } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import { projectListLocation } from '@/modules/protohub-manager-ui/utils/project-navigation'
import type { ServerMenu } from '@/shared/auth/types'

it('returns direct-open project details to the registered default menu under the deployment base', () => {
  const router = createRouter({
    history: createWebHistory('/tools/'),
    routes: [
      {
        path: '/prototype-hub',
        alias: ['/protohub', '/PrototypeHub'],
        name: 'menu:project',
        component: {},
        meta: { menuCode: 'custom-project', menuComponentCode: 'prototype-hub/Project' },
      },
      { path: '/prototype-hub/projects/:id', name: 'project-detail', component: {} },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: {} },
    ],
  })
  const target = projectListLocation(router, [])
  expect(router.resolve(target).name).toBe('menu:project')
  expect(router.resolve(target).href).toBe('/tools/prototype-hub')
})

it('finds an administrator-configured component menu and carries only route query data', () => {
  const router = createRouter({
    history: createWebHistory('/tools/'),
    routes: [
      {
        path: '/design/prototypes',
        name: 'menu:custom-project',
        component: {},
        meta: { menuCode: 'custom' },
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: {} },
    ],
  })
  const menus: ServerMenu[] = [
    {
      id: 'root',
      code: 'design',
      name: 'Design',
      children: [
        {
          id: 'custom-project',
          code: 'custom',
          componentCode: 'protohub/Project',
          name: 'Projects',
          url: '/design/prototypes',
        },
      ],
    },
  ]
  const query = { filter: '中文标题', page: '2', return: 'https://external.test' }
  const location = projectListLocation(router, menus, query)
  expect(router.resolve(location).name).toBe('menu:custom-project')
  expect(location.query).toEqual(query)
  expect(location.query).not.toBe(query)
  expect(location.path).toBe('/design/prototypes')
})
