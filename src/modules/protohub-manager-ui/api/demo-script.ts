import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type { PublicShare } from '../types'
import type {
  DemoScript,
  DemoScriptInput,
  DemoScriptSummary,
  PublicDemoScript,
  PublicDemoScriptSummary,
} from '../types/demo-script'

const part = encodeURIComponent
const base = (versionId: string, revisionId: string) =>
  `/prototype-hub/versions/${part(versionId)}/revisions/${part(revisionId)}/demo-scripts`
const publicBase = (share: PublicShare) =>
  `/prototype-hub/public/shares/${part(share.token)}/demo-scripts`
const grant = (share: PublicShare) => ({
  revisionId: share.revisionId,
  accessKey: share.accessKey,
})
export const demoScriptApi = {
  query: async (version: string, revision: string, pageIndex: number, options?: RequestOptions) =>
    (
      await request.post<PageResult<DemoScriptSummary>>(
        `${base(version, revision)}/_query`,
        { pageIndex, pageSize: 20 },
        options,
      )
    ).result,
  get: async (version: string, revision: string, id: string, options?: RequestOptions) =>
    (await request.get<DemoScript>(`${base(version, revision)}/${part(id)}`, undefined, options))
      .result,
  create: async (
    version: string,
    revision: string,
    input: DemoScriptInput,
    options?: RequestOptions,
  ) => (await request.post<DemoScript>(base(version, revision), input, options)).result,
  update: async (
    version: string,
    revision: string,
    id: string,
    input: DemoScriptInput & { expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (await request.put<DemoScript>(`${base(version, revision)}/${part(id)}`, input, options))
      .result,
  remove: async (
    version: string,
    revision: string,
    id: string,
    input: { clientRequestId: string; expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (await request.post<boolean>(`${base(version, revision)}/${part(id)}/_delete`, input, options))
      .result,
  publicQuery: async (share: PublicShare, pageIndex: number, options?: RequestOptions) =>
    (
      await publicRequest.post<PageResult<PublicDemoScriptSummary>>(
        `${publicBase(share)}/_query`,
        { ...grant(share), pageIndex, pageSize: 20 },
        options,
      )
    ).result,
  publicGet: async (share: PublicShare, id: string, options?: RequestOptions) =>
    (
      await publicRequest.post<PublicDemoScript>(
        `${publicBase(share)}/${part(id)}/context`,
        grant(share),
        options,
      )
    ).result,
}
