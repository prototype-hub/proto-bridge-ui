import { buildFolderManifest, FolderArchiveError, type FolderManifest } from './folder-manifest'
import type { FolderArchiveProgress } from '../workers/folder-archive-pack'
import type { FolderWorkerResponse } from '../workers/folder-archive.worker'

export { FOLDER_LIMITS, FolderArchiveError } from './folder-manifest'
export type { FolderArchiveErrorCode } from './folder-manifest'
export type { FolderArchiveProgress } from '../workers/folder-archive-pack'

export interface FolderArchiveResult {
  file: File
  fileCount: number
  totalBytes: number
  rootName: string
}

/**
 * Build a local ZIP without uploading. Validation precedes byte reads; abort stops the owned worker,
 * including a synchronous compression chunk, and every outcome unregisters handlers and releases it.
 */
export async function prepareFolderArchive(
  files: readonly File[],
  options: {
    signal?: AbortSignal
    onProgress?: (progress: FolderArchiveProgress) => void
  } = {},
): Promise<FolderArchiveResult> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const manifest = buildFolderManifest(files)
  if (typeof Worker === 'undefined') throw new FolderArchiveError('unsupported')
  let worker: Worker
  try {
    worker = new Worker(new URL('../workers/folder-archive.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    throw new FolderArchiveError('unsupported')
  }
  return runWorker(worker, manifest, options)
}

/** Own one attempt's events; a late result after cancel cannot become the next dialog's upload. */
function runWorker(
  worker: Worker,
  manifest: FolderManifest,
  options: { signal?: AbortSignal; onProgress?: (progress: FolderArchiveProgress) => void },
): Promise<FolderArchiveResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, archive?: Blob) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      if (error || !archive) {
        reject(error ?? new FolderArchiveError('failed'))
        return
      }
      try {
        resolve({
          file: new File([archive], `${manifest.rootName}.zip`, {
            type: 'application/zip',
            lastModified: 946684800000,
          }),
          fileCount: manifest.entries.length,
          totalBytes: manifest.totalBytes,
          rootName: manifest.rootName,
        })
      } catch {
        reject(new FolderArchiveError('failed'))
      }
    }
    const abort = () => finish(new DOMException('Aborted', 'AbortError'))
    worker.onmessage = (event: MessageEvent<FolderWorkerResponse>) => {
      if (settled) return
      const message = event.data
      if (message?.type === 'complete' && message.archive instanceof Blob)
        finish(undefined, message.archive)
      else if (message?.type === 'error') finish(new FolderArchiveError(message.code))
      else if (message?.type === 'progress') {
        try {
          options.onProgress?.(message.progress)
        } catch {
          finish(new FolderArchiveError('failed'))
        }
      } else finish(new FolderArchiveError('failed'))
    }
    worker.onerror = () => finish(new FolderArchiveError('failed'))
    worker.onmessageerror = () => finish(new FolderArchiveError('failed'))
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) {
      abort()
      return
    }
    try {
      worker.postMessage(manifest)
    } catch {
      finish(new FolderArchiveError('failed'))
    }
  })
}
