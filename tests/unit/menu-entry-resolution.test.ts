import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { componentMap, resolveMenuComponent } from '@/app/modules/registry'
import { adaptMenus } from '@/app/router/menu-adapter'
import { defaultPage } from '@/app/router/navigation'
import type { ServerMenu } from '@/shared/auth/types'
import { permissionSet, hasPermission } from '@/shared/auth/permissions'
import { protectedRoutes, independentRoutes } from '@/modules/protohub-manager-ui'
import { protoPermissions } from '@/modules/protohub-manager-ui/routes/permissions'
import { publicAuthRoutes } from '@/modules/authentication-manager-ui'

const menu = (code: string, url: string, extra: Partial<ServerMenu> = {}): ServerMenu => ({
  id: code,
  code,
  name: code,
  url,
  ...extra,
})

describe('build-time menu entry resolution', () => {
  it('loads the real renamed index entries and excludes standalone and detail components', async () => {
    expect(Object.keys(componentMap)).toEqual(
      expect.arrayContaining([
        'system/Basis',
        'system/Department',
        'system/Dictionary',
        'system/Positions',
        'system/User',
        'system/Role',
        'system/Menu',
        'system/Permission',
        'system/Log',
        'system/Log/Access',
        'system/Log/System',
        'prototype-hub/Project',
      ]),
    )
    for (const code of [
      'system/Account',
      'prototype-hub/Preview',
      'prototype-hub/Share',
      'prototype-hub/Detail',
    ])
      expect(componentMap[code]).toBeUndefined()
    const user = await componentMap['system/User']!()
    const project = await componentMap['prototype-hub/Project']!()
    expect(user.default).toHaveProperty('name', 'UsersView')
    expect(project.default).toHaveProperty('name', 'ProjectsView')
  }, 20000)

  it('uses current registered code or URL before a preserved legacy binding', () => {
    expect(
      resolveMenuComponent(
        menu('system/Role', '/system/role', {
          componentCode: 'system/User',
        }),
        '/system/role',
      )?.code,
    ).toBe('system/Role')
    expect(
      resolveMenuComponent(
        menu('custom', '/system/role', {
          options: { meta: { componentCode: 'system/User' } },
        }),
        '/system/role',
      )?.code,
    ).toBe('system/Role')
    expect(
      resolveMenuComponent(
        menu('custom', '/design/users', {
          componentCode: 'system/User',
        }),
        '/design/users',
      )?.code,
    ).toBe('system/User')
    expect(
      resolveMenuComponent(
        menu('custom', '/system/user', {
          componentCode: 'removed/Page',
        }),
        '/system/user',
      )?.code,
    ).toBe('system/User')
  })

  it('normalizes only declared namespace aliases and registered entry keys', () => {
    for (const code of ['prototype-hub/Project', 'protohub/Project', 'PrototypeHub/PROJECT/index'])
      expect(resolveMenuComponent(menu(code, '/design/projects'), '/design/projects')?.code).toBe(
        'prototype-hub/Project',
      )
    expect(
      resolveMenuComponent(menu('system/position/index', '/org/jobs'), '/org/jobs')?.code,
    ).toBe('system/Positions')
    expect(
      resolveMenuComponent(menu('custom', '/pRoToHuB/projects'), '/pRoToHuB/projects')?.code,
    ).toBe('prototype-hub/Project')
    expect(resolveMenuComponent(menu('custom', '/logger/access'), '/logger/access')?.code).toBe(
      'system/Log/Access',
    )
    expect(
      resolveMenuComponent(menu('custom', '/system/log/system'), '/system/log/system')?.code,
    ).toBe('system/Log/System')
    expect(resolveMenuComponent(menu('custom', '/unknown/user'), '/unknown/user')).toBeUndefined()
    expect(resolveMenuComponent(menu('external/User', '/unknown'), '/unknown')).toBeUndefined()
  })

  it('does not register a denied child through its module directory URL', () => {
    for (const code of ['prototype-hub', 'protohub', 'PrototypeHub', 'system']) {
      const root = menu(code, '/prototype-hub', {
        children: [menu('prototype-hub/Project', '/prototype-hub', { granted: false })],
      })
      expect(resolveMenuComponent(root, '/prototype-hub')).toBeUndefined()
      const adapted = adaptMenus([root])
      expect(adapted.routes).toEqual([])
      expect(adapted.links).toEqual([])
      expect(defaultPage(adapted.links)).toBe('/account/center')
    }
  })

  it('preserves static route boundaries even with a recognized custom binding', () => {
    const reserved = [
      '/account/center',
      '/login',
      '/share/open',
      '/preview/p1/v1',
      '/prototype-hub/share/open',
      '/protohub/preview/p1/v1',
      '/PrototypeHub/share/open',
      '/prototype-hub/projects/p1',
      '/protohub/projects/:id',
      '/PrototypeHub/projects/p1',
      '/prototype-hub/projects/p1/versions/v1',
      '/protohub/projects/p1/versions/v1',
      '//external.test',
      '/system/../user',
      '/system/user?redirect=external',
    ]
    for (const path of reserved) {
      const row = menu('system/User', path)
      expect(resolveMenuComponent(row, path)).toBeUndefined()
      expect(adaptMenus([row]).routes).toEqual([])
    }
    expect(adaptMenus([menu('custom', '/system/user', { granted: false })]).routes).toEqual([])
    expect(
      adaptMenus([menu('custom', '/system/user', { options: { show: false } })]).routes,
    ).toEqual([])
  })

  it('uses the resolved canonical entry for detail extensions on URL-only menus', () => {
    const routes = adaptMenus([menu('custom-role', '/system/role')]).routes
    expect(routes.map((route) => route.path)).toEqual(['/system/role', '/system/role/Detail/:id'])
    expect(routes[1]?.meta).toMatchObject({
      menuCode: 'custom-role',
      menuComponentCode: 'system/Role',
    })
  })

  it('keeps every registered public authentication route and login alias outside dynamic menus', () => {
    const paths = publicAuthRoutes.flatMap((route) => [
      route.path,
      ...(typeof route.alias === 'string' ? [route.alias] : route.alias || []),
    ])
    for (const path of [...paths, '/edge/token/recovered-session', '/USER/LOGIN/', '/relogin/']) {
      const adapted = adaptMenus([menu('system/User', path)])
      expect(adapted.routes).toEqual([])
      expect(adapted.links).toEqual([])
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [...publicAuthRoutes, ...adapted.routes],
      })
      expect(router.resolve(path).meta.public).toBe(true)
    }
    expect(adaptMenus([menu('system/User', '/oauth/callback')]).routes).toEqual([])
    for (const path of ['/user/settings', '/edge/device'])
      expect(resolveMenuComponent(menu('system/User', path), path)?.code).toBe('system/User')
  })

  it('adds legacy list aliases only to an authorized project route and preserves actual path owners', () => {
    const adapted = adaptMenus([
      menu('custom-project', '/prototype-hub'),
      menu('system/User', '/protohub', { id: 'custom-user' }),
    ])
    const project = adapted.routes.find(
      (route) => route.meta?.menuComponentCode === 'prototype-hub/Project',
    )
    expect(project?.alias).toContain('/PrototypeHub')
    expect(project?.alias).not.toContain('/protohub')
    const router = createRouter({ history: createMemoryHistory(), routes: adapted.routes })
    expect(router.resolve('/PrototypeHub/projects').name).toBe('menu:custom-project')
    expect(router.resolve('/protohub').name).toBe('menu:custom-user')
  })

  it('keeps legacy frontend URLs on the canonical permission-protected static routes', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [...protectedRoutes, ...independentRoutes],
    })
    for (const path of [
      '/prototype-hub/projects/p1',
      '/protohub/projects/p1',
      '/PrototypeHub/projects/p1',
    ]) {
      expect(router.resolve(path).name).toBe('project-detail')
      expect(router.resolve(path).meta.permission).toBe('prototype-hub-project:query')
    }
    expect(router.resolve('/protohub/projects/p1/versions/v1').name).toBe(
      'PrototypeHub-preview-window',
    )
    expect(router.resolve('/prototype-hub/share/open').meta.public).toBe(true)
    const old = permissionSet([], [{ id: 'protohub-project', actions: ['query'] }])
    expect(hasPermission(old, protoPermissions.project.query)).toBe(false)
    const current = permissionSet([], [{ id: 'prototype-hub-project', actions: ['query'] }])
    expect(hasPermission(current, protoPermissions.project.query)).toBe(true)
  })
})
