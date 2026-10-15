import { describe, it, expect } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { Modal, InputPassword, ConfigProvider } from 'ant-design-vue'
describe('Ant Design Vue 4 compatibility', () => {
  it('renders an open modal and password visibility control with theme tokens', async () => {
    const wrapper = mount(ConfigProvider, {
      props: { theme: { token: { colorPrimary: '#1677ff' } } },
      slots: {
        default: () =>
          h(
            Modal,
            { open: true, title: 'Compatibility', transitionName: '', maskTransitionName: '' },
            { default: () => h(InputPassword, { value: 'secret' }) },
          ),
      },
      attachTo: document.body,
    })
    expect(document.querySelector('.ant-modal-title')?.textContent).toBe('Compatibility')
    expect(document.querySelector('input')?.type).toBe('password')
    expect(document.querySelector('.ant-input-password-icon')).toBeTruthy()
    wrapper.unmount()
  })
})
