import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import type { ApiResponse } from '@/shared/api/types'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import { systemLocales } from '@/modules/authentication-manager-ui/locale-messages'
import { configurationZh } from '@/modules/authentication-manager-ui/locale-messages'
import { useBasicSettings } from '@/modules/authentication-manager-ui/views/basis/hooks/useBasicSettings'
import BasisView from '@/modules/authentication-manager-ui/views/basis/index.vue'
import BrandingUpload from '@/modules/authentication-manager-ui/views/basis/components/BrandingUpload.vue'
import { defaultBrandingImages } from '@/modules/authentication-manager-ui'

vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
const response = <T>(result: T) => ({ success: true, status: 200, result })
const mounted: VueWrapper[] = []
let originalIcons: HTMLLinkElement[] = []
async function renderSettings(page = false) {
  let state!: ReturnType<typeof useBasicSettings>
  const harness = defineComponent({
    setup() {
      state = useBasicSettings()
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/system/Basis', component: { render: () => h('div') } }],
  })
  await router.push('/system/Basis')
  const wrapper = mount(page ? BasisView : harness, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), router, i18n],
      provide: { [permissionKey]: { can: () => true } },
    },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, state }
}
function renderUpload() {
  const wrapper = mount(BrandingUpload, {
    props: { kind: 'ico', modelValue: '/old.ico' },
    global: { plugins: [i18n] },
  })
  mounted.push(wrapper)
  return wrapper
}
async function chooseFile(wrapper: VueWrapper, file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}
beforeEach(() => {
  originalIcons = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')]
  originalIcons.forEach((icon) => icon.remove())
  vi.mocked(request.post).mockReset()
  vi.mocked(request.get).mockReset()
  vi.mocked(request.post).mockImplementation(async (path) =>
    response(
      path === '/system/config/scopes'
        ? [
            {
              scope: 'front',
              properties: { title: 'Branding', headerTheme: 'light', showRecordNumber: false },
            },
            { scope: 'amap', properties: {} },
            { scope: 'paths', properties: { 'base-path': '/api' } },
          ]
        : path === '/file/upload'
          ? { accessUrl: '/api/uploaded.ico' }
          : true,
    ),
  )
  vi.mocked(request.get).mockResolvedValue(response({ version: 'test' }))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { system: systemLocales.zh, configuration: configurationZh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(async () => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  await flushPromises()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.head.querySelectorAll('link[rel="icon"]').forEach((icon) => icon.remove())
  originalIcons.forEach((icon) => document.head.append(icon))
})
it('shows all default previews in the actual settings page without emitting image model updates', async () => {
  const { wrapper } = await renderSettings(true)
  for (const kind of ['logo', 'ico', 'background'] as const) {
    expect(wrapper.get(`.branding-upload.${kind} img`).attributes('src')).toBe(
      defaultBrandingImages[kind],
    )
  }
  for (const upload of wrapper.findAllComponents(BrandingUpload))
    expect(upload.emitted('update:modelValue')).toBeUndefined()
})
it('switches a preview between its saved custom path and module default without persisting a default', async () => {
  const wrapper = renderUpload()
  expect(wrapper.get('img').attributes('src')).toBe('/old.ico')
  await wrapper.setProps({ modelValue: '' })
  expect(wrapper.get('img').attributes('src')).toBe(defaultBrandingImages.ico)
  await wrapper.setProps({ modelValue: '/new.ico' })
  expect(wrapper.get('img').attributes('src')).toBe('/new.ico')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
it('guards direct saves independently and preserves the three-scope DTO including empty amap', async () => {
  const { state } = await renderSettings()
  state.form.value.paths = { 'base-path': 'http://192.168.0.280:5173/api' }
  await state.save()
  expect(state.task.error.value).toBe(configurationZh.invalidBasePath)
  expect(vi.mocked(request.post).mock.calls.some(([path]) => path.endsWith('/_save'))).toBe(false)
  expect(state.form.value.paths).toEqual({ 'base-path': 'http://192.168.0.280:5173/api' })
  state.form.value.paths = { 'base-path': '/api' }
  await state.save()
  expect(request.post).toHaveBeenCalledWith('/system/config/scope/_save', [
    {
      scope: 'front',
      properties: { title: 'Branding', headerTheme: 'light', showRecordNumber: false },
    },
    { scope: 'amap', properties: {} },
    { scope: 'paths', properties: { 'base-path': '/api' } },
  ])
})
it('shows the invalid address at the real form field and prevents a request', async () => {
  const { wrapper } = await renderSettings(true)
  const labels = wrapper.findAll('.ant-form-item-label label').map((label) => label.text())
  for (const label of [
    systemLocales.zh.webKey,
    systemLocales.zh.apiKey,
    systemLocales.zh.secretKey,
  ])
    expect(labels).not.toContain(label)
  const uploads = wrapper.findAll('.branding-upload')
  expect(uploads).toHaveLength(3)
  for (const upload of uploads) expect(upload.findAll('input:not([type="file"])')).toHaveLength(0)
  const field = wrapper
    .findAll('.ant-form-item')
    .find((item) => item.find('label').text() === '后台访问地址')!
  await field.get('input').setValue('http://192.168.0.280:5173/api')
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(field.text()).toContain(configurationZh.invalidBasePath))
  expect(vi.mocked(request.post).mock.calls.some(([path]) => path.endsWith('/_save'))).toBe(false)
})
it('rejects disguised ICO bytes locally and preserves the previous model', async () => {
  const wrapper = renderUpload()
  await chooseFile(wrapper, new File(['PNG data'], 'disguised.ico', { type: 'image/x-icon' }))
  await vi.waitFor(() =>
    expect(wrapper.get('[role="alert"]').text()).toBe(configurationZh.invalidIcon),
  )
  expect(request.post).not.toHaveBeenCalled()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.get('img').attributes('src')).toBe('/old.ico')
})
it('uploads the original filename and MIME in the file multipart field', async () => {
  const wrapper = renderUpload(),
    file = new File([new Uint8Array([0, 0, 1, 0, 1, 0, 0])], 'original.ico', {
      type: 'image/vnd.microsoft.icon',
    })
  await chooseFile(wrapper, file)
  await vi.waitFor(() =>
    expect(wrapper.emitted('update:modelValue')).toEqual([['/api/uploaded.ico']]),
  )
  expect(request.post).toHaveBeenCalledTimes(1)
  const [path, data] = vi.mocked(request.post).mock.calls[0]!
  expect(path).toBe('/file/upload')
  expect(data).toBeInstanceOf(FormData)
  if (!(data instanceof FormData)) throw new Error('Expected a multipart upload')
  expect([...data.keys()]).toEqual(['file'])
  const uploaded = data.get('file')
  expect(uploaded).toBeInstanceOf(File)
  if (!(uploaded instanceof File)) throw new Error('Expected the original file')
  expect(uploaded.name).toBe(file.name)
  expect(uploaded.type).toBe(file.type)
  expect(uploaded.size).toBe(file.size)
})
it('reports server rejection and malformed success without replacing the current image', async () => {
  const wrapper = renderUpload(),
    file = new File([new Uint8Array([0, 0, 1, 0, 1, 0, 0])], 'valid.ico')
  vi.mocked(request.post).mockRejectedValueOnce(
    new ApiError('系统管理请求参数无效', 400, 'BAD_REQUEST'),
  )
  await chooseFile(wrapper, file)
  await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('系统管理请求参数无效'))
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  vi.mocked(request.post).mockResolvedValueOnce(response({ accessUrl: '' }))
  await chooseFile(wrapper, file)
  await vi.waitFor(() =>
    expect(wrapper.get('[role="alert"]').text()).toBe(configurationZh.invalidUploadResponse),
  )
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.get('img').attributes('src')).toBe('/old.ico')
})

it('locks upload controls while a request is pending and restores them after failure', async () => {
  let reject!: (cause: unknown) => void
  vi.mocked(request.post).mockImplementation(
    () =>
      new Promise<ApiResponse<unknown>>((_resolve, fail) => {
        reject = fail
      }),
  )
  const wrapper = renderUpload(),
    file = new File([new Uint8Array([0, 0, 1, 0, 1, 0, 0])], 'pending.ico')
  await chooseFile(wrapper, file)
  await vi.waitFor(() => expect(request.post).toHaveBeenCalledTimes(1))
  expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.mask button').attributes('disabled')).toBeDefined()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  reject(new ApiError('Upload rejected', 400, 'BAD_REQUEST'))
  await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('Upload rejected'))
  expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('.mask button').attributes('disabled')).toBeUndefined()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.get('img').attributes('src')).toBe('/old.ico')
})
