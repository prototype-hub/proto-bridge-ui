import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons-vue'
import { Popconfirm } from 'ant-design-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { permissionKey } from '@/shared/auth/provider'

const mounted: VueWrapper[] = []
const body = () => new DOMWrapper(document.body)
async function nextAnimationFrame() {
  // Ant Tooltip synchronizes its controlled open state on the next animation frame.
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  await flushPromises()
}
function render(props: Partial<InstanceType<typeof ActionButton>['$props']> = {}) {
  const wrapper = mount(ActionButton, {
    props: { label: 'Edit', icon: EditOutlined, ...props },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}
beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterAll(() => vi.unstubAllGlobals())
afterEach(async () => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  await flushPromises()
  document.body.innerHTML = ''
})

describe('ActionButton', () => {
  it('removes the entire action including its overlays when permission is absent', async () => {
    const allowed = ref(false)
    const can = vi.fn(() => allowed.value)
    const wrapper = mount(ActionButton, {
      props: {
        label: 'Delete',
        icon: DeleteOutlined,
        permission: ['rows:delete'],
        confirm: 'Delete row?',
      },
      global: { provide: { [permissionKey]: { can } } },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('.action-button-trigger').exists()).toBe(false)
    expect(body().find('.ant-popconfirm').exists()).toBe(false)
    allowed.value = true
    await nextTick()
    expect(wrapper.get('button').attributes('aria-label')).toBe('Delete')
    expect(can).toHaveBeenCalledWith(['rows:delete'])
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() =>
      expect(body().get('.ant-popconfirm-message-title').text()).toBe('Delete row?'),
    )
    allowed.value = false
    await nextTick()
    expect(wrapper.find('.action-button-trigger').exists()).toBe(false)
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('keeps an accessible icon-only button and emits a direct action once', async () => {
    const wrapper = render()
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Edit')
    expect(button.find('svg').exists()).toBe(true)
    expect(button.text()).toBe('')
    await button.trigger('click')
    expect(wrapper.emitted('action')).toEqual([[]])
    expect(body().find('.ant-popconfirm').exists()).toBe(false)
  })

  it('preserves the confirmation message and separates cancellation from confirmed action', async () => {
    const wrapper = render({
      label: 'Delete',
      icon: DeleteOutlined,
      danger: true,
      confirm: 'Delete this version?',
    })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() =>
      expect(body().get('.ant-popconfirm-message-title').text()).toBe('Delete this version?'),
    )
    expect(wrapper.emitted('action')).toBeUndefined()
    const cancel = body().get('.ant-popconfirm-buttons button:not(.ant-btn-primary)')
    await cancel.trigger('click')
    await flushPromises()
    await nextAnimationFrame()
    expect(wrapper.emitted('action')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(Popconfirm).props('open')).toBe(true))
    await vi.waitFor(() =>
      expect(body().find('.ant-popconfirm-buttons .ant-btn-primary').exists()).toBe(true),
    )
    await body().get('.ant-popconfirm-buttons .ant-btn-primary').trigger('click')
    expect(wrapper.emitted('action')).toEqual([[]])
    expect(wrapper.get('button').classes()).toContain('ant-btn-dangerous')
  })

  it('blocks disabled/loading operations including an already-open confirmation', async () => {
    const wrapper = render({ disabled: true, confirm: 'Confirm edit?' })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.findComponent(Popconfirm).props('open')).toBe(false)
    expect(wrapper.emitted('action')).toBeUndefined()
    await wrapper.setProps({ disabled: false })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(Popconfirm).props('open')).toBe(true))
    await wrapper.setProps({ loading: true })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').classes()).toContain('ant-btn-loading')
    expect(wrapper.findComponent(Popconfirm).props('open')).toBe(false)
    wrapper.findComponent(Popconfirm).vm.$emit('confirm')
    expect(wrapper.emitted('action')).toBeUndefined()
    await nextAnimationFrame()
    await wrapper.setProps({ loading: false })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent(Popconfirm).props('open')).toBe(true))
    await vi.waitFor(() =>
      expect(body().find('.ant-popconfirm-buttons .ant-btn-primary').exists()).toBe(true),
    )
    await body().get('.ant-popconfirm-buttons .ant-btn-primary').trigger('click')
    expect(wrapper.emitted('action')).toEqual([[]])
  })

  it('shows the disabled reason while keeping the operation label for assistive technology', async () => {
    const wrapper = render({
      label: 'Delete',
      disabled: true,
      tooltip: 'Disable this user before deleting',
    })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Delete')
    await wrapper.get('.action-button-trigger').trigger('mouseenter')
    await vi.waitFor(() =>
      expect(body().get('.ant-tooltip-inner').text()).toBe('Disable this user before deleting'),
    )
    expect(wrapper.emitted('action')).toBeUndefined()
  })
})
