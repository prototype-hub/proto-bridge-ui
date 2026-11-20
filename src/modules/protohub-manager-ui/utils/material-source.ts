import type { MaterialSource } from '../types/revision-material'
export function emptySource(): Required<MaterialSource> {
  return { sourceTool: '', sourceName: '', sourceUrl: '', sourceNotes: '' }
}
export function normalizedSource(value: MaterialSource): Required<MaterialSource> {
  return Object.fromEntries(
    Object.keys(emptySource()).map((key) => [
      key,
      value[key as keyof MaterialSource]?.trim() || null,
    ]),
  ) as Required<MaterialSource>
}
export function validSourceUrl(value?: string | null): boolean {
  if (!value?.trim()) return true
  try {
    const url = new URL(value.trim())
    return (
      /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
  } catch {
    return false
  }
}
/** Standalone targets have the stricter link contract; legacy source declarations keep theirs. */
export function validLinkUrl(value?: string | null): boolean {
  if (
    !value ||
    !validSourceUrl(value) ||
    /[\s\\]/u.test(value) ||
    Array.from(value).some((char) => char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
  )
    return false
  const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1]
  if (!authority || authority.includes('@') || authority.endsWith(':')) return false
  const url = new URL(value)
  return !!url.hostname && (!url.port || Number(url.port) > 0)
}
export function validMaterialFile(file: File): boolean {
  const image = /\.(png|jpe?g)$/i.test(file.name)
  return (
    (image || /\.(pdf|txt|md|docx|xlsx|pptx)$/i.test(file.name)) &&
    file.size > 0 &&
    file.size <= (image ? 5 : 20) * 1048576
  )
}
