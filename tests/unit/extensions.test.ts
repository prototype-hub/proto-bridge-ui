import { expect, it } from 'vitest'
import { mergeExtensions } from '@/app/modules/extensions'

it('keeps the basic edition registry empty without locally assembled modules', () => {
  expect(mergeExtensions({})).toEqual({
    componentMap: {},
    componentAliases: {},
    menuPathMap: {},
    locales: { zh: {}, en: {} },
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
      },
    },
    '/src/extensions/a/index.ts': {
      default: {
        componentMap: { 'example/Page': first },
        menuPathMap: { '/example': { code: 'example/Page', component: first } },
      },
    },
  })
  expect(result.componentMap['example/Page']).toBe(second)
  expect(result.menuPathMap['/example']?.component).toBe(first)
  expect(result.locales.en).toEqual({ example: { title: 'Last' } })
})
