import { expect, it } from 'vitest'
import {
  isInspectToolEvent,
  inspectToolDistance,
} from '@/modules/protohub-manager-ui/utils/inspect-tools'

const base = { type: 'PROTOTYPE_INSPECT_TOOL_EVENT', channel: 'test-channel-123456', generation: 1 }
const selected = {
  ...base,
  status: 'selected',
  selection: {
    slot: 'A' as const,
    tagName: 'DIV',
    id: 'a',
    rect: { x: 10, y: 20, width: 30, height: 40 },
  },
}
const summary = {
  ...base,
  status: 'summary',
  summary: {
    visited: 10,
    truncated: false,
    colors: [{ value: 'rgb(1, 2, 3)', count: 4 }],
    fonts: [{ family: 'Arial', size: '14px', weight: '400', lineHeight: '20px', count: 2 }],
  },
}
it('accepts only the bounded root-tool wire and status-specific exact payload keys', () => {
  expect(isInspectToolEvent(selected)).toBe(true)
  expect(isInspectToolEvent(summary)).toBe(true)
  for (const value of [
    { ...base, status: 'ready', summary: summary.summary },
    { ...selected, token: 'unexpected' },
    { ...selected, generation: 0 },
    { ...selected, channel: 'short' },
    { ...selected, channel: 'invalid channel with space' },
    { ...base, status: ['ready'] },
    { ...selected, selection: { ...selected.selection, slot: ['A'] } },
    { ...selected, selection: { ...selected.selection, text: 'private input' } },
    {
      ...selected,
      selection: { ...selected.selection, rect: { ...selected.selection.rect, x: Infinity } },
    },
    {
      ...selected,
      selection: { ...selected.selection, rect: { ...selected.selection.rect, width: 0 } },
    },
    { ...summary, summary: { ...summary.summary, visited: 2001 } },
    {
      ...summary,
      summary: { ...summary.summary, colors: Array(101).fill(summary.summary.colors[0]) },
    },
    {
      ...summary,
      summary: {
        ...summary.summary,
        fonts: [{ ...summary.summary.fonts[0], family: 'x'.repeat(257) }],
      },
    },
    { ...summary, summary: { ...summary.summary, colors: [{ value: 'red', count: 14001 }] } },
  ])
    expect(isInspectToolEvent(value)).toBe(false)
})
it('computes separated, overlapping and touching outer rectangles in CSS px', () => {
  const a = selected.selection
  const b = { ...a, slot: 'B' as const, rect: { x: 50.125, y: 40, width: 30, height: 40 } }
  expect(inspectToolDistance(a, b)).toEqual({
    horizontal: { kind: 'gap', value: 10.13 },
    vertical: { kind: 'overlap', value: 20 },
  })
  expect(inspectToolDistance(a, { ...b, rect: { ...b.rect, x: 40 } }).horizontal).toEqual({
    kind: 'overlap',
    value: 0,
  })
  expect(inspectToolDistance(a, { ...a, slot: 'B' }).horizontal).toEqual({
    kind: 'overlap',
    value: 30,
  })
})
