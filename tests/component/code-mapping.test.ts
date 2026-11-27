import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { useCodeMappings } from '@/modules/protohub-manager-ui/hooks/useCodeMappings'
import { codeMappingApi as api } from '@/modules/protohub-manager-ui/api/code-mapping'
import { functionalSpecApi } from '@/modules/protohub-manager-ui/api/functional-spec'
import {
  emptyCodeMapping,
  codeMappingDraft,
  codeMappingText,
  parseCodeMappingPackage,
} from '@/modules/protohub-manager-ui/utils/code-mapping'
import type {
  CodeMappingDraft,
  CodeMappingCard,
  CodeMappingScope,
} from '@/modules/protohub-manager-ui/types/code-mapping'
import { token } from '@/shared/auth/token'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'

vi.mock('@/modules/protohub-manager-ui/api/code-mapping', () => ({
  codeMappingApi: {
    query: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    export: vi.fn(),
    import: vi.fn(),
  },
}))
vi.mock('@/modules/protohub-manager-ui/api/functional-spec', () => ({
  functionalSpecApi: { query: vi.fn(), get: vi.fn() },
}))
const wrappers: VueWrapper[] = []
const scopeValue: CodeMappingScope = {
  actorId: 'u1',
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
  revision: {
    id: 'fixed',
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 2,
    totalBytes: 200,
    createdBy: 'u1',
    createdAt: 1,
  },
  context: {
    revisionId: 'fixed',
    title: 'Project',
    versionName: 'V1',
    runtimeBaseUrl: '/runtime/fixed',
    entryFile: 'index.html',
    pages: [
      {
        pageId: 'folder',
        name: 'Folder',
        folder: true,
        children: [
          {
            pageId: 'home',
            name: 'Home',
            path: 'index.html',
            children: [{ pageId: 'child', name: 'Child', path: 'child.html' }],
          },
        ],
      },
    ],
  },
}
const row: CodeMappingCard = {
  ...emptyCodeMapping(),
  id: 'card1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'fixed',
  pageId: 'home',
  description: null,
  alias: 'UserCard',
  repositoryPath: 'src/components/UserCard.vue',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
}
function responseDraft(input: CodeMappingDraft) {
  return {
    ...codeMappingText(input),
    description: input.description
      ? {
          ...input.description,
          status: 'current' as const,
          currentVersion: input.description.expectedVersion,
          title: 'Source',
        }
      : null,
  }
}
const paged = <T>(data: T[] = []) => ({ data, total: data.length, pageIndex: 0, pageSize: 20 })
const pack = (cards = [codeMappingText(row)]) =>
  JSON.stringify({ format: 'prototype-hub-code-mapping-cards', schemaVersion: 1, cards })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function file(text: string) {
  const result = new File([text], 'cards.json', { type: 'application/json' })
  Object.defineProperty(result, 'text', { configurable: true, value: () => Promise.resolve(text) })
  return result
}

beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.mocked(api.query).mockResolvedValue(paged([structuredClone(row)]))
  vi.mocked(api.get).mockResolvedValue(structuredClone(row))
  vi.mocked(api.create).mockImplementation(async (_target, input) => ({
    ...row,
    ...responseDraft(input),
  }))
  vi.mocked(api.update).mockImplementation(async (_target, _id, input) => ({
    ...row,
    ...responseDraft(input),
    configVersion: input.expectedVersion + 1,
  }))
  vi.mocked(api.remove).mockResolvedValue(true)
  vi.mocked(api.import).mockImplementation(async (_target, input) => ({
    items: input.cards.map((card, index) => ({
      id: `import-${index}`,
      status: 'current',
      card: { ...row, ...responseDraft(card), id: `import-${index}` },
    })),
  }))
  vi.mocked(functionalSpecApi.query).mockResolvedValue(paged())
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function render() {
  const scope = ref<CodeMappingScope | undefined>(structuredClone(scopeValue)),
    read = ref(true),
    write = ref(true)
  let state!: ReturnType<typeof useCodeMappings>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useCodeMappings(scope)
      }),
      {
        global: {
          provide: {
            [permissionKey as symbol]: {
              can: (value: string) => (value.endsWith(':query') ? read.value : write.value),
            },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, scope, read, write }
}
it('parses only the portable seven-text schema and preserves code whitespace verbatim', () => {
  const snippet = '  <script>window.bad = true</script>\n\timport("private-code")\r\n'
  const text = pack([
    { ...codeMappingText(row), snippet, repositoryUrl: 'https://example.test/repo' },
  ])
  const parsed = parseCodeMappingPackage(text)
  expect(parsed.issues).toEqual([])
  expect(parsed.value?.cards[0]?.snippet).toBe(snippet)
  for (const extra of ['description', 'id', 'projectId', 'anchor', '__proto__', 'constructor']) {
    const raw = JSON.parse(text)
    raw.cards[0][extra] = extra === '__proto__' ? { polluted: true } : 'private'
    const source =
      extra === '__proto__'
        ? text.replace('"alias":', '"__proto__":{"polluted":true},"alias":')
        : JSON.stringify(raw)
    expect(parseCodeMappingPackage(source).value).toBeUndefined()
  }
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  expect(
    parseCodeMappingPackage(text.replace('"schemaVersion":1', '"schemaVersion":"1"')).value,
  ).toBeUndefined()
  expect(
    parseCodeMappingPackage(pack([{ ...codeMappingText(row), alias: true as unknown as string }]))
      .issues[0]?.field,
  ).toBe('alias')
})
it('enforces text, link, count and UTF8 limits before any write', () => {
  for (const repositoryUrl of [
    'javascript:alert(1)',
    'https://user:secret@example.test/',
    'https://example.test/\npath',
    'https://example.test\\@evil.test/',
    'file:///private/repo',
  ])
    expect(
      parseCodeMappingPackage(pack([{ ...codeMappingText(row), repositoryUrl }])).issues[0]?.reason,
    ).toBe('url')
  expect(
    parseCodeMappingPackage(pack([{ ...codeMappingText(row), repositoryPath: '\u2002\uFEFF' }]))
      .issues[0]?.reason,
  ).toBe('required')
  expect(
    parseCodeMappingPackage(pack([{ ...codeMappingText(row), snippet: '\0' }])).value,
  ).toBeUndefined()
  expect(parseCodeMappingPackage(pack([])).issues[0]?.reason).toBe('count')
  expect(
    parseCodeMappingPackage(pack(Array.from({ length: 51 }, () => codeMappingText(row)))).issues[0]
      ?.reason,
  ).toBe('count')
  expect(parseCodeMappingPackage('中'.repeat(349526)).issues[0]?.reason).toBe('size')
})
it('projects resolved descriptions and identities out of the complete write', () => {
  const input = {
    ...row,
    description: {
      id: 'spec',
      expectedVersion: 1,
      status: 'changed' as const,
      currentVersion: 2,
      title: 'Updated',
    },
  }
  const draft = codeMappingDraft(input)
  expect(Object.keys(draft).sort()).toEqual([...Object.keys(emptyCodeMapping())].sort())
  expect(draft.description).toEqual({ id: 'spec', expectedVersion: 1 })
  expect(codeMappingText(input)).not.toHaveProperty('description')
  expect(input.description).toHaveProperty('status', 'changed')
})
it('uses exact fixed scope, keeps content parent pages and saves literal code', async () => {
  const { state } = await render()
  expect(state.pages.value.map((page) => page.pageId)).toEqual(['home', 'child'])
  state.edit()
  Object.assign(state.form, {
    alias: '  UserCard  ',
    repositoryPath: 'src/User.vue',
    snippet: '  <script>literal</script>\n',
  })
  state.save()
  await flushPromises()
  expect(api.create).toHaveBeenCalledWith(
    { versionId: 'v1', revisionId: 'fixed', pageId: 'home' },
    expect.objectContaining({
      alias: '  UserCard  ',
      snippet: '  <script>literal</script>\n',
      description: null,
    }),
    expect.any(Object),
  )
  expect(state.selected.value?.alias).toBe('  UserCard  ')
  state.selectPage('child')
  await flushPromises()
  expect(state.selected.value).toBeUndefined()
  expect(api.query).toHaveBeenLastCalledWith(
    { versionId: 'v1', revisionId: 'fixed', pageId: 'child' },
    expect.any(Object),
    expect.any(Object),
  )
})
it('finishes a successful File preview and permits explicit atomic import', async () => {
  const { state } = await render()
  state.startImport()
  await state.readFile(file(pack()))
  await flushPromises()
  expect(state.fileReading.value).toBe(false)
  expect(state.importCards.value).toHaveLength(1)
  expect(api.import).not.toHaveBeenCalled()
  state.importAll()
  await flushPromises()
  expect(api.import).toHaveBeenCalledWith(
    { versionId: 'v1', revisionId: 'fixed', pageId: 'home' },
    expect.objectContaining({
      format: 'prototype-hub-code-mapping-cards',
      schemaVersion: 1,
      cards: [{ ...codeMappingText(row), description: null }],
    }),
    expect.any(Object),
  )
  expect(state.importResult.value?.items).toHaveLength(1)
  state.importAll()
  await flushPromises()
  expect(api.import).toHaveBeenCalledTimes(1)
})
it('ignores late File contents after actor changes and after newer pasted content', async () => {
  const { state, scope } = await render()
  state.startImport()
  const late = deferred<string>(),
    first = file(pack())
  Object.defineProperty(first, 'text', { value: () => late.promise })
  const pending = state.readFile(first)
  state.updateImportText(pack([{ ...codeMappingText(row), alias: 'New input' }]))
  late.resolve(pack())
  await pending
  expect(state.importText.value).toContain('New input')
  state.previewImport()
  expect(state.importCards.value[0]?.alias).toBe('New input')
  const secondLate = deferred<string>(),
    second = file(pack())
  Object.defineProperty(second, 'text', { value: () => secondLate.promise })
  const secondPending = state.readFile(second)
  scope.value = { ...structuredClone(scopeValue), actorId: 'u2' }
  await flushPromises()
  secondLate.resolve(pack())
  await secondPending
  expect(state.importCards.value).toEqual([])
  expect(state.importText.value).toBe('')
})
it('retains the original payload and key when a mutation result is unknown', async () => {
  const { state } = await render()
  vi.mocked(api.create).mockRejectedValueOnce(new ApiError('lost response', 503))
  state.edit()
  Object.assign(state.form, {
    alias: 'Original',
    repositoryPath: 'src/original.vue',
    snippet: '  keep\n',
  })
  state.save()
  await flushPromises()
  const sent = structuredClone(vi.mocked(api.create).mock.calls[0]![1])
  expect(state.unknown.value).toBe(true)
  expect(state.locked.value).toBe(true)
  state.form.alias = 'Must not replace pending payload'
  state.save()
  expect(api.create).toHaveBeenCalledTimes(1)
  state.retry()
  await flushPromises()
  expect(vi.mocked(api.create).mock.calls[1]![1]).toEqual(sent)
  expect(state.unknown.value).toBe(false)
})
it('compares a CAS conflict without replacing the draft until explicitly chosen', async () => {
  const { state } = await render()
  vi.mocked(api.update).mockRejectedValueOnce(new ApiError('concurrent change', 409))
  vi.mocked(api.get).mockResolvedValue({
    ...row,
    alias: 'Server alias',
    snippet: 'server',
    configVersion: 3,
  })
  state.edit(row)
  state.form.snippet = '  my draft\n'
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  await state.readCurrent()
  expect(state.form.snippet).toBe('  my draft\n')
  expect(state.serverRecord.value?.snippet).toBe('server')
  state.resolveConflict(true)
  expect(state.form.snippet).toBe('  my draft\n')
  expect(state.original.value?.configVersion).toBe(3)
  state.save()
  await flushPromises()
  expect(vi.mocked(api.update).mock.calls[1]![2]).toMatchObject({
    expectedVersion: 3,
    snippet: '  my draft\n',
  })
})
it('keeps changed or missing description pointers during independent edits', async () => {
  const { state } = await render()
  const linked = {
    ...row,
    description: {
      id: 'removed-spec',
      expectedVersion: 2,
      status: 'missing' as const,
      currentVersion: null,
      title: null,
    },
  }
  vi.mocked(api.update).mockResolvedValue({ ...linked, alias: 'Renamed', configVersion: 1 })
  state.edit(linked)
  state.form.alias = 'Renamed'
  state.save()
  await flushPromises()
  expect(vi.mocked(api.update).mock.calls[0]![2].description).toEqual({
    id: 'removed-spec',
    expectedVersion: 2,
  })
})
it('shows only ordered import receipts, including cards deleted after the original import', async () => {
  const { state } = await render()
  state.startImport()
  state.updateImportText(pack([codeMappingText(row), { ...codeMappingText(row), alias: 'Second' }]))
  state.previewImport()
  vi.mocked(api.import)
    .mockRejectedValueOnce(new ApiError('lost', 503))
    .mockResolvedValueOnce({
      items: [
        { id: 'first', status: 'missing', card: null },
        {
          id: 'second',
          status: 'current',
          card: { ...row, id: 'second', alias: 'Edited after import' },
        },
      ],
    })
  state.importAll()
  await flushPromises()
  expect(state.unknown.value).toBe(true)
  state.retry()
  await flushPromises()
  expect(state.importResult.value?.items.map((item) => item.id)).toEqual(['first', 'second'])
  expect(state.importResult.value?.items[0]?.card).toBeNull()
  expect(vi.mocked(api.import).mock.calls[1]![1]).toEqual(vi.mocked(api.import).mock.calls[0]![1])
})
it('clears private code and draft contents when query or edit access changes', async () => {
  const { state, read, write } = await render()
  state.edit(row)
  state.form.snippet = 'private draft'
  write.value = false
  await flushPromises()
  expect(state.canEdit.value).toBe(false)
  expect(state.form.snippet).toBe('')
  state.save()
  expect(api.update).not.toHaveBeenCalled()
  read.value = false
  await flushPromises()
  expect(state.rows.value).toBeUndefined()
  expect(state.selected.value).toBeUndefined()
})
it('ignores a late detail response after switching fixed pages', async () => {
  const { state } = await render(),
    late = deferred<CodeMappingCard>()
  vi.mocked(api.get).mockReturnValueOnce(late.promise)
  const pending = state.show(row)
  vi.mocked(api.query).mockResolvedValueOnce(paged())
  state.selectPage('child')
  late.resolve(row)
  await pending
  expect(state.pageId.value).toBe('child')
  expect(state.selected.value).toBeUndefined()
})

it('drops unknown retry and sensitive fields on credential change', async () => {
  const { state } = await render()
  vi.mocked(api.create).mockRejectedValueOnce(new ApiError('lost', 503))
  state.edit()
  Object.assign(state.form, { alias: 'Private', repositoryPath: 'private/path' })
  state.save()
  await flushPromises()
  expect(state.unknown.value).toBe(true)
  token.set('different-fixture-credential')
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(state.denied.value).toBe(true)
  expect(state.form.repositoryPath).toBe('')
  expect(state.rows.value).toBeUndefined()
  state.retry()
  expect(api.create).toHaveBeenCalledTimes(1)
  token.clear()
})
it('does not turn an idempotency conflict into a new create or import request', async () => {
  const { state } = await render()
  vi.mocked(api.create).mockRejectedValueOnce(
    new ApiError('deleted original', 409, 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT'),
  )
  state.edit()
  Object.assign(state.form, { alias: 'Keep', repositoryPath: 'src/Keep.vue' })
  state.save()
  await flushPromises()
  expect(state.conflict.value).toBe(true)
  state.reviseRejected()
  state.save()
  state.retry()
  await flushPromises()
  expect(api.create).toHaveBeenCalledTimes(1)
  expect(state.form.alias).toBe('Keep')
})

it('retains chosen target source titles across candidate pagination and clears them on scope change', async () => {
  const { state, scope } = await render()
  state.startImport()
  state.updateImportText(pack([codeMappingText(row), codeMappingText(row)]))
  state.previewImport()
  const description = {
    id: 'spec-a',
    projectId: 'p1',
    versionId: 'v1',
    revisionId: 'fixed',
    pageId: 'home',
    configVersion: 0,
    createdAt: 1,
    updatedAt: 1,
    title: 'First description',
    purpose: '',
    inputRules: '',
    permissionRules: '',
    navigationRules: '',
    notes: '',
    anchor: null,
  }
  vi.mocked(functionalSpecApi.query).mockResolvedValueOnce(paged([description]))
  await state.loadDescriptions(0)
  state.chooseDescription('spec-a', 0)
  vi.mocked(functionalSpecApi.query).mockResolvedValueOnce(
    paged([{ ...description, id: 'spec-b', title: 'Second description' }]),
  )
  await state.loadDescriptions(1)
  state.chooseDescription('spec-b', 1)
  expect(state.descriptionLabels.value.get('spec-a')).toBe('First description')
  expect(state.descriptionLabels.value.get('spec-b')).toBe('Second description')
  expect(state.importCards.value.map((card) => card.description?.id)).toEqual(['spec-a', 'spec-b'])
  scope.value = { ...structuredClone(scopeValue), actorId: 'u2' }
  await flushPromises()
  expect(state.descriptionLabels.value.size).toBe(0)
})

for (const nextMode of ['edit', 'import'] as const)
  it(`ignores a deferred card GET after entering ${nextMode}`, async () => {
    const { state } = await render(),
      late = deferred<CodeMappingCard>()
    vi.mocked(api.get).mockReturnValueOnce(late.promise)
    const reading = state.show(row)
    if (nextMode === 'edit') {
      state.edit()
      state.form.alias = 'Fresh draft'
      state.form.repositoryPath = 'src/Fresh.vue'
    } else {
      state.startImport()
      state.updateImportText(pack([{ ...codeMappingText(row), alias: 'Fresh import' }]))
      state.previewImport()
    }
    late.resolve(row)
    expect(await reading).toBe(false)
    expect(state.mode.value).toBe(nextMode)
    if (nextMode === 'edit') expect(state.form.alias).toBe('Fresh draft')
    else expect(state.importCards.value[0]?.alias).toBe('Fresh import')
    expect(state.dirty.value).toBe(true)
    expect(state.selected.value).toBeUndefined()
  })
it('ignores a deferred F27 detail after entering another editor', async () => {
  const { state } = await render()
  const detail = {
    id: 'spec',
    projectId: 'p1',
    versionId: 'v1',
    revisionId: 'fixed',
    pageId: 'home',
    configVersion: 0,
    createdAt: 1,
    updatedAt: 1,
    title: 'Old description',
    purpose: '',
    inputRules: '',
    permissionRules: '',
    navigationRules: '',
    notes: '',
    anchor: null,
  }
  const late = deferred<typeof detail>()
  vi.mocked(functionalSpecApi.get).mockReturnValueOnce(late.promise)
  const reading = state.readDescription({ id: 'spec', expectedVersion: 0 })
  state.edit(row)
  state.form.snippet = 'New independent draft'
  late.resolve(detail)
  expect(await reading).toBe(false)
  expect(state.descriptionDetail.value).toBeUndefined()
  expect(state.form.snippet).toBe('New independent draft')
})
it('does not apply an old server comparison to a newer pending conflict', async () => {
  const { state } = await render(),
    late = deferred<CodeMappingCard>()
  vi.mocked(api.update).mockRejectedValue(new ApiError('conflict', 409))
  state.edit(row)
  state.form.alias = 'First draft'
  state.save()
  await flushPromises()
  vi.mocked(api.get).mockReturnValueOnce(late.promise)
  const reading = state.readCurrent()
  state.clearEditor()
  state.edit({ ...row, id: 'other-card' })
  state.form.alias = 'Second draft'
  state.save()
  await flushPromises()
  late.resolve({ ...row, alias: 'Old server value', configVersion: 1 })
  await reading
  expect(state.serverRecord.value).toBeUndefined()
  expect(state.form.alias).toBe('Second draft')
  expect(state.original.value?.id).toBe('other-card')
})
