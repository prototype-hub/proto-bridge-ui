import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import { request } from '@/shared/api/client'
import { permissionKey } from '@/shared/auth/provider'
import { common } from '@/shared/i18n/common'
import { authLocales } from '@/modules/authentication-manager-ui/locale-messages'
import MenusView from '@/modules/authentication-manager-ui/views/menu/index.vue'
import { menuManagement } from '@/modules/authentication-manager-ui/api/menu/menu'
import { menuPayload } from '@/modules/authentication-manager-ui/utils/menu'
import { slimmingEn, configurationEn } from '@/modules/authentication-manager-ui/locale-messages'

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/client')>()),
  request: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))

const rawMenu = () => ({
  id: 'nullable-menu',
  code: 'system/Nullable',
  name: 'Nullable menu',
  url: '/system/nullable',
  icon: 'AppstoreOutlined',
  sortIndex: 1,
  accessSupport: { value: 'unsupported', text: 'Unsupported' },
  permissions: null,
  indirectMenus: null,
  options: null,
  children: null,
  buttons: [{ id: 'view', name: 'View', permissions: null, description: null }],
  extraSettings: { preserved: true },
})
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      common: common.en,
      auth: authLocales.en,
      slimming: slimmingEn,
      configuration: configurationEn,
    },
  },
})
let cleanup: (() => void) | undefined
/** Keep the known Ant warning, but avoid serializing its entire synchronous component ancestry. */
function compactFormWarningTrace() {
  const reportError = console.error.bind(console),
    reportWarning = console.warn.bind(console)
  let printingKnownTrace = false
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].startsWith(
        'Warning: [ant-design-vue: Form.Item] FormItem can only collect one field item',
      )
    ) {
      printingKnownTrace = true
      window.queueMicrotask(() => (printingKnownTrace = false))
    }
    reportError(...args)
  })
  const warning = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (
      printingKnownTrace &&
      args[0] === 'at' &&
      args.length === 2 &&
      args[1] !== null &&
      typeof args[1] === 'object'
    )
      return
    reportWarning(...args)
  })
  return () => {
    error.mockRestore()
    warning.mockRestore()
  }
}
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  )
  const style = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => style(element))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
})
beforeEach(() => {
  vi.mocked(request.get).mockImplementation(async (url) => ({
    success: true,
    status: 200,
    result: url === '/menu/nullable-menu' ? rawMenu() : [],
  }))
  vi.mocked(request.post).mockImplementation(async (url) => ({
    success: true,
    status: 200,
    result:
      url === '/menu/_all/tree'
        ? [rawMenu()]
        : url === '/permission/_query/no-paging'
          ? [{ id: 'menu', name: 'Menus', actions: [{ action: 'query', name: 'Query' }] }]
          : [],
  }))
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
})
afterAll(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('opens the real menu editor and permission picker from nullable detail and button permissions', async () => {
  const restoreWarning = compactFormWarningTrace()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/system/menu', component: MenusView }],
  })
  await router.push('/system/menu')
  const errors = vi.fn()
  const wrapper = mount(MenusView, {
    attachTo: document.body,
    global: {
      plugins: [i18n, router, createPinia()],
      provide: { [permissionKey as symbol]: { can: () => true } },
      config: { errorHandler: errors },
      stubs: { QueryHistory: true },
    },
  })
  cleanup = () => {
    wrapper.unmount()
    restoreWarning()
  }
  await flushPromises()
  expect(wrapper.find('tbody').text()).toContain('Nullable menu')
  await wrapper
    .findAll('tbody button')
    .find((button) => button.attributes('aria-label') === 'Edit')!
    .trigger('click')
  await flushPromises()
  expect(request.get).toHaveBeenCalledWith('/menu/nullable-menu')
  expect(errors).not.toHaveBeenCalled()
  const body = new DOMWrapper(document.body)
  expect(body.findAll('.ant-drawer label').some((label) => label.text() === 'Component code')).toBe(
    false,
  )
  expect(body.find('.ant-drawer').text()).toContain(
    'Use the address of an existing page. Directories can contain child menus.',
  )
  const englishLabel = body
    .findAll('.ant-drawer label')
    .find((label) => label.text() === 'English name')!
  expect(englishLabel.exists()).toBe(true)
  const english = body.get(`input[id="${englishLabel.attributes('for')}"]`)
  expect(english.attributes('maxlength')).toBe('64')
  await english.setValue('English menus ')
  expect((english.element as HTMLInputElement).value).toBe('English menus ')
  expect(body.find('.ant-drawer .permission-picker').text()).toContain('Menus')
  await body
    .findAll('.ant-drawer [role="tab"]')
    .find((tab) => tab.text() === 'Button management')!
    .trigger('click')
  await flushPromises()
  expect(body.find('.ant-drawer tbody').text()).toContain('View')
  await body
    .findAll('.ant-drawer tbody button')
    .find((button) => button.attributes('aria-label') === 'Edit')!
    .trigger('click')
  await flushPromises()
  expect(errors).not.toHaveBeenCalled()
  expect(body.find('.ant-modal .permission-picker').text()).toContain('Menus')
}, 45000)

it('normalizes only nullable menu collections while retaining enum envelopes and extra fields', async () => {
  const detail = await menuManagement.detail('nullable-menu')
  expect(detail).toMatchObject({
    permissions: [],
    indirectMenus: [],
    buttons: [{ id: 'view', name: 'View', permissions: [] }],
    accessSupport: { value: 'unsupported', text: 'Unsupported' },
    extraSettings: { preserved: true },
  })
  const rows = await menuManagement.list()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toEqual(detail)
  expect(rawMenu().permissions).toBeNull()
})

it('rejects malformed menu collections instead of presenting an empty successful list', async () => {
  vi.mocked(request.get).mockResolvedValueOnce({
    success: true,
    status: 200,
    result: { ...rawMenu(), permissions: { invalid: true } },
  })
  await expect(menuManagement.detail('nullable-menu')).rejects.toThrow()
  vi.mocked(request.post).mockResolvedValueOnce({ success: true, status: 200, result: {} })
  await expect(menuManagement.list()).rejects.toThrow()
})

it('saves native English metadata, trims only at the API boundary and keeps other translations', () => {
  const menu = {
    id: 'language',
    code: 'system/Menu',
    name: '新中文',
    i18nMessages: {
      name: {
        zh_CN: '旧中文',
        en_US: ' Custom menus ',
        en: ' Custom menus ',
        fr: 'Menus français',
      },
      describe: { fr: 'Description' },
    },
  }
  expect(menuPayload(menu).i18nMessages).toEqual({
    name: { zh_CN: '新中文', en_US: 'Custom menus', en: 'Custom menus', fr: 'Menus français' },
    describe: { fr: 'Description' },
  })
  expect(menu.i18nMessages.name.en_US).toBe(' Custom menus ')
  expect(
    menuPayload({
      ...menu,
      i18nMessages: {
        ...menu.i18nMessages,
        name: { ...menu.i18nMessages.name, en_US: ' ', en: '' },
      },
    }).i18nMessages?.name,
  ).toEqual({ zh_CN: '新中文', fr: 'Menus français' })
})
