import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareFolderArchive } from '@/modules/protohub-manager-ui/utils/folder-archive'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    FakeWorker.instances.push(this)
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

function files(): File[] {
  const file = new File(['entry'], 'index.html')
  Object.defineProperty(file, 'webkitRelativePath', { value: '原型 导出/index.html' })
  return [file]
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

it('returns a ZIP File and translated progress metadata, then releases its worker and listeners', async () => {
  const signal = new AbortController().signal
  const remove = vi.spyOn(signal, 'removeEventListener')
  const progress = vi.fn()
  const result = prepareFolderArchive(files(), { signal, onProgress: progress })
  const worker = FakeWorker.instances[0]!
  worker.reply({ type: 'progress', progress: { phase: 'reading', percent: 35 } })
  worker.reply({ type: 'complete', archive: new Blob(['zip'], { type: 'application/zip' }) })
  const archive = await result
  expect(archive.file.name).toBe('原型 导出.zip')
  expect(archive.file.type).toBe('application/zip')
  expect(archive.fileCount).toBe(1)
  expect(archive.totalBytes).toBe(5)
  expect(archive.rootName).toBe('原型 导出')
  expect(progress).toHaveBeenCalledWith({ phase: 'reading', percent: 35 })
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(worker.onmessage).toBeNull()
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
})

it('cancels immediately before validation/worker creation and terminates an active attempt', async () => {
  const already = new AbortController()
  already.abort()
  await expect(prepareFolderArchive([], { signal: already.signal })).rejects.toMatchObject({
    name: 'AbortError',
  })
  expect(FakeWorker.instances).toHaveLength(0)
  const controller = new AbortController()
  const result = prepareFolderArchive(files(), { signal: controller.signal })
  const worker = FakeWorker.instances[0]!
  const late = worker.onmessage!
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  late({ data: { type: 'complete', archive: new Blob(['late']) } } as MessageEvent)
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(worker.onmessage).toBeNull()
})

it.each(['error', 'messageerror', 'invalid', 'workerFailure', 'callbackFailure'])(
  'cleans up and rejects %s without retaining a partial archive',
  async (kind) => {
    const result = prepareFolderArchive(files(), {
      onProgress: () => {
        throw new Error('consumer failed')
      },
    })
    const worker = FakeWorker.instances[0]!
    if (kind === 'error') worker.onerror?.()
    else if (kind === 'messageerror') worker.onmessageerror?.()
    else if (kind === 'invalid') worker.reply({ type: 'complete', archive: 'not-blob' })
    else if (kind === 'workerFailure') worker.reply({ type: 'error', code: 'failed' })
    else worker.reply({ type: 'progress', progress: { phase: 'packing', percent: 5 } })
    await expect(result).rejects.toMatchObject({ code: 'failed' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onerror).toBeNull()
    expect(worker.onmessageerror).toBeNull()
  },
)

it('rejects synchronous structured clone failures and unsupported workers', async () => {
  class ThrowingPostWorker extends FakeWorker {
    postMessage = vi.fn(() => {
      throw new Error('clone failed')
    })
  }
  vi.stubGlobal('Worker', ThrowingPostWorker)
  await expect(prepareFolderArchive(files())).rejects.toMatchObject({ code: 'failed' })
  expect(FakeWorker.instances[0]?.terminate).toHaveBeenCalledOnce()
  vi.stubGlobal('Worker', undefined)
  await expect(prepareFolderArchive(files())).rejects.toMatchObject({ code: 'unsupported' })
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('unsupported module worker')
      }
    },
  )
  await expect(prepareFolderArchive(files())).rejects.toMatchObject({ code: 'unsupported' })
})

it('rejects invalid selections before allocating a worker or posting files', async () => {
  await expect(prepareFolderArchive([new File(['entry'], 'index.html')])).rejects.toMatchObject({
    code: 'unsupported',
  })
  expect(FakeWorker.instances).toHaveLength(0)
})

it('rejects File allocation failure after completion and still releases the worker', async () => {
  const selected = files()
  vi.stubGlobal(
    'File',
    class {
      constructor() {
        throw new Error('allocation failed')
      }
    },
  )
  const result = prepareFolderArchive(selected)
  const worker = FakeWorker.instances[0]!
  worker.reply({ type: 'complete', archive: new Blob(['zip']) })
  await expect(result).rejects.toMatchObject({ code: 'failed' })
  expect(worker.terminate).toHaveBeenCalledOnce()
})
