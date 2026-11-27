import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { useDemoScripts } from '@/modules/protohub-manager-ui/hooks/useDemoScripts'
import { demoScriptApi as api } from '@/modules/protohub-manager-ui/api/demo-script'
import type { DemoScript, DemoScriptScope } from '@/modules/protohub-manager-ui/types/demo-script'
import { ApiError } from '@/shared/api/errors'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ownerProjectAccess } from '../fixtures/project-access'
import { hookHarness } from '../fixtures/hook-harness'
const credential = vi.hoisted(() => ({ value: 'one' }))
vi.mock('@/shared/auth/token', () => ({ token: { get: () => credential.value } }))
vi.mock('@/modules/protohub-manager-ui/api/demo-script', () => ({
  demoScriptApi: {
    query: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    publicQuery: vi.fn(),
    publicGet: vi.fn(),
  },
}))
const wrappers: VueWrapper[] = []
const context = {
  revisionId: 'r1',
  title: 'Project',
  versionName: 'V1',
  runtimeBaseUrl: '/api/prototype-hub/runtime/grant',
  entryFile: 'index.html',
  pages: [
    {
      name: 'Home',
      pageId: 'home',
      path: 'index.html',
      children: [{ name: 'Child', pageId: 'child', path: 'child.html' }],
    },
    { name: 'Folder', folder: true, pageId: 'folder' },
  ],
}
const scope: DemoScriptScope = {
  kind: 'member',
  actorId: 'u1',
  context,
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
  revision: {
    id: 'r1',
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 2,
    totalBytes: 10,
    createdBy: 'u1',
    createdAt: 1,
  },
}
const row: DemoScript = {
  id: 'server-derived-resource-id',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'r1',
  title: 'Demo',
  objective: 'Goal',
  prerequisites: '',
  resetNote: '',
  shareEnabled: false,
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
  steps: [
    { id: 'one', pageId: 'home', narration: 'First' },
    { id: 'two', pageId: 'home', narration: 'Revisit' },
  ],
}
async function setup(value = scope) {
  const current = ref<DemoScriptScope | undefined>(structuredClone(value)),
    read = ref(true),
    edit = ref(true)
  let state!: ReturnType<typeof useDemoScripts>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useDemoScripts(current)
      }),
      {
        global: {
          provide: {
            [permissionKey]: {
              can: (p: string) => (p.endsWith(':save') ? edit.value : read.value),
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, current, read, edit }
}
beforeEach(() => {
  vi.resetAllMocks()
  credential.value = 'one'
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  i18n.global.locale.value = 'en'
  vi.mocked(api.query).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  vi.mocked(api.publicQuery).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  vi.mocked(api.get).mockResolvedValue(structuredClone(row))
})
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))
it('keeps openable parents, repeated pages and stable step identities during insert/reorder/remove', async () => {
  const { state } = await setup()
  expect(state.pages.value.map((p) => p.pageId)).toEqual(['home', 'child'])
  await state.open(row.id)
  state.moveStep('two', -1)
  expect(state.form.steps.map((s) => [s.id, s.narration])).toEqual([
    ['two', 'Revisit'],
    ['one', 'First'],
  ])
  state.addStep()
  const added = state.activeStepId.value
  expect(added).not.toBe('one')
  state.removeStep(added)
  expect(state.activeStepId.value).toBe('one')
})
it('freezes original deep payload/key after unknown and adopts the current replay state', async () => {
  const { state } = await setup()
  state.create()
  Object.assign(state.form, structuredClone(row))
  vi.mocked(api.create).mockRejectedValueOnce(new ApiError('lost', 503))
  await state.save()
  const input = vi.mocked(api.create).mock.calls[0][2]
  expect(Object.isFrozen(input)).toBe(true)
  expect(Object.isFrozen(input.steps[0])).toBe(true)
  expect(Object.keys(input).sort()).toEqual([
    'clientRequestId',
    'objective',
    'prerequisites',
    'resetNote',
    'shareEnabled',
    'steps',
    'title',
  ])
  expect(state.unknown.value).toBe(true)
  state.create()
  await state.load()
  expect(api.create).toHaveBeenCalledTimes(1)
  vi.mocked(api.create).mockResolvedValue({ ...row, configVersion: 2, shareEnabled: false })
  await state.retry()
  expect(vi.mocked(api.create).mock.calls[1][2]).toBe(input)
  expect(state.original.value?.id).toBe(row.id)
  expect(state.unknown.value).toBe(false)
})
it('retains edits on conflict and refreshes the CAS version without replacing the draft', async () => {
  const { state } = await setup()
  await state.open(row.id)
  state.form.objective = 'Unsaved private text'
  vi.mocked(api.update).mockRejectedValue(new ApiError('conflict', 409))
  await state.save()
  expect(state.conflict.value).toBe(true)
  vi.mocked(api.get).mockResolvedValue({ ...row, title: 'Other editor', configVersion: 4 })
  await state.open(row.id, undefined, true)
  expect(state.form.objective).toBe('Unsaved private text')
  vi.mocked(api.update).mockResolvedValue({
    ...row,
    objective: state.form.objective,
    configVersion: 5,
  })
  await state.save()
  expect(vi.mocked(api.update).mock.calls[1][3].expectedVersion).toBe(4)
})
it('rejects unknown steps without selecting a fallback script', async () => {
  const { state } = await setup()
  expect(await state.open(row.id, 'absent')).toBe(false)
  expect(state.original.value).toBeUndefined()
  expect(state.form.steps).toEqual([])
  expect(state.error.value).toContain('unavailable')
})
it('clears sensitive drafts and aborts late reads on permission or credential loss', async () => {
  const { state, read } = await setup()
  await state.open(row.id)
  state.form.objective = 'Private draft'
  read.value = false
  await flushPromises()
  expect(state.form.objective).toBe('')
  expect(state.denied.value).toBe(true)
  read.value = true
  await flushPromises()
  await state.open(row.id)
  credential.value = 'other'
  window.dispatchEvent(new Event('focus'))
  expect(state.form.objective).toBe('')
  expect(state.denied.value).toBe(true)
})
it.each(['create', 'update', 'delete', 'retry', 'load', 'open'] as const)(
  'rejects %s after a credential replacement without storage or focus events',
  async (operation) => {
    const { state } = await setup()
    if (operation === 'create') {
      state.create()
      Object.assign(state.form, structuredClone(row))
    } else await state.open(row.id)
    state.form.objective = 'Unsaved text from the previous actor'
    if (operation === 'retry') {
      vi.mocked(api.update).mockRejectedValueOnce(new ApiError('lost', 503))
      await state.save()
      expect(state.unknown.value).toBe(true)
    }
    vi.clearAllMocks()
    credential.value = 'another-actor'
    if (operation === 'delete') await state.remove()
    else if (operation === 'retry') await state.retry()
    else if (operation === 'load') await state.load()
    else if (operation === 'open') await state.open(row.id)
    else await state.save()
    for (const call of Object.values(api)) expect(call).not.toHaveBeenCalled()
    expect(state.form.objective).toBe('')
    expect(state.original.value).toBeUndefined()
    expect(state.denied.value).toBe(true)
  },
)
it('uses public exact grants independently of review and exposes no mutation controls or member calls', async () => {
  const share = {
    token: 'open',
    accessKey: 'exact',
    revisionId: 'r1',
    runtimeBaseUrl: context.runtimeBaseUrl,
    projectName: 'Project',
    versionName: 'V1',
    revisionMode: 'latest' as const,
    passwordRequired: false,
    reviewEnabled: false,
  }
  const { id, revisionId, title, objective, prerequisites, resetNote, steps } = row
  vi.mocked(api.publicGet).mockResolvedValue({
    id,
    revisionId,
    title,
    objective,
    prerequisites,
    resetNote,
    steps,
  })
  const { state } = await setup({ kind: 'public', share, context })
  expect(await state.open(row.id, 'two')).toBe(true)
  expect(state.activeStepId.value).toBe('two')
  expect(state.canEdit.value).toBe(false)
  await state.save()
  state.create()
  state.removeStep('two')
  expect(api.query).not.toHaveBeenCalled()
  expect(api.get).not.toHaveBeenCalled()
  expect(api.create).not.toHaveBeenCalled()
  expect(state.form.steps).toHaveLength(2)
})

