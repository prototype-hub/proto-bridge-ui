import { expect, it } from 'vitest'
import {
  deliveryWithinLimits,
  emptyDeliveryPage,
  moveDeliveryPage,
} from '@/modules/protohub-manager-ui/utils/delivery-document'
it('keeps manual bodies and source receipts attached to page identity during reorder/removal', () => {
  const pages = ['a', 'b', 'c'].map((id) => ({
    ...emptyDeliveryPage(id),
    body: `Manual ${id}`,
    sourceFingerprint: id.repeat(64),
  }))
  const moved = moveDeliveryPage(pages, 'b', -1)
  expect(moved.map((page) => page.pageId)).toEqual(['b', 'a', 'c'])
  expect(moved[0]?.body).toBe('Manual b')
  expect(moved.filter((page) => page.pageId !== 'a')[0]?.sourceFingerprint).toBe('b'.repeat(64))
  expect(moveDeliveryPage(pages, 'a', -1)).toBe(pages)
})
it('checks byte budget, NUL, reference occurrences, page and caption limits without truncating', () => {
  const input = {
    locale: 'zh' as const,
    title: 'Delivery',
    introduction: '',
    pages: [emptyDeliveryPage('a')],
  }
  expect(deliveryWithinLimits(input)).toBe(true)
  input.pages[0]!.body = '界'.repeat(20001)
  expect(deliveryWithinLimits(input)).toBe(false)
  input.pages[0]!.body = 'safe\0unsafe'
  expect(deliveryWithinLimits(input)).toBe(false)
  input.pages = Array.from({ length: 50 }, (_, i) => ({
    ...emptyDeliveryPage(String(i)),
    body: '界'.repeat(10000),
  }))
  expect(deliveryWithinLimits(input)).toBe(false)
  input.pages = [emptyDeliveryPage('a')]
  input.pages[0]!.descriptions = Array.from({ length: 201 }, (_, i) => ({
    id: String(i),
    expectedVersion: 0,
  }))
  expect(deliveryWithinLimits(input)).toBe(false)
})
