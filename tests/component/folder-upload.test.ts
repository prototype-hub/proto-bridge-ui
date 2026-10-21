import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { useUpload } from '@/modules/protohub-manager-ui/views/project/hooks/useUpload'
import {
  FolderArchiveError,
  prepareFolderArchive,
  type FolderArchiveResult,
} from '@/modules/protohub-manager-ui/utils/folder-archive'
import type { UploadContext, Version } from '@/modules/protohub-manager-ui/types'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
vi.mock('ant-design-vue', () => ({ message: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/modules/protohub-manager-ui/utils/folder-archive', () => ({
  prepareFolderArchive: vi.fn(),
  FolderArchiveError: class extends Error {
    constructor(public code: string) {
      super(code)
    }
  },
}))
const wrappers: VueWrapper[] = []
const source = [new File(['<html>中文</html>'], 'index.html')]
const zip = new File(['packed ZIP'], '中文原型.zip', { type: 'application/zip' })
const packed: FolderArchiveResult = {
  file: zip,
  rootName: '中文原型',
  fileCount: 4,
  totalBytes: 100,
}
const version: Version = {
  id: 'v1',
  projectId: 'p1',
  versionName: 'V1',
  status: 'ready',
  entryFile: 'index.html',
  createdBy: 'admin',
  createdAt: 1,
  runtimeBaseUrl: '/runtime',
  previewUrl: '/runtime/index.html',
}

