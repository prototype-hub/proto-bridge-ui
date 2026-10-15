import { it, expect } from 'vitest'
import { adaptMenus } from '@/app/router/menu-adapter'
import { serializeGrants } from '@/modules/authentication-manager-ui/views/role/utils/grants'
it('resolves only registered components and preserves localized server menu titles', () => {
  const { routes, links } = adaptMenus(
    [
      {
        id: 'g',
        code: 'system',
        name: 'System',
        url: '/system',
        children: [
          {
            id: 'u',
            code: 'user',
            name: 'User',
            url: '/system/user',
            options: { meta: { componentCode: 'system/User' } },
            i18nMessages: { name: { en_US: 'Users' } },
          },
          { id: 'x', code: '../../private', name: 'Unknown', url: '/unknown' },
          { id: 'y', code: 'system/User', name: 'Unsafe', url: '//external.example' },
        ],
      },
    ],
    'en',
  )
  expect(routes).toHaveLength(1)
  expect(routes[0].path).toBe('/system/user')
  expect(links[0].children?.[0].title).toBe('Users')
})
it('includes ancestors of a granted child without granting unchecked buttons', () => {
  const result = serializeGrants([
    {
      id: 'root',
      code: 'root',
      name: 'Root',
      granted: false,
      buttons: [{ id: 'delete', name: 'Delete', granted: true }],
      children: [
        {
          id: 'child',
          code: 'child',
          name: 'Child',
          granted: true,
          buttons: [
            { id: 'save', name: 'Save', granted: true },
            { id: 'delete', name: 'Delete', granted: false },
          ],
        },
      ],
    },
  ])
  expect(result.map((item) => item.id)).toEqual(['root', 'child'])
  expect(result[0].buttons).toEqual([])
  expect(result[1].buttons?.map((button) => button.id)).toEqual(['save'])
})
