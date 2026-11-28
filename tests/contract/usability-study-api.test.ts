import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { reviewRequest } from '@/modules/protohub-manager-ui/api/review'
import {
  validStudyAnswers,
  normalizeStudyAnswerValues,
  copyStudy,
} from '@/modules/protohub-manager-ui/utils/usability-study'
import { usabilityStudyApi as api } from '@/modules/protohub-manager-ui/api/usability-study'
import { study, ownStudyResponse, submittedStudyWireResponse } from '../fixtures/usability-study'
vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), getStream: vi.fn() },
}))
vi.mock('@/modules/protohub-manager-ui/api/review', () => ({ reviewRequest: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(reviewRequest).mockResolvedValue({
    status: 'current',
    participation: structuredClone(ownStudyResponse),
  })
  for (const method of ['get', 'post', 'put'] as const)
    vi.mocked(request[method]).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('keeps member reads, mutations, result pages and aggregate export in the exact fixed scope', async () => {
  const options = { silent: true },
    mutation = { expectedVersion: 2, clientRequestId: 'original' }
  await api.action('v /', 'r?', 's /', 'open', mutation, options)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/versions/v%20%2F/revisions/r%3F/usability-studies/s%20%2F/_open',
    mutation,
    options,
  )
  const input = { ...study, ...mutation }
  await api.update('v', 'r', 's', input, options)
  expect(vi.mocked(request.put).mock.calls[0][1]).toBe(input)
  vi.mocked(request.post).mockResolvedValueOnce({
    success: true,
    status: 200,
    result: { data: [], total: 0, pageIndex: 3, pageSize: 20 },
  })
  await api.responses('v', 'r', 's', 3, options)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/versions/v/revisions/r/usability-studies/s/responses/_query',
    { pageIndex: 3, pageSize: 20 },
    options,
  )
  await api.csv('v', 'r', 's', options)
  expect(request.getStream).toHaveBeenCalledWith(
    '/prototype-hub/versions/v/revisions/r/usability-studies/s/summary.csv',
    undefined,
    options,
  )
})
it('uses the narrow review cookie client for public reads and writes, retaining exact csrf and original input', async () => {
  const grant = { token: 'share /', accessKey: 'grant', revisionId: 'exact-old' },
    signal = new AbortController().signal
  await api.publicQuery(grant, 0, signal)
  expect(reviewRequest).toHaveBeenLastCalledWith(
    grant,
    'usability-studies/_query',
    { pageIndex: 0, pageSize: 20 },
    undefined,
    signal,
  )
  const input = {
    clientRequestId: 'original',
    contentVersion: 1,
    expectedVersion: 3,
    feedback: 'private',
  }
  await api.participate(grant, 's /', 'progress', input, 'csrf', signal)
  expect(reviewRequest).toHaveBeenLastCalledWith(
    grant,
    'usability-studies/s%20%2F/progress',
    input,
    'csrf',
    signal,
  )
  expect(request.post).not.toHaveBeenCalled()
})

it('accepts the actual submitted HTTP shape and removes only unused null fields before domain validation', async () => {
  vi.mocked(reviewRequest).mockResolvedValueOnce({
    status: 'current',
    participation: structuredClone(submittedStudyWireResponse),
  })
  const result = await api.participate(
    { token: 'share', revisionId: 'r1', accessKey: 'grant' },
    'study1',
    'submit',
    { contentVersion: 1, clientRequestId: 'original', expectedVersion: 1 },
    'csrf',
  )
  expect(result.participation?.status).toBe('submitted')
  expect(validStudyAnswers(result.participation!, study, true)).toBe(true)
  expect(result.participation?.answers).toEqual([
    { questionId: 'choice', optionId: 'yes' },
    { questionId: 'rate', rating: 4 },
    { questionId: 'text', text: 'Synthetic text feedback' },
  ])
})

it('normalizes restored own context and member result pages from the same actual nullable answer shape', async () => {
  const publicStudy = { ...copyStudy(study), id: study.id, state: 'open', contentVersion: 1 }
  vi.mocked(reviewRequest).mockResolvedValueOnce({
    study: publicStudy,
    participation: structuredClone(submittedStudyWireResponse),
  })
  const context = await api.context(
    { token: 'share', revisionId: 'r1', accessKey: 'grant' },
    study.id,
  )
  expect(validStudyAnswers(context.participation!, study, true)).toBe(true)
  const member = {
    id: 'response',
    contentVersion: 1,
    status: 'submitted',
    taskAnswers: submittedStudyWireResponse.taskAnswers,
    answers: submittedStudyWireResponse.answers,
    feedback: '',
  }
  vi.mocked(request.post).mockResolvedValueOnce({
    success: true,
    status: 200,
    result: { data: [member], total: 1, pageIndex: 0, pageSize: 20 },
  })
  const page = await api.responses('v1', 'r1', study.id, 0)
  expect(validStudyAnswers(page.data[0], study, true)).toBe(true)
  expect(page.data[0].answers).toEqual(context.participation?.answers)
  expect(Object.keys(page.data[0])).toEqual([
    'id',
    'contentVersion',
    'status',
    'taskAnswers',
    'answers',
    'feedback',
  ])
})
it('keeps outbound answers sparse and exact while rejecting malformed non-null response values', async () => {
  const input = {
    contentVersion: 1,
    expectedVersion: 1,
    clientRequestId: 'exact-original',
    taskAnswers: submittedStudyWireResponse.taskAnswers,
    answers: [
      { questionId: 'choice', optionId: 'yes' },
      { questionId: 'rate', rating: 4 },
      { questionId: 'text', text: 'Feedback' },
    ],
    feedback: '',
  }
  vi.mocked(reviewRequest).mockResolvedValueOnce({
    status: 'current',
    participation: structuredClone(submittedStudyWireResponse),
  })
  await api.participate(
    { token: 'share', revisionId: 'r1', accessKey: 'grant' },
    study.id,
    'submit',
    input,
    'csrf',
  )
  expect(vi.mocked(reviewRequest).mock.calls[0][2]).toBe(input)
  expect(input.answers.map((answer) => Object.keys(answer))).toEqual([
    ['questionId', 'optionId'],
    ['questionId', 'rating'],
    ['questionId', 'text'],
  ])
  for (const invalid of [
    { questionId: 'rate', optionId: null, rating: '4', text: null },
    { questionId: 'choice', optionId: 'yes', rating: 4, text: null },
    { questionId: 'text', optionId: null, rating: null, text: false },
    { questionId: 'choice', optionId: 'yes', rating: null, text: null, other: 'not-allowed' },
  ])
    expect(() => normalizeStudyAnswerValues([invalid])).toThrow()
})
