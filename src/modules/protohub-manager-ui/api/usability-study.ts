import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import { reviewRequest, type ReviewGrant } from './review'
import { normalizeStudyAnswerValues } from '../utils/usability-study'
import type {
  Study,
  StudyDefinition,
  StudySummary,
  StudyMutation,
  StudyAggregate,
  MemberStudyResponse,
  PublicStudySummary,
  StudyContext,
  StudyMutationResult,
  ParticipationInput,
  OwnStudyResponse,
  StudyResponseWire,
} from '../types/usability-study'
type StudyContextWire = Omit<StudyContext, 'participation'> & {
  participation: StudyResponseWire<OwnStudyResponse> | null
}
type StudyMutationWire = Omit<StudyMutationResult, 'participation'> & {
  participation: StudyResponseWire<OwnStudyResponse> | null
}
const readResponse = <T extends OwnStudyResponse | MemberStudyResponse>(
  value: StudyResponseWire<T>,
): T => ({ ...value, answers: normalizeStudyAnswerValues(value.answers) }) as T
const part = encodeURIComponent
const base = (version: string, revision: string) =>
  `/prototype-hub/versions/${part(version)}/revisions/${part(revision)}/usability-studies`
export const usabilityStudyApi = {
  query: async (version: string, revision: string, pageIndex: number, options?: RequestOptions) =>
    (
      await request.post<PageResult<StudySummary>>(
        `${base(version, revision)}/_query`,
        { pageIndex, pageSize: 20 },
        options,
      )
    ).result,
  get: async (version: string, revision: string, id: string, options?: RequestOptions) =>
    (await request.get<Study>(`${base(version, revision)}/${part(id)}`, undefined, options)).result,
  create: async (
    version: string,
    revision: string,
    input: StudyDefinition & { clientRequestId: string },
    options?: RequestOptions,
  ) => (await request.post<Study>(base(version, revision), input, options)).result,
  update: async (
    version: string,
    revision: string,
    id: string,
    input: StudyDefinition & StudyMutation,
    options?: RequestOptions,
  ) => (await request.put<Study>(`${base(version, revision)}/${part(id)}`, input, options)).result,
  action: async (
    version: string,
    revision: string,
    id: string,
    action: 'open' | 'close' | 'delete',
    input: StudyMutation,
    options?: RequestOptions,
  ) =>
    (
      await request.post<Study | boolean>(
        `${base(version, revision)}/${part(id)}/_${action}`,
        input,
        options,
      )
    ).result,
  responses: async (
    version: string,
    revision: string,
    id: string,
    pageIndex: number,
    options?: RequestOptions,
  ) => {
    const value = (
      await request.post<PageResult<StudyResponseWire<MemberStudyResponse>>>(
        `${base(version, revision)}/${part(id)}/responses/_query`,
        { pageIndex, pageSize: 20 },
        options,
      )
    ).result
    return { ...value, data: value.data.map((row) => readResponse<MemberStudyResponse>(row)) }
  },
  summary: async (version: string, revision: string, id: string, options?: RequestOptions) =>
    (
      await request.get<StudyAggregate>(
        `${base(version, revision)}/${part(id)}/summary`,
        undefined,
        options,
      )
    ).result,
  csv: (version: string, revision: string, id: string, options?: RequestOptions) =>
    request.getStream(`${base(version, revision)}/${part(id)}/summary.csv`, undefined, options),
  publicQuery: (grant: ReviewGrant, pageIndex: number, signal?: AbortSignal) =>
    reviewRequest<PageResult<PublicStudySummary>>(
      grant,
      'usability-studies/_query',
      { pageIndex, pageSize: 20 },
      undefined,
      signal,
    ),
  context: async (grant: ReviewGrant, id: string, signal?: AbortSignal): Promise<StudyContext> => {
    const value = await reviewRequest<StudyContextWire>(
      grant,
      `usability-studies/${part(id)}/context`,
      {},
      undefined,
      signal,
    )
    return {
      ...value,
      participation:
        value.participation === null ? null : readResponse<OwnStudyResponse>(value.participation),
    }
  },
  participate: async (
    grant: ReviewGrant,
    id: string,
    action: 'consent' | 'progress' | 'submit' | 'withdraw',
    input: ParticipationInput,
    csrf: string,
    signal?: AbortSignal,
  ): Promise<StudyMutationResult> => {
    const value = await reviewRequest<StudyMutationWire>(
      grant,
      `usability-studies/${part(id)}/${action}`,
      input,
      csrf,
      signal,
    )
    return {
      ...value,
      participation:
        value.participation === null ? null : readResponse<OwnStudyResponse>(value.participation),
    }
  },
}
