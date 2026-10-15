import { describe, expect, it } from 'vitest'
import type { ServerMenu } from '@/shared/auth/types'
import { adaptMenus } from '@/app/router/menu-adapter'
import { defaultPage, firstPage } from '@/app/router/navigation'

const users: ServerMenu = {
  id: 'users',
  code: 'system/User',
  name: 'Users',
  url: '/system/user',
}
const roles: ServerMenu = {
  id: 'roles',
  code: 'system/Role',
  name: 'Roles',
  url: '/system/Role',
}
const projects: ServerMenu = {
  id: 'projects',
  code: 'protohub/Project',
  name: 'Projects',
  url: '/protohub/projects',
}

describe('authorized login destination', () => {
  it('uses sorted top menus and children-first pages even when both ancestors have routes', () => {
    const menus: ServerMenu[] = [
      { ...roles, id: 'later', url: '/later', sortIndex: 20 },
      {
        ...projects,
        sortIndex: 10,
        children: [{ ...roles, children: [users] }],
      },
    ]
    const { links } = adaptMenus(menus)
    expect(links[0].key).toBe('/protohub/projects')
    expect(links[0].children?.[0].key).toBe('/system/Role')
    expect(defaultPage(links)).toBe('/system/user')
    expect(defaultPage(links)).toBe(firstPage(links[0]))
  })

  it('skips denied, hidden, empty and unregistered branches before choosing the first usable root', () => {
    const menus: ServerMenu[] = [
      { ...projects, granted: false, sortIndex: 0 },
      { ...projects, id: 'hidden', options: { show: false }, sortIndex: 1 },
      { id: 'empty', code: 'directory', name: 'Empty', sortIndex: 2, children: [] },
      { id: 'unknown', code: 'unregistered', name: 'Unknown', url: '/unknown', sortIndex: 3 },
      {
        id: 'system',
        code: 'directory',
        name: 'System',
        sortIndex: 4,
        children: [
          { ...roles, granted: false, sortIndex: 0 },
          { ...roles, id: 'hidden-role', options: { show: false }, sortIndex: 1 },
          { id: 'empty-child', code: 'directory', name: 'Empty child', sortIndex: 2 },
          { ...users, sortIndex: 3 },
        ],
      },
    ]
    const { links } = adaptMenus(menus)
    expect(links.map((item) => item.title)).toEqual(['System'])
    expect(defaultPage(links)).toBe('/system/user')
  })

  it('selects the first accessible third-level page under the first second-level directory', () => {
    const { links } = adaptMenus([
      {
        id: 'system',
        code: 'directory',
        name: 'System',
        children: [
          { ...users, sortIndex: 20 },
          {
            id: 'directory',
            code: 'directory',
            name: 'First second level',
            sortIndex: 10,
            children: [
              { ...users, id: 'blocked', granted: false, sortIndex: 0 },
              { ...users, sortIndex: 20 },
              { ...roles, sortIndex: 10 },
            ],
          },
        ],
      },
    ])
    expect(defaultPage(links)).toBe('/system/Role')
  })

  it('keeps server order when menu sort indexes are equal', () => {
    const { links } = adaptMenus([
      { ...roles, sortIndex: 1 },
      { ...users, sortIndex: 1 },
    ])
    expect(defaultPage(links)).toBe('/system/Role')
  })

  it('falls back to the protected account page without inventing menus or returning the root', () => {
    for (const menus of [
      [],
      [{ ...users, granted: false }],
      [{ id: 'empty', code: 'directory', name: 'Empty', children: [] }],
    ]) {
      const { links } = adaptMenus(menus)
      expect(links).toEqual([])
      expect(defaultPage(links)).toBe('/account/center')
    }
  })
})
