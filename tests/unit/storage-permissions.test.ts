import { describe, it, expect, beforeEach } from 'vitest'
import { createStorage } from '@/shared/storage'
import { permissionSet, hasPermission } from '@/shared/auth/permissions'
import type { ServerMenu } from '@/shared/auth/types'
beforeEach(() => localStorage.clear())
describe('storage and authorization', () => {
  it('migrates keys once and clears old tokens on logout', () => {
    const store = createStorage(localStorage, 'new', ['old'])
    localStorage.setItem('old:token', 'session')
    expect(store.get('token')).toBe('session')
    expect(localStorage.getItem('old:token')).toBeNull()
    store.remove('token', ['X-Access-Token'])
    expect(store.get('token', ['X-Access-Token'])).toBeNull()
  })
  it('prefers the current namespace', () => {
    const store = createStorage(localStorage, 'new', ['old'])
    localStorage.setItem('new:language', 'en')
    localStorage.setItem('old:language', 'zh')
    expect(store.get('language')).toBe('en')
  })
  it('uses only granted menu actions and explicit resources', () => {
    const menus: ServerMenu[] = [
      {
        id: 'a',
        code: 'system/User',
        name: 'User',
        permissions: [{ permission: 'protohub-version', actions: ['save'] }],
        buttons: [
          { id: 'add', name: 'Add' },
          { id: 'delete', name: 'Delete', granted: false },
        ],
        children: [
          {
            id: 'b',
            code: 'child',
            name: 'Child',
            granted: false,
            buttons: [{ id: 'save', name: 'Save' }],
          },
        ],
      },
    ]
    const permissions = permissionSet(menus, [{ id: 'protohub-version', actions: ['query'] }])
    expect(hasPermission(permissions, 'system/User:add')).toBe(true)
    expect(hasPermission(permissions, ['system/User:delete', 'child:save'])).toBe(false)
    expect(hasPermission(permissions, 'protohub-version:save')).toBe(false)
  })
})
