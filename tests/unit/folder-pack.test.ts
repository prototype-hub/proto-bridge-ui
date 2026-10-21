// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import { buildFolderManifest } from '@/modules/protohub-manager-ui/utils/folder-manifest'
import { packFolderArchive } from '@/modules/protohub-manager-ui/workers/folder-archive-pack'

function selected(path: string, bytes: string | Uint8Array, modified = Date.now()): File {
  const file = new File([bytes], path.split('/').at(-1)!, { lastModified: modified })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

it('produces a real streaming ZIP with every path and byte preserved, including binary and empty resources', async () => {
  const files = [
    selected('原型 导出/index.html', '<html><iframe src="页面/嵌套 页.html"></iframe></html>'),
    selected('原型 导出/页面/嵌套 页.html', '<html>中文页面</html>'),
    selected('原型 导出/resources/css/主题 样式.css', 'body { color: red }'),
    selected('原型 导出/data/document.js', 'window.example = 1;'),
    selected('原型 导出/images/图 标.png', new Uint8Array([0, 128, 255, 13, 10])),
    selected('原型 导出/empty.txt', ''),
  ]
  const progress = vi.fn()
  const archive = await packFolderArchive(buildFolderManifest(files), progress)
  const bytes = new Uint8Array(await archive.arrayBuffer())
  expect(archive.type).toBe('application/zip')
  const unzipped = unzipSync(bytes)
  expect(Object.keys(unzipped).sort()).toEqual(
    files.map((file) => file.webkitRelativePath.substring('原型 导出/'.length)).sort(),
  )
  for (const file of files) {
    const path = file.webkitRelativePath.substring('原型 导出/'.length)
    expect(unzipped[path]).toEqual(new Uint8Array(await file.arrayBuffer()))
  }
  // Streaming local headers use data descriptors. Unicode paths must additionally set the UTF-8 bit.
  let offset = 0
  const view = new DataView(bytes.buffer)
  const names: string[] = []
  while (offset + 46 < bytes.length) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      offset++
      continue
    }
    const flags = view.getUint16(offset + 8, true)
    const size = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + size))
    expect(flags & 8).toBe(8)
    if ([...name].some((character) => character.charCodeAt(0) > 127))
      expect(flags & 0x800).toBe(0x800)
    names.push(name)
    offset += 46 + size + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  expect(names).toHaveLength(files.length)
  expect(progress).toHaveBeenLastCalledWith({ phase: 'packing', percent: 100 })
})

it('uses stable ordering and metadata rather than picker order or file mtimes', async () => {
  const first = [selected('root/page.html', 'page', 123), selected('root/index.html', 'entry', 456)]
  const second = [
    selected('root/index.html', 'entry', 999),
    selected('root/page.html', 'page', 789),
  ]
  const zip1 = await packFolderArchive(buildFolderManifest(first), () => {})
  const zip2 = await packFolderArchive(buildFolderManifest(second), () => {})
  expect(await zip1.arrayBuffer()).toEqual(await zip2.arrayBuffer())
})

it('reads large files in bounded slices and emits progress before the last byte is read', async () => {
  const file = selected('root/index.html', new Uint8Array(3 * 1024 * 1024 + 27))
  const slice = vi.spyOn(file, 'slice')
  const progress = vi.fn()
  await packFolderArchive(buildFolderManifest([file]), progress)
  expect(slice).toHaveBeenCalledTimes(4)
  for (const [start, end] of slice.mock.calls)
    expect(Number(end) - Number(start)).toBeLessThanOrEqual(1024 * 1024)
  expect(progress.mock.calls.some(([value]) => value.percent > 0 && value.percent < 100)).toBe(true)
})

it('propagates a file read failure instead of publishing a partial ZIP', async () => {
  const file = selected('root/index.html', 'entry')
  vi.spyOn(file, 'slice').mockReturnValue({
    arrayBuffer: () => Promise.reject(new Error('unreadable')),
  } as Blob)
  await expect(packFolderArchive(buildFolderManifest([file]), () => {})).rejects.toThrow(
    'unreadable',
  )
})
