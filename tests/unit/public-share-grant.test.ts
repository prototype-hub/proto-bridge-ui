import { beforeEach, expect, it, vi } from 'vitest'
import { publicApi } from '@/modules/protohub-manager-ui/api/public-share'
import { publicRequest } from '@/shared/api/public-client'
import type { PublicShare } from '@/modules/protohub-manager-ui/types'
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const grant: PublicShare = {
  token: 'token',
  revisionId: 'r1',
  revisionMode: 'latest',
  projectName: 'Project',
  versionName: 'V1',
  passwordRequired: false,
  accessKey: 'derived',
  pagesUrl: '/api/prototype-hub/public/shares/token/derived/revisions/r1/pages',
}
beforeEach(() => vi.clearAllMocks())
it('consumes exactly the server canonical pages grant through the anonymous client', async () => {
  vi.mocked(publicRequest.get).mockResolvedValueOnce({ success: true, status: 200, result: [] })
  expect(await publicApi.pages(grant)).toEqual([])
  expect(publicRequest.get).toHaveBeenCalledWith(
    '/prototype-hub/public/shares/token/derived/revisions/r1/pages',
    undefined,
    { silent: true },
  )
})
it.each([
  undefined,
  'https://other.test/api/prototype-hub/public/shares/token/derived/revisions/r1/pages',
  '//other.test/path',
  '/api/prototype-hub/public/shares/token/derived/pages',
  '/api/prototype-hub/public/shares/token/derived/revisions/r2/pages',
  '/api/prototype-hub/public/shares/other/derived/revisions/r1/pages',
  '/api/prototype-hub/public/shares/token/derived/revisions/r1/pages?token=platform',
  '/api/prototype-hub/public/shares/token/derived/revisions/r1/pages#fragment',
])(
  'rejects a missing, legacy, mismatched or foreign grant URL before requesting: %s',
  async (pagesUrl) => {
    await expect(publicApi.pages({ ...grant, pagesUrl })).rejects.toThrow(
      'Invalid public pages URL',
    )
    expect(publicRequest.get).not.toHaveBeenCalled()
  },
)
