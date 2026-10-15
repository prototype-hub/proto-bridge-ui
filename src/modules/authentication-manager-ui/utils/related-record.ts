import type { RelatedSaveMessage } from '@/modules/authentication-manager-ui/types/common'
export type { RelatedSaveMessage } from '@/modules/authentication-manager-ui/types/common'
export function relatedSaveMessage(value: unknown): value is RelatedSaveMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'proto-related-record-saved' &&
    'sourceId' in value &&
    typeof value.sourceId === 'string' &&
    'id' in value &&
    typeof value.id === 'string'
  )
}
export function finishRelatedSave(sourceId: unknown, id: string) {
  if (typeof sourceId === 'string' && window.opener && window.opener !== window) {
    window.opener.postMessage(
      { type: 'proto-related-record-saved', sourceId, id } satisfies RelatedSaveMessage,
      window.location.origin,
    )
    window.close()
    return true
  }
  return false
}
