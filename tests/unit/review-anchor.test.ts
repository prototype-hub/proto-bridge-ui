import { expect, it } from 'vitest'
import { isReviewAnchor, isAnchorEvent } from '@/modules/protohub-manager-ui/utils/review-anchor'
import type { ReviewAnchor } from '@/modules/protohub-manager-ui/types'
const anchor: ReviewAnchor = {
  space: 'root-document-css-px-v1',
  shape: 'rect',
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  documentWidth: 800,
  documentHeight: 2000,
  viewportWidth: 800,
  viewportHeight: 600,
}
it.each(['point', 'rect', 'ellipse'] as const)(
  'accepts only the explicit integer %s snapshot',
  (shape) => {
    expect(
      isReviewAnchor({ ...anchor, shape, ...(shape === 'point' ? { width: 0, height: 0 } : {}) }),
    ).toBe(true)
  },
)
it.each([
  { x: -1 },
  { x: 1.1 },
  { x: '1' },
  { y: NaN },
  { width: Infinity },
  { width: 0 },
  { height: 0 },
  { documentWidth: 1000001 },
  { documentHeight: 0 },
  { viewportWidth: 16385 },
  { viewportHeight: 0 },
  { x: 799, width: 2 },
  { y: 2000, height: 1 },
  { shape: 'point' },
  { space: 'normalized' },
  { framePath: 'secret' },
  { shape: 'triangle' },
])('rejects malformed or out-of-bounds geometry %j', (invalid) => {
  expect(isReviewAnchor({ ...anchor, ...invalid })).toBe(false)
})
it('accepts bounded event types, captures only geometry and rejects context/URL leaks', () => {
  const message = {
    type: 'PROTOTYPE_REVIEW_ANCHOR_EVENT',
    channel: 'channel',
    generation: 2,
    status: 'captured',
    anchor,
  }
  expect(isAnchorEvent(message)).toBe(true)
  expect(isAnchorEvent({ ...message, status: 'ready' })).toBe(false)
  expect(isAnchorEvent({ ...message, url: 'https://platform.invalid/secret' })).toBe(false)
  expect(isAnchorEvent({ ...message, generation: 0 })).toBe(false)
  expect(isAnchorEvent({ ...message, anchor: { ...anchor, x: '1' } })).toBe(false)
  expect(isAnchorEvent({ ...message, status: 'capturing', anchor: undefined })).toBe(false)
  expect(
    isAnchorEvent({ type: message.type, channel: 'channel', generation: 2, status: 'capturing' }),
  ).toBe(true)
})
