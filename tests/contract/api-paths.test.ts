import { it, expect, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import { projectsApi, versionsApi, sharesApi, publicApi } from '@/modules/protohub-manager-ui/api'
import { usersApi } from '@/modules/authentication-manager-ui/api/user/users'
import { rolesApi } from '@/modules/authentication-manager-ui/api/role/roles'
import { uploadMeAvatar_api } from '@/modules/authentication-manager-ui/api/account/center'
import { systemService } from '@/modules/authentication-manager-ui/api/file/upload'
vi.mock('@/shared/api/client', () => ({
  request: {
    get: vi.fn(async () => ({ result: [] })),
    post: vi.fn(async () => ({ result: { id: 'v' } })),
    put: vi.fn(async () => ({ result: { id: 'v' } })),
    patch: vi.fn(async () => ({ result: {} })),
    remove: vi.fn(async () => ({ result: {} })),
  },
}))
vi.mock('@/shared/api/public-client', () => ({
  publicRequest: {
    get: vi.fn(async () => ({ result: {} })),
    post: vi.fn(async () => ({ result: {} })),
  },
}))
it('uses the canonical PrototypeHub API, upload fields and in-place version updates', async () => {
  await projectsApi.get('p/id')
  expect(request.get).toHaveBeenCalledWith('/prototype-hub/projects/p%2Fid', undefined, undefined)
  await projectsApi.remove('p/id')
  expect(request.remove).toHaveBeenCalledWith('/prototype-hub/projects/p%2Fid')
  await versionsApi.update('v', 'Release', 'Notes', new File(['zip'], 'test.zip'))
  const call = vi.mocked(request.put).mock.calls[0]
  expect(call[0]).toBe('/prototype-hub/versions/v')
  expect(call[2]?.timeout).toBe(1800000)
  const data = call[1] as FormData
  expect([...data.keys()]).toEqual(['versionName', 'description', 'file'])
  expect(data.get('versionName')).toBe('Release')
  await sharesApi.list('v')
  expect(request.get).toHaveBeenCalledWith('/prototype-hub/versions/v/shares', undefined, undefined)
  await sharesApi.create('v', { description: 'Review link' })
  expect(request.post).toHaveBeenCalledWith('/prototype-hub/versions/v/shares', {
    description: 'Review link',
  })
  await publicApi.verify('token/path', 'secret')
  expect(publicRequest.post).toHaveBeenCalledWith(
    '/prototype-hub/public/shares/token%2Fpath/verify',
    { password: 'secret' },
    { silent: true },
  )
})
it('keeps password reset as text and role grants in the existing menus envelope', async () => {
  await usersApi.password('u', 'new-password')
  expect(request.post).toHaveBeenCalledWith('/user/u/password/_reset', 'new-password', {
    headers: { 'Content-Type': 'text/plain' },
  })
  await rolesApi.grant('r', [])
  expect(request.put).toHaveBeenCalledWith('/menu/role/r/_grant', { menus: [] })
})

it('uploads personal avatars through the current-user endpoint and keeps branding uploads on the managed endpoint', async () => {
  const file = new File(['PNG bytes'], 'avatar.png', { type: 'image/png' })
  const result = { url: '/api/file/static/avatar.png', accessUrl: '/api/file/static/avatar.png' }
  vi.mocked(request.post).mockResolvedValueOnce({ success: true, status: 200, result })
  expect(await uploadMeAvatar_api(file)).toEqual(result)
  const [path, data] = vi.mocked(request.post).mock.calls[0]!
  expect(path).toBe('/user/me/avatar')
  expect(data).toBeInstanceOf(FormData)
  if (!(data instanceof FormData)) throw new Error('Expected a multipart avatar')
  expect([...data.keys()]).toEqual(['file'])
  expect(data.get('file')).toBe(file)
  await systemService.upload(file)
  expect(vi.mocked(request.post).mock.calls[1]![0]).toBe('/file/upload')
})
