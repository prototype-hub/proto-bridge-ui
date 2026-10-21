import { FolderArchiveError, type FolderManifest } from '../utils/folder-manifest'
import { packFolderArchive, type FolderArchiveProgress } from './folder-archive-pack'

export type FolderWorkerResponse =
  | { type: 'progress'; progress: FolderArchiveProgress }
  | { type: 'complete'; archive: Blob }
  | { type: 'error'; code: FolderArchiveError['code'] }

// One worker belongs to one packaging attempt; the main thread terminates it on every terminal path.
self.addEventListener('message', (event: MessageEvent<FolderManifest>) => {
  void packFolderArchive(event.data, (progress) =>
    self.postMessage({ type: 'progress', progress } satisfies FolderWorkerResponse),
  ).then(
    (archive) => self.postMessage({ type: 'complete', archive } satisfies FolderWorkerResponse),
    (error: unknown) =>
      self.postMessage({
        type: 'error',
        code: error instanceof FolderArchiveError ? error.code : 'failed',
      } satisfies FolderWorkerResponse),
  )
})
