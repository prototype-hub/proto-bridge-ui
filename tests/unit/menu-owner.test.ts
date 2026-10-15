import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { updateMenus } from '@/modules/authentication-manager-ui/api/menu/initHome'
import {
  menuPayload,
  menuQuery,
  settingsPayload,
  synchronizeSystemMenus,
  validateMenu,
} from '@/modules/authentication-manager-ui/utils/menu'
import type { ServerMenu } from '@/shared/auth/types'

vi.mock('@/shared/api/client', () => ({ request: { patch: vi.fn(async () => ({})) } }))
vi.mock('@/shared/i18n', () => ({ t: (key: string) => key }))
beforeEach(() => vi.clearAllMocks())
const menu = (id: string, owner = 'proto', children: ServerMenu[] = []): ServerMenu => ({
  id,
  code: id,
  name: id,
  owner,
  children,
})

it('queries current product and legacy owners without dropping the original unowned compatibility', () => {
  expect(menuQuery({}, true).terms).toContainEqual({
    terms: [
      { column: 'owner', termType: 'eq', value: 'proto' },
      { column: 'owner', termType: 'eq', value: 'iot', type: 'or' },
      { column: 'owner', termType: 'isnull', value: '1', type: 'or' },
    ],
  })
})
it.each(['proto', 'iot'])('keeps %s owner when editing and changing settings', (owner) => {
  const tree = [menu('root', owner, [menu('child', owner)])]
  expect(menuPayload(tree[0]!).owner).toBe(owner)
  const result = settingsPayload(tree, ['child'])
  expect(result[0]!.owner).toBe(owner)
  expect(result[0]!.children![0]!.owner).toBe(owner)
})
it.each(['proto', 'iot'])(
  'replaces the actual single-owner %s tree through the matching endpoint',
  async (owner) => {
    const tree = [menu('root', owner, [menu('child', owner)])]
    await updateMenus(tree)
    expect(request.patch).toHaveBeenCalledExactlyOnceWith(`/menu/${owner}/_all`, tree)
  },
)
it('rejects mixed roots, cross-owner nested trees and unknown ownership before any replacement request', async () => {
  for (const tree of [
    [menu('root'), menu('old', 'iot')],
    [menu('root', 'proto', [menu('old', 'iot')])],
    [{ ...menu('unknown'), owner: undefined }],
    [],
  ])
    await expect(updateMenus(tree)).rejects.toThrow()
  expect(request.patch).not.toHaveBeenCalled()
})
it.each(['proto', 'iot'])(
  'inherits %s when synchronizing missing default children or a missing system root',
  (owner) => {
    const defaults = [menu('system', 'iot', [menu('system/Menu', 'iot')])]
    const result = synchronizeSystemMenus([menu('system', owner)], defaults)
    expect(result[0]!.owner).toBe(owner)
    expect(result[0]!.children![0]!.owner).toBe(owner)
    expect(defaults[0]!.owner).toBe('iot')
    expect(defaults[0]!.children![0]!.owner).toBe('iot')
    const missing = synchronizeSystemMenus([menu('custom', owner)], defaults)
    expect(missing.find((row) => row.code === 'system')?.owner).toBe(owner)
  },
)
it('rejects cross-owner reparenting while preserving a loaded owner', () => {
  const current = menu('current'),
    old = menu('old', 'iot')
  expect(() => validateMenu({ ...current, parentId: old.id }, [current, old])).toThrow(
    'configuration.crossOwnerParent',
  )
})