it('rejects public metadata beyond the seven content fields and ignores a late response after grant loss', async () => {
  const share = {
    token: 'open',
    accessKey: 'exact',
    revisionId: 'r1',
    runtimeBaseUrl: context.runtimeBaseUrl,
    projectName: 'Project',
    versionName: 'V1',
    revisionMode: 'fixed' as const,
    passwordRequired: false,
  }
  const { id, revisionId, title, objective, prerequisites, resetNote, steps } = row
  const body = { id, revisionId, title, objective, prerequisites, resetNote, steps }
  vi.mocked(api.publicGet).mockResolvedValue({ ...body, actorId: 'must-not-leak' } as typeof body)
  const { state, current } = await setup({ kind: 'public', share, context })
  expect(await state.open(row.id)).toBe(false)
  expect(state.form.objective).toBe('')
  let resolve!: (value: typeof body) => void
  vi.mocked(api.publicGet).mockReturnValue(
    new Promise((value) => {
      resolve = value
    }),
  )
  const reading = state.open(row.id)
  await flushPromises()
  const signal = vi.mocked(api.publicGet).mock.calls.at(-1)![2]!.signal
  current.value = { kind: 'public', share: { ...share, accessKey: undefined }, context }
  await flushPromises()
  expect(signal?.aborted).toBe(true)
  resolve(body)
  expect(await reading).toBe(false)
  expect(state.original.value).toBeUndefined()
  expect(state.form.objective).toBe('')
})
