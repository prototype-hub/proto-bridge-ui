import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import { reviewRequest, reviewImageRequest, reviewImageData, type ReviewGrant } from './review'
import type {
  ReviewThread,
  ReviewMessage,
  ReviewThreadQuery,
  ReviewMessageInput,
  ReviewStatusInput,
  ReviewThreadPage,
} from '../types'
const base = (versionId: string) =>
  `/prototype-hub/versions/${encodeURIComponent(versionId)}/review-threads`
const threadPath = (id: string) => `threads/${encodeURIComponent(id)}`
export const publicReviewThreadsApi = {
  replyImage: (
    grant: ReviewGrant,
    id: string,
    data: ReviewMessageInput,
    image: File,
    csrf: string,
    signal?: AbortSignal,
  ) =>
    reviewRequest<ReviewMessage>(
      grant,
      `${threadPath(id)}/messages-with-image`,
      data,
      csrf,
      signal,
      'POST',
      image,
    ),
  image: (
    grant: ReviewGrant,
    id: string,
    messageId: string,
    data: ReviewThreadPage,
    csrf: string,
    signal?: AbortSignal,
  ) =>
    reviewImageRequest(
      grant,
      `${threadPath(id)}/messages/${encodeURIComponent(messageId)}/image`,
      data,
      csrf,
      signal,
    ),
  detail: (
    grant: ReviewGrant,
    id: string,
    data: ReviewThreadPage,
    csrf: string,
    signal?: AbortSignal,
  ) => reviewRequest<ReviewThread>(grant, `${threadPath(id)}/_detail`, data, csrf, signal),
  query: (grant: ReviewGrant, data: ReviewThreadQuery, csrf: string, signal?: AbortSignal) =>
    reviewRequest<PageResult<ReviewThread>>(grant, 'threads/_query', data, csrf, signal),
  create: (grant: ReviewGrant, data: ReviewMessageInput, csrf: string, signal?: AbortSignal) =>
    reviewRequest<ReviewThread>(grant, 'threads', data, csrf, signal),
  messages: (
    grant: ReviewGrant,
    id: string,
    data: Omit<ReviewThreadQuery, 'state'>,
    csrf: string,
    signal?: AbortSignal,
  ) =>
    reviewRequest<PageResult<ReviewMessage>>(
      grant,
      `${threadPath(id)}/messages/_query`,
      data,
      csrf,
      signal,
    ),
  reply: (
    grant: ReviewGrant,
    id: string,
    data: ReviewMessageInput,
    csrf: string,
    signal?: AbortSignal,
  ) => reviewRequest<ReviewMessage>(grant, `${threadPath(id)}/messages`, data, csrf, signal),
  status: (
    grant: ReviewGrant,
    id: string,
    data: ReviewStatusInput & { state: 'open' },
    csrf: string,
    signal?: AbortSignal,
  ) => reviewRequest<ReviewThread>(grant, `${threadPath(id)}/status`, data, csrf, signal, 'PUT'),
}
export const reviewThreadsApi = {
  replyImage: async (
    versionId: string,
    id: string,
    data: ReviewMessageInput & { visibility: ReviewMessage['visibility'] },
    image: File,
    options?: RequestOptions,
  ) =>
    (
      await request.post<ReviewMessage>(
        `${base(versionId)}/${encodeURIComponent(id)}/messages-with-image`,
        reviewImageData(data, image),
        options,
      )
    ).result,
  image: async (
    versionId: string,
    id: string,
    messageId: string,
    data: ReviewThreadPage,
    options?: RequestOptions,
  ) =>
    (
      await request.postStream(
        `${base(versionId)}/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/image`,
        data,
        options,
      )
    ).blob,
  detail: async (versionId: string, id: string, data: ReviewThreadPage, options?: RequestOptions) =>
    (
      await request.post<ReviewThread>(
        `${base(versionId)}/${encodeURIComponent(id)}/_detail`,
        data,
        options,
      )
    ).result,
  query: async (versionId: string, data: ReviewThreadQuery, options?: RequestOptions) =>
    (await request.post<PageResult<ReviewThread>>(`${base(versionId)}/_query`, data, options))
      .result,
  messages: async (
    versionId: string,
    id: string,
    data: Omit<ReviewThreadQuery, 'state'>,
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<ReviewMessage>>(
        `${base(versionId)}/${encodeURIComponent(id)}/messages/_query`,
        data,
        options,
      )
    ).result,
  reply: async (
    versionId: string,
    id: string,
    data: ReviewMessageInput & { visibility: ReviewMessage['visibility'] },
    options?: RequestOptions,
  ) =>
    (
      await request.post<ReviewMessage>(
        `${base(versionId)}/${encodeURIComponent(id)}/messages`,
        data,
        options,
      )
    ).result,
  status: async (
    versionId: string,
    id: string,
    data: ReviewStatusInput,
    options?: RequestOptions,
  ) =>
    (
      await request.put<ReviewThread>(
        `${base(versionId)}/${encodeURIComponent(id)}/status`,
        data,
        options,
      )
    ).result,
}
