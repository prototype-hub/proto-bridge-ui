import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import dayjs from 'dayjs'
import { createRouter, createMemoryHistory } from 'vue-router'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import { copyText } from '@/shared/utils/feedback'
import ShareDialog from '@/modules/protohub-manager-ui/views/project/components/ShareDialog.vue'
import type { Project, Share, Version } from '@/modules/protohub-manager-ui/types'

vi.mock('@/modules/protohub-manager-ui/api', () => ({
  sharesApi: { list: vi.fn(), create: vi.fn(), remove: vi.fn(), verifyPassword: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ copyText: vi.fn(), saved: vi.fn(), deleted: vi.fn() }))
const project: Project = { id: 'p1', name: '项目', createdBy: 'admin', createdAt: 1, updatedAt: 1 }
const version: Version = {
  id: 'v1',
  projectId: 'p1',
  versionName: 'V1',
  entryFile: 'index.html',
  status: 'ready',
  createdBy: 'admin',
  createdAt: 1,
  runtimeBaseUrl: '',
  previewUrl: '',
}
const locked: Share = {
  id: 's1',
  projectId: 'p1',
  versionId: 'v1',
  token: 'history',
  description: '需要密码的评审链接',
  passwordRequired: true,
  enabled: true,
  createdAt: 1,
  sharePath: '/share/history',
}
const open: Share = {
  ...locked,
  id: 'open',
  token: 'a-very-long-public-share-token-for-ellipsis-verification',
  passwordRequired: false,
  description: '无需密码的公开评审链接',
  createdAt: 1700000000000,
}
const wrappers: VueWrapper[] = []
const modal = () =>
  new DOMWrapper(document.body)
    .findAll('.ant-modal')
    .find((item) => item.text().includes('分享管理'))!
const copyModal = () =>
  new DOMWrapper(document.body)
    .findAll('.ant-modal')
    .find((item) => item.text().includes('复制分享'))!
async function render(permission = true) {
  const router = createRouter({
    history: createMemoryHistory('/tools'),
    routes: [{ path: '/share/:token', component: { render: () => h('div') } }],
  })
  await router.push('/share/fixture')
  const wrapper = mount(ShareDialog, {
    props: { project, version },
    attachTo: document.body,
    global: { plugins: [i18n, router], provide: { [permissionKey]: { can: () => permission } } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  await vi.waitFor(() =>
    expect(modal().findAll('tbody tr.ant-table-row').length).toBeGreaterThan(0),
  )
  return wrapper
}
beforeEach(() => {
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.stubGlobal('getComputedStyle', (element: Element) => getComputedStyle(element))
  vi.mocked(sharesApi.list).mockReset().mockResolvedValue([locked])
  vi.mocked(sharesApi.create)
    .mockReset()
    .mockResolvedValue({ ...locked, id: 'new', token: 'created' })
  vi.mocked(sharesApi.verifyPassword).mockReset().mockResolvedValue(true)
  vi.mocked(copyText).mockReset().mockResolvedValue(true)
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(async () => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  await flushPromises()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
describe('created and protected shares', () => {
  beforeEach(async () => {
    await render()
  })

  it('submits the actual inline form by keyboard exactly once, clears its field and copies only the created password', async () => {
    await modal().get('form input').setValue(' created ')
    vi.mocked(sharesApi.list).mockResolvedValue([
      locked,
      { ...locked, id: 'new', token: 'created' },
    ])
    await modal().get('form').trigger('submit')
    await flushPromises()
    expect(sharesApi.create).toHaveBeenCalledOnce()
    expect(sharesApi.create).toHaveBeenCalledWith('v1', {
      description: undefined,
      password: ' created ',
      expiresAt: undefined,
    })
    expect(modal().get<HTMLInputElement>('form input').element.value).toBe('')
    const rows = modal().findAll('tbody tr.ant-table-row')
    await rows[1]!.get('button[aria-label="复制"]').trigger('click')
    await flushPromises()
    expect(copyText).toHaveBeenLastCalledWith(
      `项目-V1：${window.location.origin}/tools/share/created\n密码： created `,
      undefined,
    )
    await modal().get('form input').setValue('different')
    await rows[0]!.get('button[aria-label="复制"]').trigger('click')
    await flushPromises()
    expect(copyModal().get('input').element.value).toBe('')
    expect(copyText).toHaveBeenCalledOnce()
  })
  it('blocks wrong history passwords and only copies after a verified user click with selectable multiline text', async () => {
    await modal().get('tbody button[aria-label="复制"]').trigger('click')
    await flushPromises()
    await copyModal().get('input').setValue('wrong')
    vi.mocked(sharesApi.verifyPassword).mockResolvedValueOnce(false)
    await copyModal().get('form').trigger('submit')
    await flushPromises()
    expect(copyModal().text()).toContain('分享密码错误，请重新输入')
    expect(copyModal().find('textarea').exists()).toBe(false)
    expect(copyText).not.toHaveBeenCalled()
    await copyModal().get('input').setValue(' history password ')
    await copyModal().get('form').trigger('submit')
    await flushPromises()
    expect(copyText).not.toHaveBeenCalled()
    expect(copyModal().get('textarea').element.value).toBe(
      `项目-V1：${window.location.origin}/tools/share/history\n密码： history password `,
    )
    expect(copyModal().get('textarea').attributes('readonly')).toBeDefined()
    const copyButton = copyModal()
      .findAll('button')
      .find((button) => button.text().replace(/\s/g, '') === '复制')!
    await copyButton.trigger('click')
    await flushPromises()
    expect(copyText).toHaveBeenCalledOnce()
  })
})
describe('denied creation permission', () => {
  beforeEach(async () => {
    await render(false)
  })

  it('keeps create capability hidden for denied permissions while history copy remains available', async () => {
    expect(modal().get('.share-create').find('button[type="submit"]').exists()).toBe(false)
    await modal().get('form').trigger('submit')
    await flushPromises()
    expect(sharesApi.create).not.toHaveBeenCalled()
    expect(modal().find('tbody button[aria-label="复制"]').exists()).toBe(true)
    expect(modal().find('tbody button[aria-label="删除"]').exists()).toBe(false)
  })
})
describe('share table', () => {
  beforeEach(async () => {
    vi.mocked(sharesApi.list).mockResolvedValueOnce([open, locked])
    await render()
  })

  it('renders the compact share table with dates, no-password copy and accessible icon actions', async () => {
    const table = modal().get('.share-table')
    expect(table.findAll('thead th').map((cell) => cell.text())).toEqual([
      '分享链接',
      '分享描述',
      '状态',
      '分享密码',
      '分享时间',
      '失效时间',
      '操作',
    ])
    const rows = table.findAll('tbody tr.ant-table-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.get('.share-description-text').text()).toBe(open.description)
    expect(rows[0]!.get('.share-password-state').text()).toBe('无密码')
    expect(rows[0]!.get('.share-created-time').text()).toBe(
      dayjs(open.createdAt).format('YYYY-MM-DD HH:mm:ss'),
    )
    expect(rows[0]!.get('.share-expiry-time').text()).toBe('—')
    expect(rows[0]!.get('.share-url').classes()).toContain('ellipsis')
    expect(rows[0]!.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      '复制',
      '删除',
    ])
    await rows[0]!.get('.share-url').trigger('mouseenter')
    await vi.waitFor(() =>
      expect(new DOMWrapper(document.body).get('.ant-tooltip-inner').text()).toBe(
        `${window.location.origin}/tools/share/${open.token}`,
      ),
    )
    const description = modal().get<HTMLTextAreaElement>('form textarea')
    await description.setValue('x'.repeat(2001))
    expect(description.element.value).toHaveLength(2000)
  })
})
describe('inactive shares', () => {
  beforeEach(async () => {
    vi.mocked(sharesApi.list).mockResolvedValueOnce([
      { ...open, id: 'expired', expiresAt: 1 },
      { ...open, id: 'disabled', enabled: false },
    ])
    await render()
  })

  it('does not render copy actions for expired or disabled shares while keeping delete available', async () => {
    const rows = modal().findAll('tbody tr.ant-table-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.find('button[aria-label="复制"]').exists()).toBe(false)
      expect(row.find('button[aria-label="删除"]').exists()).toBe(true)
    }
  })
})
