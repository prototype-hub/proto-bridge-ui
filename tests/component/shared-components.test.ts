import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import PageTree from '@/modules/protohub-manager-ui/components/PageTree.vue'
it('hides an unauthorized action and exposes only permitted actions', () => {
  const denied = mount(PermissionButton, {
    props: { permission: 'resource:save' },
    global: { provide: { [permissionKey as symbol]: { can: () => false } } },
    slots: { default: 'Save' },
  })
  expect(denied.find('button').exists()).toBe(false)
  denied.unmount()
  const allowed = mount(PermissionButton, {
    props: { permission: 'resource:save' },
    global: {
      provide: { [permissionKey as symbol]: { can: (value: string) => value === 'resource:save' } },
    },
    slots: { default: 'Save' },
  })
  expect(allowed.find('button').text()).toContain('Save')
  allowed.unmount()
})
it('treats project descriptions as text', () => {
  const wrapper = mount(TextEllipsis, { props: { text: '<img src=x onerror=alert(1)>' } })
  expect(wrapper.text()).toContain('<img')
  expect(wrapper.find('img').exists()).toBe(false)
  wrapper.unmount()
})
it('renders one distinct icon per folder/page and emits child-page selection', async () => {
  const wrapper = mount(PageTree, {
    props: {
      pages: [
        {
          name: 'Folder',
          folder: true,
          children: [
            {
              name: 'Parent',
              path: 'parent.html',
              children: [{ name: 'Child', path: 'child.html' }],
            },
          ],
        },
      ],
    },
    global: { plugins: [i18n] },
  })
  expect(wrapper.findAll('.anticon-folder')).toHaveLength(1)
  expect(wrapper.findAll('.anticon-file')).toHaveLength(2)
  const child = wrapper.findAll('.tree-page').find((node) => node.text() === 'Child')
  await child?.trigger('click')
  expect(wrapper.emitted('select')?.[0]).toEqual(['child.html'])
  wrapper.unmount()
})
