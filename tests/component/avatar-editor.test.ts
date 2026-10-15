import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { common } from '@/shared/i18n/common'
import { slimmingEn } from '@/modules/authentication-manager-ui/locale-messages'
import AvatarEditor from '@/modules/authentication-manager-ui/views/account/components/AvatarEditor.vue'
import { uploadMeAvatar_api } from '@/modules/authentication-manager-ui/api/account/center'
vi.mock('@/modules/authentication-manager-ui/api/account/center', () => ({
  uploadMeAvatar_api: vi.fn(),
}))
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { common: common.en, slimming: slimmingEn } },
})
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 800
      naturalHeight = 400
      onload?: () => void
      onerror?: () => void
      set src(_value: string) {
        window.queueMicrotask(() => this.onload?.())
      }
    },
  )
  const BaseUrl = URL
  vi.stubGlobal(
    'URL',
    class extends BaseUrl {
      static createObjectURL = vi.fn(() => 'blob:avatar-test')
      static revokeObjectURL = vi.fn()
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
    done(new Blob(['PNG bytes'], { type: 'image/png' })),
  )
  vi.mocked(uploadMeAvatar_api).mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
async function choose(wrapper: ReturnType<typeof mount>) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File(['original'], 'source.png', { type: 'image/png' })],
  })
  await input.trigger('change')
  await flushPromises()
}
it('previews before uploading, preserves the previous avatar on failure and uploads a newly encoded PNG on retry', async () => {
  const wrapper = mount(AvatarEditor, {
    props: { modelValue: '/old.png' },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
  try {
    await choose(wrapper)
    expect(uploadMeAvatar_api).not.toHaveBeenCalled()
    const body = new DOMWrapper(document.body)
    expect(body.get('canvas').attributes('width')).toBe('256')
    vi.mocked(uploadMeAvatar_api).mockRejectedValueOnce(new Error('Upload rejected'))
    const upload = body
      .findAll('.ant-modal button')
      .find((button) => button.text() === 'Upload avatar')!
    await upload.trigger('click')
    await flushPromises()
    expect(body.text()).toContain('Upload rejected')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    vi.mocked(uploadMeAvatar_api).mockResolvedValueOnce({ url: '/new.png', accessUrl: '/new.png' })
    await upload.trigger('click')
    await flushPromises()
    const file = vi.mocked(uploadMeAvatar_api).mock.calls[1]![0]
    expect(file.name).toBe('avatar.png')
    expect(file.type).toBe('image/png')
    expect(file.size).toBe(9)
    expect(wrapper.emitted('update:modelValue')).toEqual([['/new.png']])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-test')
  } finally {
    wrapper.unmount()
  }
})
it('cancel does not upload and ignores a completed upload after the editor unmounts', async () => {
  const wrapper = mount(AvatarEditor, {
    props: { modelValue: '/old.png' },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
  try {
    await choose(wrapper)
    let body = new DOMWrapper(document.body)
    await body
      .findAll('.ant-modal button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click')
    expect(uploadMeAvatar_api).not.toHaveBeenCalled()
    await choose(wrapper)
    let resolve!: (value: { url: string; accessUrl: string }) => void
    vi.mocked(uploadMeAvatar_api).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    body = new DOMWrapper(document.body)
    await body
      .findAll('.ant-modal button')
      .find((button) => button.text() === 'Upload avatar')!
      .trigger('click')
    await flushPromises()
    wrapper.unmount()
    resolve({ url: '/late.png', accessUrl: '/late.png' })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  } finally {
    wrapper.unmount()
  }
})
it('falls back to the default icon after image errors while preserving the URL and retries display for a new URL', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false })
  vi.stubGlobal('fetch', fetch)
  const wrapper = mount(AvatarEditor, {
    props: { modelValue: '/old.png' },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
  try {
    await wrapper.get('.avatar-current img').trigger('error')
    expect(wrapper.find('.avatar-current img').exists()).toBe(false)
    expect(wrapper.find('.avatar-current .anticon-user').exists()).toBe(true)
    expect(wrapper.props('modelValue')).toBe('/old.png')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Adjust avatar')!
      .trigger('click')
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(
      '/old.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(wrapper.text()).toContain('Unable to read the image')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ modelValue: '/restored.png' })
    expect(wrapper.get('.avatar-current img').attributes('src')).toBe('/restored.png')
    expect(wrapper.find('.avatar-current .anticon-user').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
