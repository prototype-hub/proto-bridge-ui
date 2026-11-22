import { expect, it } from 'vitest'
import { mergeExtensions } from '@/app/modules/extensions'

it('keeps the basic edition registry empty without locally assembled modules', () => {
  expect(mergeExtensions({})).toEqual({
    componentMap: {},
    componentAliases: {},
    menuPathMap: {},
    locales: { zh: {}, en: {} },
    versionTools: [],
    comparisonTools: [],
    loginTools: [],
    reviewThreadTools: [],
  })
})

it('merges only build-time modules in stable path order', () => {
  const first = async () => ({ default: {} })
  const second = async () => ({ default: {} })
  const result = mergeExtensions({
    '/src/extensions/z/index.ts': {
      default: {
        componentMap: { 'example/Page': second },
        locales: { zh: { example: { title: '后' } }, en: { example: { title: 'Last' } } },
        versionTools: [{ name: 'LastTool' }],
        loginTools: [{ name: 'LastLogin' }],
        comparisonTools: [
          { key: 'example', labelKey: 'example.title', component: { name: 'CompareTool' } },
        ],
      },
    },
    '/src/extensions/a/index.ts': {
      default: {
        componentMap: { 'example/Page': first },
        menuPathMap: { '/example': { code: 'example/Page', component: first } },
        versionTools: [{ name: 'FirstTool' }],
        loginTools: [{ name: 'FirstLogin' }],
      },
    },
  })
  expect(result.comparisonTools.map((tool) => tool.key)).toEqual(['example'])
  expect(result.componentMap['example/Page']).toBe(second)
  expect(result.menuPathMap['/example']?.component).toBe(first)
  expect(result.locales.en).toEqual({ example: { title: 'Last' } })
  expect(result.versionTools.map((tool) => 'name' in tool && tool.name)).toEqual([
    'FirstTool',
    'LastTool',
  ])
})

it('merges login tools in stable module order', () => {
  const result = mergeExtensions({
    '/z': { default: { loginTools: [{ name: 'Last' }] } },
    '/a': { default: { loginTools: [{ name: 'First' }] } },
  })
  expect(result.loginTools.map((tool) => 'name' in tool && tool.name)).toEqual(['First', 'Last'])
})

it('merges optional review tools without enabling any in the basic edition', () => {
  const result = mergeExtensions({
    '/z': { default: { reviewThreadTools: [{ name: 'Last' }] } },
    '/a': { default: { reviewThreadTools: [{ name: 'First' }] } },
  })
  expect(result.reviewThreadTools.map((tool) => 'name' in tool && tool.name)).toEqual([
    'First',
    'Last',
  ])
})
