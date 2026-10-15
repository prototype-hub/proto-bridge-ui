import { afterEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import PageTree from '@/modules/protohub-manager-ui/components/PageTree.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { common: { empty: 'No pages' } } },
})

it('toggles an initially expanded folder by its title while preserving nested page selection and source order', async () => {
  const wrapper = mount(PageTree, {
    props: {
      pages: [
        {
          name: '业务目录',
          folder: true,
          children: [
            { name: '总览', path: 'z.html', children: [{ name: '子页', path: 'child.html' }] },
            { name: '详情', path: 'a.html' },
          ],
        },
      ],
      selected: 'z.html',
    },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  const folder = wrapper.get('button.tree-folder')
  expect(folder.attributes('aria-expanded')).toBe('true')
  expect(wrapper.findAll('.tree-page').map((node) => node.text())).toEqual(['总览', '子页', '详情'])
  await folder.trigger('click')
  expect(folder.attributes('aria-expanded')).toBe('false')
  await expect.poll(() => wrapper.find('.tree-page').isVisible()).toBe(false)
  expect(wrapper.emitted('select')).toBeUndefined()
  await folder.trigger('click')
  await wrapper.findAll('.tree-page')[1].trigger('click')
  expect(wrapper.emitted('select')).toEqual([['child.html']])
  expect(wrapper.findAll('.anticon-folder')).toHaveLength(1)
  expect(wrapper.findAll('.anticon-file')).toHaveLength(3)
})

it('keeps duplicate page links as distinct selectable labels and does not turn empty folders into pages', async () => {
  const wrapper = mount(PageTree, {
    props: {
      pages: [
        { name: '原页面', path: 'same.html' },
        { name: '别名页面', path: 'same.html' },
        { name: '空目录', folder: true, path: 'same.html' },
      ],
      selected: 'same.html',
    },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  await wrapper.findAll('.tree-page')[1].trigger('click')
  expect(wrapper.emitted('select')).toEqual([['same.html']])
  expect(wrapper.get('.ant-tree-node-selected .tree-page').text()).toBe('别名页面')
  await wrapper.setProps({ selected: 'other.html' })
  expect(wrapper.find('.ant-tree-node-selected').exists()).toBe(false)
  await wrapper.get('button.tree-folder').trigger('click')
  expect(wrapper.emitted('select')).toHaveLength(1)
})
