import { isRecord } from '@/shared/api/errors'
import type { InspectElement } from '../types'
export function rgbToHex(value: string): string {
  const match = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\)$/i)
  if (!match) return value
  const hex = match
    .slice(1, 4)
    .map((part) =>
      Math.max(0, Math.min(255, Number(part)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
  return (
    '#' +
    hex +
    (match[4] !== undefined && Number(match[4]) < 1
      ? Math.round(Math.max(0, Number(match[4])) * 255)
          .toString(16)
          .padStart(2, '0')
      : '')
  ).toUpperCase()
}
export function inspectCss(element: InspectElement): string {
  const pairs: Record<string, string> = {
    width: `${element.size.width}px`,
    height: `${element.size.height}px`,
    ...element.typography,
    ...element.appearance,
    ...element.spacing,
  }
  return Object.entries(pairs)
    .filter(([, value]) => value && value !== 'none')
    .map(
      ([key, value]) =>
        `${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}: ${value.startsWith('rgb') ? rgbToHex(value) : value};`,
    )
    .join('\n')
}
const stringMap = (value: unknown) =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
export function isInspectElement(value: unknown): value is InspectElement {
  if (
    !isRecord(value) ||
    typeof value.tagName !== 'string' ||
    typeof value.id !== 'string' ||
    typeof value.className !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.html !== 'string'
  )
    return false
  const numberMap = (object: unknown, keys: string[]) =>
    isRecord(object) &&
    keys.every((key) => typeof object[key] === 'number' && Number.isFinite(object[key]))
  return (
    numberMap(value.position, ['x', 'y', 'pageX', 'pageY']) &&
    numberMap(value.size, ['width', 'height']) &&
    ['typography', 'appearance', 'spacing'].every((key) => stringMap(value[key])) &&
    Array.isArray(value.assets) &&
    value.assets.every(
      (asset) =>
        isRecord(asset) &&
        ['image', 'svg'].includes(String(asset.type)) &&
        (asset.url === undefined || typeof asset.url === 'string') &&
        (asset.content === undefined || typeof asset.content === 'string'),
    )
  )
}
export function isFrameSource(frame: Window | null, source: MessageEventSource | null): boolean {
  if (!frame || !source) return false
  if (frame === source) return true
  try {
    for (let i = 0; i < frame.frames.length; i++)
      if (isFrameSource(frame.frames[i], source)) return true
  } catch {
    return false
  }
  return false
}
export function safeAssetUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol)
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}
