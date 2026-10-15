import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { menuManagement } from '@/modules/authentication-manager-ui/api/menu/menu'
import {
  accessSupport,
  menuPayload,
  menuQuery,
  validateMenu,
  settingsPayload,
  mergeMenuDefaults,
  synchronizeSystemMenus,
} from '@/modules/authentication-manager-ui/utils/menu'
import { imageAllowed } from '@/modules/authentication-manager-ui/views/basis/utils/image'
import { logTerms } from '@/modules/authentication-manager-ui/views/logs/utils/query'
import type { ServerMenu } from '@/shared/auth/types'
vi.mock('@/shared/api/client', () => ({
  request: Object.fromEntries(
    ['get', 'post', 'patch', 'remove'].map((name) => [
      name,
      vi.fn(async () => ({ result: { passed: true } })),
    ]),
  ),
}))
vi.mock('@/shared/i18n', () => ({ t: (key: string) => key }))
beforeEach(() => vi.clearAllMocks())
const menu = (id: string, children: ServerMenu[] = []): ServerMenu => ({
  id,
  code: id,
  name: id,
  owner: 'iot',
  children,
  permissions: [],
  buttons: [],
})
it('keeps menu owner and enum envelopes on create/update', async () => {
  const data = menuPayload({
    ...menu('item'),
    accessSupport: 'support',
    assetType: 'product',
    componentCode: 'system/User',
  })
  expect(data.owner).toBe('iot')
  expect(data.accessSupport).toEqual({ value: 'support', label: 'configuration.support' })
  expect(data.options?.meta?.componentCode).toBe('system/User')
  expect(accessSupport({ value: 'indirect', label: '间接控制' })).toBe('indirect')
  expect(menuPayload({ ...menu(''), code: 'new-menu' })).not.toHaveProperty('id')
  await menuManagement.save(data, true)
  expect(request.post).toHaveBeenCalledWith('/menu', data)
  await menuManagement.save(data, false)
  expect(request.patch).toHaveBeenCalledWith('/menu', data)
  await menuManagement.validate('item')
  expect(request.get).toHaveBeenCalledWith('/menu/code/_validate', { code: 'item' })
})
it('queries current product, legacy and unowned menus in sort order and keeps hidden menus available to configuration', () => {
  const query = menuQuery({ terms: [{ column: 'name', termType: 'like', value: '%menu%' }] })
  expect(query.sorts).toEqual([{ name: 'sortIndex', order: 'asc' }])
  expect(query.terms).toContainEqual({
    terms: [
      { column: 'owner', termType: 'eq', value: 'proto' },
      { column: 'owner', termType: 'eq', value: 'iot', type: 'or' },
      { column: 'owner', termType: 'isnull', value: '1', type: 'or' },
    ],
  })
  expect(query.terms).toContainEqual({
    column: 'options',
    termType: 'nlike',
    value: '%show":false%',
  })
  expect(menuQuery({}, true).terms).toHaveLength(1)
})
it('does not invent component bindings and preserves old metadata when the field is absent', () => {
  const created = menuPayload({ ...menu(''), code: 'custom-user', url: '/system/user' })
  expect(created).not.toHaveProperty('componentCode')
  expect(created.options?.meta).not.toHaveProperty('componentCode')
  const saved = menuPayload({
    ...menu('old'),
    options: { meta: { componentCode: 'legacy/RegisteredPage' } },
  })
  expect(saved.options?.meta?.componentCode).toBe('legacy/RegisteredPage')
  expect(menuPayload(saved).options?.meta?.componentCode).toBe('legacy/RegisteredPage')
})
it('rejects menu cycles and fourth levels before saving', () => {
  const tree = [menu('first', [menu('second', [menu('third')])])]
  expect(() => validateMenu({ ...menu('first'), parentId: 'third' }, tree)).toThrow(
    'configuration.circularParent',
  )
  expect(() => validateMenu({ ...menu('fourth'), parentId: 'third' }, tree)).toThrow(
    'configuration.maximumDepth',
  )
})
it('keeps parent visibility, three-level parent IDs and stable sort order in settings saves', () => {
  const result = settingsPayload(
    [menu('system', [menu('system/Menu'), menu('visible'), menu('hidden')])],
    ['visible'],
  )
  expect(result[0]?.options?.show).toBe(true)
  expect(
    result[0]?.children?.map((row) => [row.parentId, row.sortIndex, row.options?.show]),
  ).toEqual([
    ['system', 1, true],
    ['system', 2, true],
    ['system', 3, false],
  ])
})
it('synchronizes missing menu/button permissions while preserving configured names', () => {
  const configured = {
    ...menu('item'),
    name: 'Custom',
    permissions: [{ permission: 'menu', actions: ['query'] }],
    buttons: [
      { id: 'view', name: 'View', permissions: [{ permission: 'menu', actions: ['query'] }] },
    ],
  }
  const defaults = {
    ...menu('item'),
    buttons: [
      { id: 'view', name: 'Changed', permissions: [{ permission: 'menu', actions: ['update'] }] },
      { id: 'update', name: 'Update', permissions: [{ permission: 'menu', actions: ['update'] }] },
    ],
  }
  const result = mergeMenuDefaults([configured], [defaults])[0]!
  expect(result.name).toBe('Custom')
  expect(result.buttons?.map((row) => row.id)).toEqual(['view', 'update'])
  expect(result.buttons?.find((button) => button.id === 'view')?.permissions).toEqual([
    { permission: 'menu', actions: ['query', 'update'] },
  ])
})
it('validates branding image format and separate ICO limits before uploading', () => {
  expect(() =>
    imageAllowed(new File(['image'], 'logo.png', { type: 'image/png' }), 'logo'),
  ).not.toThrow()
  expect(() =>
    imageAllowed(new File(['pdf'], 'logo.pdf', { type: 'application/pdf' }), 'logo'),
  ).toThrow('configuration.invalidImage')
  expect(() =>
    imageAllowed(
      new File([new Uint8Array(1024 * 1024)], 'favicon.ico', { type: 'image/x-icon' }),
      'ico',
    ),
  ).toThrow('configuration.oversizedImage')
})
it('synchronizing preserves custom three-level placement without duplicate menu codes', () => {
  const existing = [menu('system', [menu('group', [menu('system/Menu')])])]
  const result = mergeMenuDefaults(existing, [
    menu('system', [{ ...menu('system/Menu'), buttons: [{ id: 'view', name: 'View' }] }]),
  ])
  expect(result[0]?.children?.map((row) => row.code)).toEqual(['group'])
  expect(result[0]?.children?.[0]?.children?.[0]?.buttons).toEqual([
    { id: 'view', name: 'View', permissions: [] },
  ])
})
it('reuses legacy nested log queries with their actual server field names', () => {
  expect(
    logTerms(
      [
        {
          terms: [
            { column: 'description', termType: 'like', value: '%查询%' },
            { column: 'username', termType: 'eq', value: 'admin' },
          ],
        },
      ],
      'access',
    ),
  ).toEqual([
    {
      terms: [
        { column: 'action', termType: 'like', value: '%查询%' },
        { column: 'context.username', termType: 'eq', value: 'admin' },
      ],
    },
  ])
  expect(logTerms([{ column: 'server', termType: 'eq', value: 'node1' }], 'system')).toEqual([
    { column: 'context.server', termType: 'eq', value: 'node1' },
  ])
})
it('synchronizes only system defaults, preserves existing groups and rejects fourth levels', () => {
  const existing = [
    menu('system', [menu('group', [menu('system/Menu')])]),
    menu('custom', [menu('custom/leaf')]),
  ]
  const defaults = [
    menu('system', [menu('system/Menu'), menu('system/User')]),
    menu('iot', [menu('link', [menu('Log', [menu('Log/Access')])])]),
  ]
  const merged = synchronizeSystemMenus(existing, defaults)
  expect(merged.map((row) => row.code)).toEqual(['system', 'custom'])
  expect(merged[1]).toEqual(existing[1])
  expect(merged[0]?.children?.map((row) => row.code)).toEqual(['group', 'system/User'])
  const invalid = [menu('system', [menu('group', [menu('Log', [menu('Log/Access')])])])]
  expect(() => synchronizeSystemMenus(invalid, defaults)).toThrow('configuration.maximumDepth')
  expect(() => settingsPayload(invalid, ['system'])).toThrow('configuration.maximumDepth')
})
