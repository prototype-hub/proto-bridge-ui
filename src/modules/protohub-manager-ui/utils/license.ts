/** Match the v1 server fingerprint for result reconciliation; this is not signature verification. */
export async function licenseFingerprint(document: string): Promise<string | undefined> {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort)
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, item]) => [key, sort(item)]),
      )
    return value
  }
  const bytes = new TextEncoder().encode(JSON.stringify(sort(JSON.parse(document))))
  // Plain HTTP on a LAN may lack WebCrypto; signature verification still belongs to the server.
  if (!globalThis.crypto?.subtle) return undefined
  try {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  } catch {
    return undefined
  }
}
