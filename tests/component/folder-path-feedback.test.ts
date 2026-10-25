import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import UploadDialog from '@/modules/protohub-manager-ui/views/project/components/UploadDialog.vue'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { request } from '@/shared/api/client'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const wrappers: VueWrapper[] = []

function selected(path: string) {
  const file = new File(['entry'], path.split('/').at(-1)!)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

/** Exercise the actual picker handler, manifest, hook and Alert slot without starting a Worker. */
async function selectFiles(files: File[]) {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    Object.defineProperty(this, 'files', { value: files })
    this.dispatchEvent(new Event('change'))
  })
  const wrapper = mount(UploadDialog, {
    props: { open: true, context: { projectId: 'p1' } },
    global: {
      plugins: [i18n],
      stubs: { AModal: { template: '<section role="dialog"><slot /></section>' } },
    },
  })
  wrappers.push(wrapper)
  const button = wrapper.findAll('button').find((button) => button.text() === '选择 HTML 文件夹')!
  await button.trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  vi.stubGlobal('Worker', vi.fn())
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
    value: false,
    writable: true,
    configurable: true,
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLInputElement.prototype, 'webkitdirectory')
})

it('shows the exact offending filenames, reasons and both sides of a conflict without uploading', async () => {
  const wrapper = await selectFiles([
    selected('中文原型/index.html'),
    selected('中文原型/.DS_Store'),
    selected('中文原型/index.html/nested.html'),
    selected('中文原型/index.html'),
  ])
  const alert = wrapper.get('.ant-alert-error')
  expect(alert.text()).toContain('发现 3 个路径问题')
  const issues = alert.findAll('li')
  expect(issues).toHaveLength(3)
  expect(issues[0]!.text()).toContain('中文原型/.DS_Store')
  expect(issues[0]!.text()).toContain(protoLocales.zh.folderPathReasons.hiddenEntry)
  expect(issues[1]!.text()).toContain('中文原型/index.html/nested.html')
  expect(issues[1]!.text()).toContain('与「中文原型/index.html」冲突')
  expect(issues[1]!.text()).toContain(protoLocales.zh.folderPathReasons.fileDirectoryConflict)
  expect(issues[2]!.text()).toContain(protoLocales.zh.folderPathReasons.duplicate)
  expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  expect(request.post).not.toHaveBeenCalled()
  expect(request.put).not.toHaveBeenCalled()
  expect(Worker).not.toHaveBeenCalled()
})

it('renders a bounded text-only list and total count, including unsafe-looking filenames', async () => {
  const files = [selected('root/index.html')]
  const unsafeName = 'root/.cache/<img src=x onerror=alert(1)>.js'
  files.push(selected(unsafeName))
  for (let index = 1; index < 25; index++) files.push(selected(`root/.hidden-${index}.txt`))
  const wrapper = await selectFiles(files)
  const alert = wrapper.get('.ant-alert-error')
  expect(alert.text()).toContain('发现 25 个路径问题')
  expect(alert.text()).toContain('仅显示前 20 项问题。')
  expect(alert.findAll('li')).toHaveLength(20)
  expect(alert.get('code').text()).toBe(unsafeName)
  expect(alert.find('img').exists()).toBe(false)
  expect(alert.find('[onerror]').exists()).toBe(false)
  expect(alert.text()).not.toContain('root/.hidden-24.txt')
  expect(request.post).not.toHaveBeenCalled()
  expect(Worker).not.toHaveBeenCalled()
})
