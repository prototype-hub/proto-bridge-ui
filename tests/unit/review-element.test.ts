import { expect, it } from 'vitest'
import type { ReviewElementTarget } from '../../src/modules/protohub-manager-ui/types'
import {
  cloneReviewElementTarget,
  isElementResourcePath,
  isReviewElementTarget,
} from '../../src/modules/protohub-manager-ui/utils/review-element'

const target: ReviewElementTarget = {
  space: 'frame-element-v1',
  frames: [{ elementId: 'childFrame', resourcePath: 'folder/a%20b.html' }],
  elementId: 'u1_text',
  tagName: 'span',
  textHint: 'Save 保存',
  viewportWidth: 390,
  viewportHeight: 844,
}

it('accepts only bounded typed metadata and never context, selector, HTML or credentials', () => {
  expect(isReviewElementTarget(target)).toBe(true)
  expect(isReviewElementTarget({ ...target, frames: [] })).toBe(true)
  for (const changed of [
    { ...target, html: '<b>unsafe</b>' },
    { ...target, elementId: 'x"]' },
    { ...target, frames: Array(5).fill(target.frames[0]) },
    { ...target, frames: [{ ...target.frames[0], grant: 'secret' }] },
    { ...target, frames: [null] },
    { ...target, viewportWidth: 1.5 },
    { ...target, viewportHeight: 16385 },
    { ...target, textHint: '\u0000' },
    { ...target, textHint: 'x'.repeat(161) },
    { ...target, tagName: 'IFRAME' },
    { ...target, textHint: '\ud800' },
    { ...target, textHint: '\udfff' },
  ])
    expect(isReviewElementTarget(changed)).toBe(false)
  expect(isReviewElementTarget({ ...target, textHint: 'Emoji 😀\u007f' })).toBe(true)
})

it('checks encoded relative POSIX paths without interpreting a URL or traversing folders', () => {
  for (const path of ['page.html', 'dir/%E9%A1%B5%20one.html', 'a%3Ab.html', 'a/%EF%BF%BD.html'])
    expect(isElementResourcePath(path), path).toBe(true)
  for (const path of [
    '',
    '/page.html',
    '../page.html',
    'a/./page.html',
    'a//b.html',
    'a/%2e%2e/x',
    'a/%2f.html',
    'a/%5C.html',
    'a/%00.html',
    'a/%7f.html',
    'a/%ff.html',
    'a/%C0%AF.html',
    'a/%zz.html',
    'a/%a.html',
    'a\\b.html',
    'a b.html',
    '页面.html',
    'a.html?x=1',
    'a.html#x',
    'http:child.html',
    'https://host/a.html',
  ])
    expect(isElementResourcePath(path), path).toBe(false)
})

it('deeply snapshots a canonical field order and rejects inherited substitutes for required keys', () => {
  const reversed = Object.fromEntries(
    Object.entries(target).reverse(),
  ) as unknown as ReviewElementTarget
  expect(JSON.stringify(cloneReviewElementTarget(reversed))).toBe(
    JSON.stringify(cloneReviewElementTarget(target)),
  )
  const copy = cloneReviewElementTarget(target)
  copy.frames[0]!.resourcePath = 'changed.html'
  expect(target.frames[0]!.resourcePath).toBe('folder/a%20b.html')
  const inherited = Object.assign(Object.create({ space: target.space }), {
    ...target,
    space: undefined,
  })
  delete inherited.space
  inherited.extra = true
  expect(isReviewElementTarget(inherited)).toBe(false)
})
