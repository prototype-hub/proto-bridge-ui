import { isRecord } from '@/shared/api/errors'
import type { InspectToolEvent, InspectToolSelection } from '../types'

const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => key in value)
const text = (value: unknown, max = 256) => typeof value === 'string' && value.length <= max
const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max

/** Validate the separate root-only protocol before any runtime value enters shell state. */
export function isInspectToolEvent(value: unknown): value is InspectToolEvent {
  if (
    !isRecord(value) ||
    value.type !== 'PROTOTYPE_INSPECT_TOOL_EVENT' ||
    typeof value.channel !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.channel) ||
    typeof value.status !== 'string' ||
    !integer(value.generation, 1, 2147483647)
  )
    return false
  const base = ['type', 'channel', 'generation', 'status']
  if (['ready', 'stale', 'cancelled', 'unavailable'].includes(value.status))
    return keys(value, base)
  if (value.status === 'selected') {
    const selection = value.selection
    if (
      !keys(value, [...base, 'selection']) ||
      !isRecord(selection) ||
      !keys(selection, ['slot', 'tagName', 'id', 'rect']) ||
      (selection.slot !== 'A' && selection.slot !== 'B') ||
      !text(selection.tagName, 64) ||
      !text(selection.id) ||
      !isRecord(selection.rect) ||
      !keys(selection.rect, ['x', 'y', 'width', 'height'])
    )
      return false
    return Object.entries(selection.rect).every(
      ([key, number]) =>
        typeof number === 'number' &&
        Number.isFinite(number) &&
        Math.abs(number) <= 1000000 &&
        (!['width', 'height'].includes(key) || number > 0),
    )
  }
  if (value.status !== 'summary' || !keys(value, [...base, 'summary'])) return false
  const summary = value.summary
  if (
    !isRecord(summary) ||
    !keys(summary, ['visited', 'truncated', 'colors', 'fonts']) ||
    !integer(summary.visited, 0, 2000) ||
    typeof summary.truncated !== 'boolean' ||
    !Array.isArray(summary.colors) ||
    summary.colors.length > 100 ||
    !Array.isArray(summary.fonts) ||
    summary.fonts.length > 100
  )
    return false
  return (
    summary.colors.every(
      (row) =>
        isRecord(row) &&
        keys(row, ['value', 'count']) &&
        text(row.value) &&
        integer(row.count, 1, 14000),
    ) &&
    summary.fonts.every(
      (row) =>
        isRecord(row) &&
        keys(row, ['family', 'size', 'weight', 'lineHeight', 'count']) &&
        ['family', 'size', 'weight', 'lineHeight'].every((key) => text(row[key])) &&
        integer(row.count, 1, 14000),
    )
  )
}

/** Outer-rectangle intervals stay in document CSS pixels, including overlap and touching. */
export function inspectToolDistance(a: InspectToolSelection, b: InspectToolSelection) {
  const axis = (startA: number, sizeA: number, startB: number, sizeB: number) => {
    const distance = Math.max(startA, startB) - Math.min(startA + sizeA, startB + sizeB)
    return {
      kind: distance > 0 ? ('gap' as const) : ('overlap' as const),
      value: Math.round(Math.abs(distance) * 100) / 100,
    }
  }
  return {
    horizontal: axis(a.rect.x, a.rect.width, b.rect.x, b.rect.width),
    vertical: axis(a.rect.y, a.rect.height, b.rect.y, b.rect.height),
  }
}
