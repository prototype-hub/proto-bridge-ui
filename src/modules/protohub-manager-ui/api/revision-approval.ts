import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  ApprovalEvent,
  ApprovalInput,
  PublicApproval,
  RevisionApproval,
} from '../types/revision-approval'

const base = (versionId: string, revisionId: string) =>
  `/prototype-hub/versions/${encodeURIComponent(versionId)}/revisions/${encodeURIComponent(revisionId)}/approval`
export const revisionApprovalApi = {
  get: async (versionId: string, revisionId: string, options?: RequestOptions) =>
    (await request.get<RevisionApproval>(base(versionId, revisionId), undefined, options)).result,
  act: async (
    versionId: string,
    revisionId: string,
    input: ApprovalInput,
    options?: RequestOptions,
  ) =>
    (await request.post<RevisionApproval>(`${base(versionId, revisionId)}/_act`, input, options))
      .result,
  history: async (
    versionId: string,
    revisionId: string,
    input: { pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<ApprovalEvent>>(
        `${base(versionId, revisionId)}/_history`,
        input,
        options,
      )
    ).result,
  publicContext: async (
    shareToken: string,
    input: { revisionId: string; accessKey: string },
    options?: RequestOptions,
  ) =>
    (
      await publicRequest.post<PublicApproval>(
        `/prototype-hub/public/shares/${encodeURIComponent(shareToken)}/approval/context`,
        input,
        options,
      )
    ).result,
}
