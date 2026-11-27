import { expect, it } from 'vitest'
import {
  blankDemoScript,
  demoQuery,
  demoTarget,
  validDemoScript,
} from '@/modules/protohub-manager-ui/utils/demo-script'
it('requires an unambiguous complete step locator and rejects mixed tools and duplicate IDs', () => {
  const query = { tool: 'demo', revisionId: 'r1', scriptId: 's1', stepId: 'step1' }
  expect(demoTarget(query)).toEqual({ revisionId: 'r1', scriptId: 's1', stepId: 'step1' })
  expect(demoQuery(demoTarget(query)!)).toEqual(query)
  expect(demoTarget({ tool: 'demo', revisionId: 'r1' })).toEqual({ revisionId: 'r1' })
  for (const patch of [
    { revisionId: ['r1', 'r2'] },
    { scriptId: '' },
    { stepId: undefined },
    { materialId: 'm' },
    { threadId: 't' },
    { tool: 'copy' },
  ])
    expect(demoTarget({ ...query, ...patch })).toBeNull()
})
it('accepts revisits with stable independent steps but rejects empty, injected and invalid manifest data', () => {
  const value = {
    ...blankDemoScript(),
    title: 'Demo',
    objective: 'Goal',
    steps: [
      { id: 'one', pageId: 'home', narration: '<script>ordinary text</script>' },
      { id: 'two', pageId: 'home', narration: 'A separate revisit' },
    ],
  }
  expect(validDemoScript(value, new Set(['home']))).toBe(true)
  for (const patch of [
    { title: '\uFEFF\u2003' },
    { objective: '\n\u00a0' },
    { resetNote: '\0' },
    { steps: [] },
    { shareEnabled: 'false' },
  ])
    expect(validDemoScript({ ...value, ...patch } as typeof value, new Set(['home']))).toBe(false)
  expect(
    validDemoScript({ ...value, steps: [value.steps[0], value.steps[0]] }, new Set(['home'])),
  ).toBe(false)
  expect(validDemoScript(value, new Set(['other-revision-page']))).toBe(false)
})
