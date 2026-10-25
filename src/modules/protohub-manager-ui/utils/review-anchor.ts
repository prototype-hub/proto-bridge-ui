import type { ReviewAnchor } from '../types'

const fields = [
  'space',
  'shape',
  'x',
  'y',
  'width',
  'height',
  'documentWidth',
  'documentHeight',
  'viewportWidth',
  'viewportHeight',
]
/** Runtime geometry is untrusted even when its sender is the current sandboxed root frame. */
export function isReviewAnchor(value: unknown): value is ReviewAnchor {
  if (!value || typeof value !== 'object') return false
  const anchor = value as ReviewAnchor
  if (Object.keys(value).length !== fields.length || fields.some((key) => !(key in value)))
    return false
  if (
    anchor.space !== 'root-document-css-px-v1' ||
    !['point', 'rect', 'ellipse'].includes(anchor.shape)
  )
    return false
  if (
    ![
      anchor.x,
      anchor.y,
      anchor.width,
      anchor.height,
      anchor.documentWidth,
      anchor.documentHeight,
      anchor.viewportWidth,
      anchor.viewportHeight,
    ].every(Number.isInteger)
  )
    return false
  return (
    anchor.documentWidth >= 1 &&
    anchor.documentWidth <= 1000000 &&
    anchor.documentHeight >= 1 &&
    anchor.documentHeight <= 1000000 &&
    anchor.viewportWidth >= 1 &&
    anchor.viewportWidth <= 16384 &&
    anchor.viewportHeight >= 1 &&
    anchor.viewportHeight <= 16384 &&
    anchor.x >= 0 &&
    anchor.y >= 0 &&
    anchor.width >= 0 &&
    anchor.height >= 0 &&
    anchor.x + anchor.width <= anchor.documentWidth &&
    anchor.y + anchor.height <= anchor.documentHeight &&
    (anchor.shape === 'point'
      ? anchor.width === 0 && anchor.height === 0
      : anchor.width >= 1 && anchor.height >= 1)
  )
}
export type AnchorStatus =
  | 'capturing'
  | 'ready'
  | 'unavailable'
  | 'captured'
  | 'cancelled'
  | 'located'
export interface AnchorEvent {
  type: 'PROTOTYPE_REVIEW_ANCHOR_EVENT'
  channel: string
  generation: number
  status: AnchorStatus
  anchor?: ReviewAnchor
}
export function isAnchorEvent(value: unknown): value is AnchorEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as AnchorEvent
  return (
    Object.keys(value).every((key) =>
      ['type', 'channel', 'generation', 'status', 'anchor'].includes(key),
    ) &&
    event.type === 'PROTOTYPE_REVIEW_ANCHOR_EVENT' &&
    typeof event.channel === 'string' &&
    event.channel.length <= 128 &&
    Number.isSafeInteger(event.generation) &&
    event.generation > 0 &&
    ['capturing', 'ready', 'unavailable', 'captured', 'cancelled', 'located'].includes(
      event.status,
    ) &&
    (event.status === 'captured' ? isReviewAnchor(event.anchor) : !('anchor' in event))
  )
}
