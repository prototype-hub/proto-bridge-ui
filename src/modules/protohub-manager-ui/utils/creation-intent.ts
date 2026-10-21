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
        // LAN deployments may use HTTP, where randomUUID is unavailable but getRandomValues works.
        key =
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : [...crypto.getRandomValues(new Uint8Array(16))]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')
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
