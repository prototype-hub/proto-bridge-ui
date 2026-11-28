import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Select } from 'ant-design-vue'
import DesignTokenDocumentExplorer from '@/modules/protohub-manager-ui/components/DesignTokenDocumentExplorer.vue'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { tokenDocument } from '../fixtures/design-token-package'

const wrappers: VueWrapper[] = []
beforeEach(() => {
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
function render(document = tokenDocument()) {
  const wrapper = mount(DesignTokenDocumentExplorer, {
    props: { document },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  return wrapper
}
it('paginates visible tokens but searches and follows references across the complete projection', async () => {
  const wrapper = render()
  expect(wrapper.findAll('.token-results li')).toHaveLength(25)
  expect(wrapper.find('.token-results').text()).not.toContain('token29')
  await wrapper.get('.token-results button').trigger('click')
  expect(wrapper.get('#token-detail-heading').text()).toBe('token0')
  expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '{color.token29}')!
    .trigger('click')
  expect(wrapper.get('#token-detail-heading').text()).toBe('token29')
  await wrapper.get('input').setValue('token29')
  expect(wrapper.findAll('.token-results li')).toHaveLength(1)
  expect(wrapper.get('.token-results button').text()).toContain('token29')
})
it('shows unresolved values and contextual reference diagnostics without invented resolution', async () => {
  const doc = tokenDocument(1)
  doc.valid = false
  doc.tokens[0]!.resolvedValue = null
  doc.tokens[0]!.aliases = [{ reference: '{missing}', targetPath: null, status: 'missing' }]
  doc.issues = [
    {
      code: 'MISSING_REFERENCE',
      severity: 'error',
      pointer: '/color/token0/$value',
      message: 'Reference target is missing in this context',
    },
  ]
  const wrapper = render(doc)
  await wrapper.get('.token-results button').trigger('click')
  expect(wrapper.text()).toContain('/color/token0/$value')
  expect(wrapper.text()).toContain('目标缺失')
  expect(wrapper.findAll('pre').map((element) => element.text())).toContain('null')
  expect(wrapper.findAll('.token-aliases button')).toHaveLength(0)
})
it('keeps chosen inputs separate from defaults and preserves arbitrary modifier names safely', async () => {
  const doc = tokenDocument(1)
  doc.format = 'resolver'
  doc.modifiers = [
    { name: '__proto__', contexts: ['day', 'night'], defaultContext: 'day', description: null },
  ]
  doc.inputs = Object.fromEntries([
    ['__proto__', 'night'],
    ['density', 'compact'],
  ])
  const wrapper = render(doc)
  expect(wrapper.text()).toContain('默认：day')
  const control = wrapper.findComponent(Select)
  expect(control.props('value')).toBe('night')
  control.vm.$emit('change', 'day')
  const inputs = wrapper.emitted('inputs')![0]![0] as Record<string, string>
  expect(Object.entries(inputs)).toEqual([
    ['density', 'compact'],
    ['__proto__', 'day'],
  ])
  expect(Object.getPrototypeOf(inputs)).toBe(Object.prototype)
})
