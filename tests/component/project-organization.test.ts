import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProjectOrganizationActions from '@/modules/protohub-manager-ui/views/project/components/ProjectOrganizationActions.vue'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { useProjectOrganization } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectOrganization'
import { useProjectLabelOptions } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectLabelOptions'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { ApiError } from '@/shared/api/errors'
import { token } from '@/shared/auth/token'
import { permissionKey } from '@/shared/auth/provider'
import type { Project } from '@/modules/protohub-manager-ui/types'
import { ownerProjectAccess } from '../fixtures/project-access'
import { projectTestPinia } from '../fixtures/project-session'
import { hookHarness } from '../fixtures/hook-harness'
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  projectsApi: {
    get: vi.fn(),
    organization: vi.fn(),
    favorite: vi.fn(),
    organizationOptions: vi.fn(),
  },
}))
const wrappers: VueWrapper[] = []
const project = (): Project => ({
  id: 'p1',
  name: 'Project',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
})
function setup(viewer = false, saveOnly = false) {
  const current = ref(project()),
    read = ref(!saveOnly),
    edit = ref(!viewer)
  if (viewer) current.value.capabilities = { ...current.value.capabilities, edit: false }
  let state!: ReturnType<typeof useProjectOrganization>,
    options!: ReturnType<typeof useProjectLabelOptions>
  const updated = vi.fn((value: Project) => {
    current.value = value
  })
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useProjectOrganization(current, updated)
        options = useProjectLabelOptions('group')
      }),
      {
        global: {
          plugins: [projectTestPinia()],
          provide: {
            [permissionKey]: {
              can: (permission: string) =>
                permission.endsWith(':query') ? read.value : edit.value,
            },
          },
        },
      },
    ),
  )
  return { state, options, current, updated, read, edit }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(projectsApi.organizationOptions).mockResolvedValue({
    data: [],
    total: 0,
    pageIndex: 0,
    pageSize: 20,
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  token.clear()
  vi.unstubAllGlobals()
})
it('freezes the exact unknown organization payload/key and retries it without adopting later edits', async () => {
  const { state, current } = setup()
  state.edit()
  state.form.groupName = ' Team '
  state.form.tags = ['z', 'a']
  vi.mocked(projectsApi.organization).mockRejectedValueOnce(new ApiError('Disconnected'))
  await state.save()
  const first = vi.mocked(projectsApi.organization).mock.calls[0][1]
  expect(state.unknown.value).toBe(true)
  expect(Object.isFrozen(first)).toBe(true)
  expect(Object.isFrozen(first.tags)).toBe(true)
  state.form.groupName = 'later'
  await state.save()
  expect(projectsApi.organization).toHaveBeenCalledTimes(1)
  vi.mocked(projectsApi.organization).mockResolvedValue({
    ...current.value,
    groupName: 'Team',
    tags: ['a', 'z'],
    organizationVersion: 1,
  })
  await state.retry()
  expect(vi.mocked(projectsApi.organization).mock.calls[1][1]).toBe(first)
  expect(current.value.groupName).toBe('Team')
})
it('retains a conflicted draft and explicitly adopts only the current version before a new save', async () => {
  const { state, current } = setup()
  state.edit()
  state.form.groupName = 'My draft'
  state.form.tags = ['mine']
  vi.mocked(projectsApi.organization).mockRejectedValueOnce(new ApiError('Conflict', 409))
  await state.save()
  expect(state.conflict.value).toBe(true)
  vi.mocked(projectsApi.get).mockResolvedValue({
    ...current.value,
    groupName: 'Other',
    tags: ['other'],
    organizationVersion: 7,
    archivedTime: 30,
  })
  await state.refreshVersion()
  expect(state.form.groupName).toBe('My draft')
  expect(state.form.tags).toEqual(['mine'])
  expect(state.form.archived).toBe(true)
  vi.mocked(projectsApi.organization).mockResolvedValue({
    ...current.value,
    groupName: 'My draft',
    tags: ['mine'],
    organizationVersion: 8,
    archivedTime: 30,
  })
  await state.save()
  expect(vi.mocked(projectsApi.organization).mock.calls[1][1]).toMatchObject({
    expectedVersion: 7,
    archived: true,
  })
})
it('lets a viewer change only their own favorite and a save-only editor write organization without option reads', async () => {
  const viewer = setup(true)
  vi.mocked(projectsApi.favorite).mockResolvedValue({
    ...viewer.current.value,
    favorite: true,
    favoriteVersion: 1,
  })
  await viewer.state.favorite()
  expect(projectsApi.favorite).toHaveBeenCalledOnce()
  viewer.state.edit()
  expect(viewer.state.open.value).toBe(false)
  const editor = setup(false, true)
  editor.state.edit()
  editor.state.form.groupName = 'Shared'
  await editor.options.load()
  expect(projectsApi.organizationOptions).not.toHaveBeenCalled()
  vi.mocked(projectsApi.organization).mockResolvedValue({
    ...editor.current.value,
    groupName: 'Shared',
    organizationVersion: 1,
  })
  await editor.state.save()
  expect(projectsApi.organization).toHaveBeenCalledOnce()
})
it('checks a replaced credential before any read/write, clears private drafts, and ignores late replies without focus/storage events', async () => {
  const first = setup()
  first.state.edit()
  first.state.form.groupName = 'private draft'
  token.set('replacement')
  await first.options.load()
  await first.state.save()
  expect(projectsApi.organizationOptions).not.toHaveBeenCalled()
  expect(projectsApi.organization).not.toHaveBeenCalled()
  expect(first.state.form.groupName).toBe('')
  const second = setup()
  let resolve!: (value: Project) => void
  vi.mocked(projectsApi.favorite).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const flight = second.state.favorite()
  token.set('changed-without-event')
  resolve({ ...second.current.value, favorite: true, favoriteVersion: 1 })
  await flight
  await flushPromises()
  expect(second.updated).not.toHaveBeenCalled()
  expect(second.state.open.value).toBe(false)
  expect(second.state.busy.value).toBe(false)
})
it('clears drafts synchronously when EDIT permission is revoked', () => {
  const { state, edit } = setup()
  state.edit()
  state.form.groupName = 'private draft'
  edit.value = false
  expect(state.open.value).toBe(false)
  expect(state.form.groupName).toBe('')
})
it.each([401, 403, 404])(
  'clears an unresolved draft and denies further writes after refresh returns %s',
  async (status) => {
    const { state } = setup()
    state.edit()
    state.form.groupName = 'private draft'
    vi.mocked(projectsApi.organization).mockRejectedValueOnce(new ApiError('Disconnected'))
    await state.save()
    vi.mocked(projectsApi.get).mockRejectedValueOnce(new ApiError('Unavailable', status))
    await state.refreshVersion()
    expect(state.form.groupName).toBe('')
    expect(state.open.value).toBe(false)
    expect(state.unknown.value).toBe(false)
    expect(state.canEdit.value).toBe(false)
    await state.retry()
    expect(projectsApi.organization).toHaveBeenCalledTimes(1)
  },
)
it('submits the actual organization form through Ant Form validation', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {} }))
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  const current = project()
  vi.mocked(projectsApi.organization).mockResolvedValue({ ...current, organizationVersion: 1 })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ProjectOrganizationActions }],
  })
  await router.push('/')
  const wrapper = mount(ProjectOrganizationActions, {
    props: { project: current },
    global: {
      plugins: [projectTestPinia(), i18n, router],
      provide: { [permissionKey]: { can: () => true } },
      stubs: {
        AModal: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
        APopover: { inheritAttrs: false, template: '<div><slot /><slot name="content" /></div>' },
        APopconfirm: { inheritAttrs: false, template: '<div><slot /></div>' },
        ProjectLabelSelect: true,
      },
    },
  })
  wrappers.push(wrapper)
  await wrapper.find('.project-organization-menu-items button').trigger('click')
  await wrapper.find('form.project-organization-form').trigger('submit')
  await flushPromises()
  expect(projectsApi.organization).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({ expectedVersion: 0, groupName: '', tags: [], archived: false }),
    expect.anything(),
  )
})