/** Deferred results let lifecycle tests deliver callbacks after cancellation deliberately. */
function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function render(targetVersion?: Version) {
  const open = ref(false)
  const context = ref<UploadContext>({ projectId: 'p1', version: targetVersion })
  const done = vi.fn()
  const close = vi.fn(() => {
    open.value = false
  })
  let state!: ReturnType<typeof useUpload>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useUpload(open, context, done, close)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  open.value = true
  await nextTick()
  state.form.versionName = 'V2'
  return { state, open, context, done, close, wrapper }
}
function key(index: number) {
  return (vi.mocked(request.post).mock.calls[index]?.[2]?.headers as Record<string, string>)[
    'Idempotency-Key'
  ]
}
beforeEach(() => {
  vi.mocked(prepareFolderArchive).mockReset().mockResolvedValue(packed)
  vi.mocked(request.post)
    .mockReset()
    .mockResolvedValue({ success: true, status: 200, result: version })
  vi.mocked(request.put)
    .mockReset()
    .mockResolvedValue({ success: true, status: 200, result: version })
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

it('prepares a folder locally, keeps packing progress separate and waits for an explicit save', async () => {
  const work = pending<FolderArchiveResult>()
  vi.mocked(prepareFolderArchive).mockReturnValue(work.promise)
  const { state } = await render()
  const preparation = state.chooseFolder(source)
  expect(state.phase.value).toBe('packing')
  expect(state.task.busy.value).toBe(true)
  vi.mocked(prepareFolderArchive).mock.calls[0]![1]!.onProgress!({ phase: 'packing', percent: 63 })
  expect(state.packingProgress.value).toEqual({ phase: 'packing', percent: 63 })
  expect(state.progress.value).toBe(0)
  await state.submit()
  expect(request.post).not.toHaveBeenCalled()
  work.resolve(packed)
  await preparation
  expect(state.file.value).toBe(zip)
  expect(state.folder.value).toEqual({ rootName: '中文原型', fileCount: 4, totalBytes: 100 })
  expect(state.task.busy.value).toBe(false)
  expect(request.post).not.toHaveBeenCalled()
  await state.submit()
  expect(request.post).toHaveBeenCalledOnce()
  const body = vi.mocked(request.post).mock.calls[0]![1] as FormData
  expect(body.get('versionName')).toBe('V2')
  expect(body.get('file')).toBe(zip)
})

it('keeps an existing valid selection when the native folder picker is cancelled', async () => {
  const { state } = await render()
  state.choose(zip)
  await state.chooseFolder([])
  expect(state.file.value).toBe(zip)
  expect(prepareFolderArchive).not.toHaveBeenCalled()
})

it.each(['invalidPath', 'tooManyFiles', 'tooLarge', 'noHtml', 'unsupported', 'failed'] as const)(
  'invalidates the previous selection on %s and allows ZIP fallback',
  async (code) => {
    const { state } = await render()
    state.choose(zip)
    vi.mocked(prepareFolderArchive).mockRejectedValue(new FolderArchiveError(code))
    await state.chooseFolder(source)
    expect(state.file.value).toBeUndefined()
    expect(state.task.error.value).toBe(protoLocales.zh.folderErrors[code])
    await state.submit()
    expect(request.post).not.toHaveBeenCalled()
    state.choose(zip)
    expect(state.task.error.value).toBe('')
    await state.submit()
    expect(request.post).toHaveBeenCalledOnce()
  },
)

it('cancels packing without an API call and ignores late progress or success', async () => {
  const work = pending<FolderArchiveResult>()
  vi.mocked(prepareFolderArchive).mockReturnValue(work.promise)
  const { state, open } = await render()
  const preparation = state.chooseFolder(source)
  const options = vi.mocked(prepareFolderArchive).mock.calls[0]![1]!
  state.cancelPacking()
  expect(options.signal!.aborted).toBe(true)
  expect(open.value).toBe(true)
  expect(state.task.busy.value).toBe(false)
  options.onProgress!({ phase: 'packing', percent: 99 })
  work.resolve(packed)
  await preparation
  expect(state.packingProgress.value.percent).toBe(0)
  expect(state.file.value).toBeUndefined()
  expect(request.post).not.toHaveBeenCalled()
})

it('does not start a second preparation or accept a ZIP while packing', async () => {
  const work = pending<FolderArchiveResult>()
  vi.mocked(prepareFolderArchive).mockReturnValue(work.promise)
  const { state } = await render()
  const preparation = state.chooseFolder(source)
  await state.chooseFolder(source)
  state.choose(zip)
  expect(prepareFolderArchive).toHaveBeenCalledOnce()
  expect(state.file.value).toBeUndefined()
  state.cancelPacking()
  work.resolve(packed)
  await preparation
})

it('keeps the generated ZIP and key for manual retry after an unknown POST result', async () => {
  vi.mocked(request.post).mockRejectedValue(new ApiError('network interrupted'))
  const { state, done } = await render()
  await state.chooseFolder(source)
  await state.submit()
  const first = key(0)
  expect(state.outcomeUnknown.value).toBe(true)
  expect(request.post).toHaveBeenCalledOnce()
  expect(done).not.toHaveBeenCalled()
  expect(state.file.value).toBe(zip)
  await flushPromises()
  expect(request.post).toHaveBeenCalledOnce()
  await state.submit()
  expect(key(1)).toBe(first)
  expect(prepareFolderArchive).toHaveBeenCalledOnce()
  state.form.description = 'different details'
  await state.submit()
  expect(key(2)).not.toBe(first)
})

it('replaces the selected version using PUT without creating a new version', async () => {
  const { state, done } = await render(version)
  await state.chooseFolder(source)
  await state.submit()
  expect(request.post).not.toHaveBeenCalled()
  expect(vi.mocked(request.put).mock.calls[0]![0]).toBe('/prototype-hub/versions/v1')
  expect(vi.mocked(request.put).mock.calls[0]![2]?.headers).toBeUndefined()
  expect(done).toHaveBeenCalledOnce()
})

it('ignores an old upload after reopening and does not clear a new upload busy state', async () => {
  const old = pending<{ success: boolean; status: number; result: Version }>()
  const fresh = pending<{ success: boolean; status: number; result: Version }>()
  vi.mocked(request.post).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  const { state, open, done, close } = await render()
  state.choose(zip)
  const oldRequest = state.submit()
  const previousSignal = vi.mocked(request.post).mock.calls[0]![2]!.signal!
  state.cancel()
  await nextTick()
  expect(previousSignal.aborted).toBe(true)
  open.value = true
  await nextTick()
  state.choose(new File(['next'], 'next.zip'))
  const newRequest = state.submit()
  old.resolve({ success: true, status: 200, result: version })
  await oldRequest
  expect(done).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledTimes(1)
  expect(state.task.busy.value).toBe(true)
  fresh.resolve({ success: true, status: 200, result: version })
  await newRequest
  expect(done).toHaveBeenCalledOnce()
})

it('invalidates packing when the parent switches the project without closing', async () => {
  const work = pending<FolderArchiveResult>()
  vi.mocked(prepareFolderArchive).mockReturnValue(work.promise)
  const { state, context } = await render()
  const preparation = state.chooseFolder(source)
  const signal = vi.mocked(prepareFolderArchive).mock.calls[0]![1]!.signal!
  context.value = { projectId: 'p2', version: { ...version, id: 'v2', projectId: 'p2' } }
  await nextTick()
  expect(signal.aborted).toBe(true)
  expect(state.form.versionName).toBe('V1')
  work.resolve(packed)
  await preparation
  expect(state.file.value).toBeUndefined()
  expect(request.post).not.toHaveBeenCalled()
})

it('invalidates an upload when the target version changes and on scope disposal', async () => {
  const old = pending<{ success: boolean; status: number; result: Version }>()
  vi.mocked(request.put).mockReturnValue(old.promise)
  const { state, context, wrapper, done } = await render(version)
  state.choose(zip)
  const upload = state.submit()
  const signal = vi.mocked(request.put).mock.calls[0]![2]!.signal!
  context.value = { projectId: 'p1', version: { ...version, id: 'v2' } }
  await nextTick()
  expect(signal.aborted).toBe(true)
  wrapper.unmount()
  old.reject(new Error('late network error'))
  await upload
  expect(state.task.error.value).toBe('')
  expect(done).not.toHaveBeenCalled()
})
