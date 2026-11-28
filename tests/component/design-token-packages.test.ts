import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { useDesignTokenPackages } from '@/modules/protohub-manager-ui/hooks/useDesignTokenPackages'
import { designTokenPackagesApi as api } from '@/modules/protohub-manager-ui/api/design-token-package'
import type { DesignTokenScope } from '@/modules/protohub-manager-ui/types/design-token-package'
import { ApiError } from '@/shared/api/errors'
import { permissionKey } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { tokenDocument, tokenPackage, tokenScope } from '../fixtures/design-token-package'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/modules/protohub-manager-ui/api/design-token-package', () => ({
  designTokenPackagesApi: {
    query: vi.fn(),
    get: vi.fn(),
    document: vi.fn(),
    validate: vi.fn(),
    import: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    content: vi.fn(),
  },
}))
vi.mock('@/shared/api/client', () => ({ download: vi.fn() }))
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetAllMocks()
  token.set('actor-one')
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.mocked(api.query).mockResolvedValue({
    data: [structuredClone(tokenPackage)],
    total: 1,
    pageIndex: 0,
    pageSize: 20,
  })
  vi.mocked(api.get).mockResolvedValue(structuredClone(tokenPackage))
  vi.mocked(api.document).mockResolvedValue(tokenDocument())
  vi.mocked(api.validate).mockResolvedValue(tokenDocument())
  vi.mocked(api.import).mockResolvedValue({
    id: tokenPackage.id,
    status: 'current',
    package: structuredClone(tokenPackage),
  })
  vi.mocked(api.remove).mockResolvedValue(true)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  token.clear()
})
async function render() {
  const scope = ref<DesignTokenScope | undefined>(structuredClone(tokenScope)),
    read = ref(true),
    write = ref(true)
  let state!: ReturnType<typeof useDesignTokenPackages>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useDesignTokenPackages(scope)
      }),
      {
        global: {
          provide: {
            [permissionKey as symbol]: {
              can: (permission: string) =>
                permission.endsWith(':save') ? write.value : read.value,
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, scope, read, write }
}
it('keeps original file/key/source/invalid acknowledgement frozen through unknown retry and honors missing replay', async () => {
  const { state } = await render()
  const invalid = tokenDocument()
  invalid.valid = false
  vi.mocked(api.validate).mockResolvedValue(invalid)
  state.startImport()
  const file = new File(['\ufeff{"color":{}}'], 'source.json')
  await state.pickFile(file)
  state.updateSource('sourceName', 'Original source')
  state.allowInvalid.value = true
  vi.mocked(api.import).mockRejectedValueOnce(new ApiError('timeout', 0))
  state.save()
  await flushPromises()
  expect(state.unknown.value).toBe(true)
  expect(state.file.value).toBe(file)
  state.updateSource('sourceName', 'Changed source')
  await state.pickFile(new File(['{}'], 'changed.json'))
  vi.mocked(api.import).mockResolvedValueOnce({ id: 'pack1', status: 'missing', package: null })
  state.retry()
  await flushPromises()
  const first = vi.mocked(api.import).mock.calls[0]!,
    second = vi.mocked(api.import).mock.calls[1]!
  expect(second.slice(0, 5)).toEqual(first.slice(0, 5))
  expect(second[1]).toBe(file)
  expect(second[2].sourceName).toBe('Original source')
  expect(second[3]).toBe(true)
  expect(state.unknown.value).toBe(false)
  expect(state.notice.value).toContain('未重新创建')
  expect(state.file.value).toBeUndefined()
})
it('blocks invalid import without explicit acknowledgement and leaves fatal validation correctable', async () => {
  const { state } = await render()
  state.startImport()
  vi.mocked(api.validate).mockRejectedValueOnce(
    new ApiError('Invalid JSON at line 2 column 3', 400),
  )
  await state.pickFile(new File(['bad'], 'bad.json'))
  state.save()
  expect(api.import).not.toHaveBeenCalled()
  expect(state.error.value).toContain('line 2 column 3')
  const invalid = tokenDocument()
  invalid.valid = false
  vi.mocked(api.validate).mockResolvedValue(invalid)
  await state.pickFile(new File(['{}'], 'invalid.json'))
  state.save()
  expect(api.import).not.toHaveBeenCalled()
  state.allowInvalid.value = true
  state.save()
  await flushPromises()
  expect(api.import).toHaveBeenCalledOnce()
})
it('treats the known 409 package cap as a correctable rejection while preserving the import draft', async () => {
  const { state } = await render()
  state.startImport()
  const file = new File(['{}'], 'keep-for-later.json')
  await state.pickFile(file)
  const preview = state.preview.value
  state.updateSource('sourceNotes', 'Keep this source too')
  const message =
    'This revision already contains 100 token packages. Remove a package before importing another.'
  vi.mocked(api.import).mockRejectedValueOnce(
    new ApiError(message, 409, 'PROTOTYPE_HUB_TOKEN_PACKAGE_LIMIT_REACHED'),
  )
  state.save()
  await flushPromises()
  expect(state.error.value).toBe(message)
  expect(state.conflict.value).toBe(false)
  expect(state.unknown.value).toBe(false)
  expect(state.locked.value).toBe(false)
  expect(state.file.value).toBe(file)
  expect(state.preview.value).toBe(preview)
  expect(state.source.sourceNotes).toBe('Keep this source too')
  state.retry()
  await flushPromises()
  expect(api.import).toHaveBeenCalledOnce()
  state.save()
  await flushPromises()
  expect(api.import).toHaveBeenCalledTimes(2)
  expect(vi.mocked(api.import).mock.calls[1]![4]).not.toBe(vi.mocked(api.import).mock.calls[0]![4])
})
it('preserves source draft on CAS conflict, compares latest and saves only after explicit rebase', async () => {
  const { state } = await render()
  await state.show(tokenPackage)
  state.editSource()
  state.updateSource('sourceNotes', 'My draft')
  vi.mocked(api.update).mockRejectedValueOnce(
    new ApiError('conflict', 409, 'PROTOTYPE_HUB_TOKEN_PACKAGE_CONFLICT'),
  )
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  expect(state.source.sourceNotes).toBe('My draft')
  const latest = { ...tokenPackage, sourceNotes: 'Their draft', configVersion: 4 }
  vi.mocked(api.get).mockResolvedValueOnce(latest)
  await state.readCurrent()
  expect(state.serverRecord.value?.sourceNotes).toBe('Their draft')
  state.resolveConflict(true)
  expect(state.source.sourceNotes).toBe('My draft')
  expect(api.update).toHaveBeenCalledOnce()
  vi.mocked(api.update).mockResolvedValueOnce({
    ...latest,
    sourceNotes: 'My draft',
    configVersion: 5,
  })
  state.save()
  await flushPromises()
  expect(vi.mocked(api.update).mock.calls[1]![3].expectedVersion).toBe(4)
  expect(vi.mocked(api.update).mock.calls[1]![3].clientRequestId).not.toBe(
    vi.mocked(api.update).mock.calls[0]![3].clientRequestId,
  )
})
it('does not leak late reads or retain files after actor/credential/permission changes', async () => {
  const { state, scope, write } = await render()
  let resolve!: (value: typeof tokenPackage) => void
  vi.mocked(api.get).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const reading = state.show(tokenPackage)
  scope.value = { ...structuredClone(tokenScope), actorId: 'u2' }
  resolve(tokenPackage)
  await reading
  expect(state.selected.value).toBeUndefined()
  state.startImport()
  await state.pickFile(new File(['{}'], 'tokens.json'))
  write.value = false
  await flushPromises()
  expect(state.file.value).toBeUndefined()
  expect(state.canEdit.value).toBe(false)
  state.startImport()
  expect(state.mode.value).toBe('browse')
  token.set('different-credential')
  window.dispatchEvent(new Event('focus'))
  expect(state.denied.value).toBe(true)
  expect(state.rows.value).toBeUndefined()
})
it.each(['import', 'source'] as const)(
  'preserves the %s draft when an earlier package metadata read completes late',
  async (mode) => {
    const { state } = await render()
    await state.show(tokenPackage)
    let resolve!: (value: typeof tokenPackage) => void
    vi.mocked(api.get).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const reading = state.show({ ...tokenPackage, id: 'next-package' })
    const signal = vi.mocked(api.get).mock.calls.at(-1)![2]!.signal!
    const file = new File(['{}'], 'my-new-tokens.json')
    if (mode === 'import') {
      state.startImport()
      await state.pickFile(file)
    } else state.editSource()
    state.updateSource('sourceNotes', 'Keep my unsaved draft')
    resolve({ ...tokenPackage, id: 'next-package', sourceNotes: 'Late server source' })
    expect(await reading).toBe(false)
    expect(signal.aborted).toBe(true)
    expect(state.mode.value).toBe(mode)
    expect(state.source.sourceNotes).toBe('Keep my unsaved draft')
    expect(state.selected.value?.id).toBe(tokenPackage.id)
    if (mode === 'import') {
      expect(state.file.value).toBe(file)
      expect(state.preview.value).toBeDefined()
    }
  },
)
it('keeps an import draft and ignores the late document result after metadata has loaded', async () => {
  const { state } = await render()
  let resolve!: (value: ReturnType<typeof tokenDocument>) => void
  vi.mocked(api.document).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const reading = state.show(tokenPackage)
  await flushPromises()
  const signal = vi.mocked(api.document).mock.calls.at(-1)![3]!.signal!
  state.startImport()
  const file = new File(['{}'], 'new-package.json')
  await state.pickFile(file)
  state.updateSource('sourceName', 'New unsaved package')
  resolve(tokenDocument())
  expect(await reading).toBe(false)
  expect(signal.aborted).toBe(true)
  expect(state.mode.value).toBe('import')
  expect(state.file.value).toBe(file)
  expect(state.source.sourceName).toBe('New unsaved package')
  expect(state.document.value).toBeUndefined()
})
it('uses real returned resolver inputs and obtains a separate chosen-view report', async () => {
  const { state } = await render()
  const initial = tokenDocument()
  initial.format = 'resolver'
  initial.valid = false
  initial.inputs = Object.fromEntries([
    ['__proto__', 'night'],
    ['density', 'compact'],
  ])
  initial.modifiers = [
    { name: '__proto__', description: null, contexts: ['day', 'night'], defaultContext: 'day' },
  ]
  const chosen = { ...initial, valid: true }
  vi.mocked(api.document).mockResolvedValueOnce(initial).mockResolvedValueOnce(chosen)
  await state.show(tokenPackage)
  expect(vi.mocked(api.document).mock.calls[0]![2]).toBeUndefined()
  expect(vi.mocked(api.document).mock.calls[1]![2]).toEqual(initial.inputs)
  expect(state.document.value?.valid).toBe(true)
  expect(Object.hasOwn(state.document.value!.inputs, '__proto__')).toBe(true)
})
it('intersects project READ/EDIT with member action permissions', async () => {
  const { state, scope } = await render()
  scope.value!.project.capabilities.edit = false
  await flushPromises()
  expect(state.canEdit.value).toBe(false)
  state.startImport()
  await state.pickFile(new File(['{}'], 'tokens.json'))
  state.save()
  expect(api.validate).not.toHaveBeenCalled()
  expect(api.import).not.toHaveBeenCalled()
  vi.mocked(api.query).mockClear()
  scope.value!.project.capabilities.read = false
  await flushPromises()
  await state.load()
  expect(api.query).not.toHaveBeenCalled()
  expect(state.rows.value).toBeUndefined()
})
it('retries deletion with the original CAS and request identifier', async () => {
  const { state } = await render()
  await state.show(tokenPackage)
  vi.mocked(api.remove).mockRejectedValueOnce(new ApiError('timeout'))
  state.remove()
  await flushPromises()
  state.retry()
  await flushPromises()
  expect(vi.mocked(api.remove).mock.calls[1]!.slice(0, 3)).toEqual(
    vi.mocked(api.remove).mock.calls[0]!.slice(0, 3),
  )
  expect(state.selected.value).toBeUndefined()
})
