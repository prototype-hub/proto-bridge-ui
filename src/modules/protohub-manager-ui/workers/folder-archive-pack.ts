import { Zip, ZipDeflate } from 'fflate'
import { FolderArchiveError, FOLDER_LIMITS, type FolderManifest } from '../utils/folder-manifest'

export interface FolderArchiveProgress {
  phase: 'reading' | 'packing'
  percent: number
}

/**
 * Read one bounded slice at a time and compress inside the caller's worker. ZIP chunks stay below
 * a fixed output budget; Blob assembly avoids concatenating another full Uint8Array in memory.
 */
export async function packFolderArchive(
  manifest: FolderManifest,
  onProgress: (progress: FolderArchiveProgress) => void,
): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const chunkSize = 1024 * 1024
  const maxOutputBytes = FOLDER_LIMITS.maxTotalBytes + 16 * 1024 * 1024
  let outputBytes = 0
  let readBytes = 0
  let failure: Error | undefined
  let complete = false
  const zip = new Zip((error, data, final) => {
    if (error) {
      failure = error
      return
    }
    outputBytes += data.byteLength
    if (outputBytes > maxOutputBytes) {
      failure = new FolderArchiveError('tooLarge')
      return
    }
    chunks.push(data as Uint8Array<ArrayBuffer>)
    complete = final
  })
  try {
    onProgress({ phase: 'reading', percent: 0 })
    for (const entry of manifest.entries) {
      const stream = new ZipDeflate(entry.path, { level: 6 })
      // Fixed local-calendar metadata makes retries reproducible across browser locale and file mtimes.
      stream.mtime = new Date(2000, 0, 1, 0, 0, 0)
      zip.add(stream)
      if (!entry.file.size) stream.push(new Uint8Array(0), true)
      for (let offset = 0; offset < entry.file.size; offset += chunkSize) {
        const bytes = new Uint8Array(
          await entry.file.slice(offset, offset + chunkSize).arrayBuffer(),
        )
        stream.push(bytes, offset + bytes.length >= entry.file.size)
        if (failure) throw failure
        readBytes += bytes.length
        onProgress({
          phase: 'reading',
          percent: Math.min(100, Math.round((readBytes / Math.max(1, manifest.totalBytes)) * 100)),
        })
      }
      if (failure) throw failure
    }
    onProgress({ phase: 'packing', percent: 0 })
    zip.end()
    if (failure) throw failure
    if (!complete) throw new FolderArchiveError('failed')
    onProgress({ phase: 'packing', percent: 100 })
    return new Blob(chunks, { type: 'application/zip' })
  } finally {
    zip.terminate()
  }
}
