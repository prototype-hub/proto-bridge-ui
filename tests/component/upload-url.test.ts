import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { configurationZh } from '@/modules/authentication-manager-ui/locale-messages'
import { systemLocales } from '@/modules/authentication-manager-ui/locale-messages'
import MenuIconEditor from '@/modules/authentication-manager-ui/views/menu/components/MenuIconEditor.vue'
import FieldInput from '@/modules/authentication-manager-ui/components/forms/FieldInput.vue'

vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn() } }))
const response = (result: unknown) => ({ success: true, status: 200, result })
const mounted: VueWrapper[] = []
const previous = '/api/file/static/previous.png'
const publicUrl = 'https://images.example/api/file/static/uploaded.png'
const relativeUrl = '/api/file/static/uploaded.png'
const file = new File(['original image bytes'], 'avatar.png', { type: 'image/png' })

function render(kind: 'avatar' | 'menu') {
  const model = reactive({ avatar: previous })
  const wrapper =
    kind === 'avatar'
      ? mount(FieldInput, {
          props: { field: { key: 'avatar', kind: 'file', label: 'common.name' }, model },
          global: { plugins: [i18n] },
        })
      : mount(MenuIconEditor, {
          props: { modelValue: previous },
          global: { plugins: [i18n] },
        })
  mounted.push(wrapper)
  return {
    wrapper,
    current: () =>
      kind === 'avatar'
        ? model.avatar
        : wrapper.emitted('update:modelValue')?.at(-1)?.[0] || previous,
  }
}
async function upload(wrapper: VueWrapper) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}
beforeEach(() => {
  vi.mocked(request.post).mockReset()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { configuration: configurationZh, system: systemLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe.each(['avatar', 'menu'] as const)('%s upload URL', (kind) => {
  it('keeps the original multipart file and stores accessUrl before the relative URL', async () => {
    vi.mocked(request.post).mockResolvedValue(
      response({ id: 'file-id', url: relativeUrl, accessUrl: publicUrl }),
    )
    const { wrapper, current } = render(kind)
    await upload(wrapper)
    expect(current()).toBe(publicUrl)
    expect(request.post).toHaveBeenCalledTimes(1)
    const [path, data] = vi.mocked(request.post).mock.calls[0]!
    expect(path).toBe('/file/upload')
    expect(data).toBeInstanceOf(FormData)
    if (!(data instanceof FormData)) throw new Error('Expected multipart upload')
    expect([...data.keys()]).toEqual(['file'])
    const uploaded = data.get('file')
    expect(uploaded).toBeInstanceOf(File)
    if (!(uploaded instanceof File)) throw new Error('Expected original upload file')
    expect([uploaded.name, uploaded.type, uploaded.size]).toEqual([file.name, file.type, file.size])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('uses the valid relative URL when accessUrl is missing or unsafe', async () => {
    vi.mocked(request.post).mockResolvedValue(
      response({ accessUrl: 'javascript:alert(1)', url: relativeUrl }),
    )
    const { wrapper, current } = render(kind)
    await upload(wrapper)
    expect(current()).toBe(relativeUrl)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('retains the prior image and exposes failed or unusable responses instead of storing an ID', async () => {
    const { wrapper, current } = render(kind)
    for (const result of [
      { id: 'not-an-image-url' },
      { accessUrl: 'javascript:alert(1)', url: '//outside.example/image.png' },
      { accessUrl: 'https://user:password@outside.example/image.png' },
      { url: '' },
    ]) {
      vi.mocked(request.post).mockResolvedValueOnce(response(result))
      await upload(wrapper)
      expect(current()).toBe(previous)
      expect(wrapper.get('[role="alert"]').text()).toBe(configurationZh.invalidUploadResponse)
    }
    vi.mocked(request.post).mockRejectedValueOnce(new Error('Upload rejected'))
    await upload(wrapper)
    expect(current()).toBe(previous)
    expect(wrapper.get('[role="alert"]').text()).toBe('Upload rejected')
  })
})
