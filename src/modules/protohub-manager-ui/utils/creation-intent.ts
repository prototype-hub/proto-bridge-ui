import { secureId } from '@/shared/utils/secure-id'
/** Keeps a creation retry on the same key until its metadata, file or dialog intent changes. */
export function createCreationIntent() {
  let previous: readonly unknown[] = []
  let key: string | undefined
  return {
    key(parts: readonly unknown[]): string {
      if (
        !key ||
        parts.length !== previous.length ||
        parts.some((part, index) => !Object.is(part, previous[index]))
      ) {
        key = secureId()
        previous = [...parts]
      }
      return key
    },
    reset() {
      key = undefined
      previous = []
    },
  }
}
