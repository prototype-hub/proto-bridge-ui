import type { DeliveryDocumentInput, DeliveryPageInput } from '../types/delivery-document'
export function emptyDeliveryPage(pageId: string): DeliveryPageInput {
  return { pageId, descriptions: [], materials: [], images: [], checks: [] }
}
/** Page identity owns body and sources, so sequence changes never move text to another page. */
export function moveDeliveryPage<T extends DeliveryPageInput>(
  pages: T[],
  pageId: string,
  offset: number,
): T[] {
  const index = pages.findIndex((page) => page.pageId === pageId),
    target = index + offset
  if (index < 0 || target < 0 || target >= pages.length) return pages
  const result = [...pages],
    [page] = result.splice(index, 1)
  result.splice(target, 0, page!)
  return result
}
export function deliverySelectionKey(page: DeliveryPageInput): string {
  return JSON.stringify([page.pageId, page.descriptions, page.materials, page.images, page.checks])
}
export function deliveryWithinLimits(input: DeliveryDocumentInput): boolean {
  const texts = [
    input.title,
    input.introduction,
    ...input.pages.flatMap((page) => [
      page.body || '',
      ...page.images.map((image) => image.caption),
    ]),
  ]
  return (
    !!input.title.trim() &&
    input.title.length <= 120 &&
    input.introduction.length <= 4000 &&
    input.pages.length > 0 &&
    input.pages.length <= 50 &&
    input.pages.reduce(
      (sum, page) => sum + page.descriptions.length + page.materials.length + page.checks.length,
      0,
    ) <= 200 &&
    input.pages.reduce((sum, page) => sum + page.images.length, 0) <= 10 &&
    input.pages.every(
      (page) =>
        (page.body || '').length <= 20000 &&
        page.images.every((image) => image.caption.length <= 500),
    ) &&
    texts.every((text) => !text.includes('\0')) &&
    new TextEncoder().encode(texts.join('')).length <= 1048576
  )
}
