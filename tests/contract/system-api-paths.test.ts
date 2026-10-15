import { it, expect, vi, beforeEach } from 'vitest'
import { request } from '@/shared/api/client'
import * as department from '@/modules/authentication-manager-ui/api/department/department'
import * as position from '@/modules/authentication-manager-ui/api/position/positions'
import * as basis from '@/modules/authentication-manager-ui/api/basis/basis'
vi.mock('@/shared/api/client', () => ({
  request: Object.fromEntries(
    ['get', 'post', 'put', 'patch', 'remove'].map((name) => [
      name,
      vi.fn(async () => ({ result: [] })),
    ]),
  ),
}))
beforeEach(() => vi.clearAllMocks())
it('preserves organization member array envelopes', async () => {
  await department.bindUser_api('org', ['u'])
  expect(request.post).toHaveBeenCalledWith('/organization/org/users/_bind', ['u'])
})
it('retains organization-scoped position saves as arrays', async () => {
  await position.update('org', [{ id: 'position', name: 'Engineer' }])
  expect(request.patch).toHaveBeenCalledWith('/position/org/_save', [
    { id: 'position', name: 'Engineer' },
  ])
  await position.bindUser('org', 'position', ['u'])
  expect(request.post).toHaveBeenCalledWith('/organization/org/position/position/users/_bind', [
    'u',
  ])
})
it('keeps settings scopes and properties in the legacy array', async () => {
  await basis.save_api([{ scope: 'front', properties: { title: 'ProtoBridge' } }])
  expect(request.post).toHaveBeenCalledWith('/system/config/scope/_save', [
    { scope: 'front', properties: { title: 'ProtoBridge' } },
  ])
})
