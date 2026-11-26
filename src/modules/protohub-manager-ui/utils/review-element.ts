import type { ReviewElementTarget } from '../types'

const idPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/
const exactKeys = (value: object, keys: string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const hasControl = (value: string) =>
  Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)

/** A path is metadata within an existing runtime; it is never a URL or an access grant. */
export function isElementResourcePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 4096 ||
    value.split('/')[0]!.includes(':') ||
    /[?#\\]/.test(value) ||
    Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) >= 127)
  )
    return false
  try {
    return value.split('/').every((part) => {
      if (!part || /%(?![\da-f]{2})/i.test(part)) return false
      const decoded = decodeURIComponent(part)
      return !['.', '..'].includes(decoded) && !/[/\\]/.test(decoded) && !hasControl(decoded)
    })
  } catch {
    return false
  }
}

/** Runtime and saved locators remain untrusted even when received from the current root frame. */
export function isReviewElementTarget(value: unknown): value is ReviewElementTarget {
  if (
    !record(value) ||
    !exactKeys(value, [
      'space',
      'frames',
      'elementId',
      'tagName',
      'textHint',
      'viewportWidth',
      'viewportHeight',
    ]) ||
    value.space !== 'frame-element-v1' ||
    !Array.isArray(value.frames) ||
    value.frames.length > 4 ||
    typeof value.elementId !== 'string' ||
    !idPattern.test(value.elementId) ||
    typeof value.tagName !== 'string' ||
    !/^[a-z][a-z0-9]{0,31}$/.test(value.tagName) ||
    typeof value.textHint !== 'string' ||
    value.textHint.length > 160 ||
    Array.from(value.textHint).some(
      (char) =>
        char.charCodeAt(0) < 32 ||
        (char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff),
    )
  )
    return false
  return (
    ['viewportWidth', 'viewportHeight'].every(
      (key) =>
        Number.isInteger(value[key]) &&
        (value[key] as number) >= 1 &&
        (value[key] as number) <= 16384,
    ) &&
    value.frames.every(
      (frame) =>
        record(frame) &&
        exactKeys(frame, ['elementId', 'resourcePath']) &&
        typeof frame.elementId === 'string' &&
        idPattern.test(frame.elementId) &&
        isElementResourcePath(frame.resourcePath),
    )
  )
}

/** Copy nested frame metadata so editing a new draft cannot alter an unknown original request. */
export function cloneReviewElementTarget(value: ReviewElementTarget): ReviewElementTarget {
  return {
    space: value.space,
    frames: value.frames.map((frame) => ({
      elementId: frame.elementId,
      resourcePath: frame.resourcePath,
    })),
    elementId: value.elementId,
    tagName: value.tagName,
    textHint: value.textHint,
    viewportWidth: value.viewportWidth,
    viewportHeight: value.viewportHeight,
  }
}
