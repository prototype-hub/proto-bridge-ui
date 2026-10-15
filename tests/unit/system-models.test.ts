import { describe, it, expect } from 'vitest'
import { prepareModel, visibleField } from '@/modules/authentication-manager-ui/utils/model'

describe('shared system form normalization', () => {
  it('parses only visible JSON fields and combines mode/auth conditions', () => {
    const fields = [
      {
        key: 'config',
        kind: 'json' as const,
        label: 'system.configuration',
        conditions: [
          { key: 'modes', values: ['api'] },
          { key: 'type', values: ['oauth'] },
        ],
      },
    ]
    expect(visibleField(fields[0], { modes: ['api'], type: 'basic' })).toBe(false)
    expect(
      prepareModel({ modes: ['api'], type: 'oauth', config: '{"a":1}' }, fields).config,
    ).toEqual({ a: 1 })
    expect(() => prepareModel({ modes: ['api'], type: 'oauth', config: '{' }, fields)).toThrow()
  })
})
