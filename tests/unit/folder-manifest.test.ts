// @vitest-environment node
import { expect, it } from 'vitest'
import {
  buildFolderManifest,
  FOLDER_LIMITS,
} from '@/modules/protohub-manager-ui/utils/folder-manifest'

function selected(path: string, bytes = 'content'): File {
  const file = new File([bytes], path.split('/').at(-1)!)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

it('strips exactly the selected root and preserves nested Chinese and space paths including empty files', () => {
  const manifest = buildFolderManifest([
    selected('原型 导出/页面/嵌套 页.html'),
    selected('原型 导出/images/图 标.svg'),
    selected('原型 导出/index.html'),
    selected('原型 导出/empty.txt', ''),
  ])
  expect(manifest.rootName).toBe('原型 导出')
  expect(manifest.entries.map(({ path }) => path)).toEqual([
    'empty.txt',
    'images/图 标.svg',
    'index.html',
    '页面/嵌套 页.html',
  ])
  expect(manifest.totalBytes).toBe(21)
})

it.each([
  '/export/index.html',
  'export//index.html',
  'export/../index.html',
  'export/./index.html',
  'export/.hidden/index.html',
  'export/a\\b/index.html',
  'export/a:b/index.html',
  'export/a\u0000b/index.html',
  'export/a\u007fb/index.html',
  'export/\ud800/index.html',
  'export/\udc00/index.html',
  'export/index.html/',
  'export/' + 'a'.repeat(4096) + '/index.html',
])('rejects unsafe or unencodable directory path %j before reading files', (path) => {
  const file = selected(path)
  expect(() => buildFolderManifest([file])).toThrow(
    expect.objectContaining({ code: 'invalidPath' }),
  )
})

it('does not normalize a valid surrogate pair or Unicode filename', () => {
  expect(buildFolderManifest([selected('原型/😀.html')]).entries[0]?.path).toBe('😀.html')
})

it('rejects mixed roots, duplicate files, misleading leaf names and file-directory collisions in either order', () => {
  for (const files of [
    [selected('one/index.html'), selected('two/page.html')],
    [selected('one/index.html'), selected('one/index.html')],
    [selected('one/index.html'), selected('one/index.html/nested.html')],
    [selected('one/index.html/nested.html'), selected('one/index.html')],
  ])
    expect(() => buildFolderManifest(files)).toThrow(
      expect.objectContaining({ code: 'invalidPath' }),
    )
  const file = selected('one/index.html')
  Object.defineProperty(file, 'name', { value: 'another.html' })
  expect(() => buildFolderManifest([file])).toThrow(
    expect.objectContaining({ code: 'invalidPath' }),
  )
})

it('distinguishes cancellation/unsupported selections from an invalid mixed directory selection', () => {
  expect(() => buildFolderManifest([])).toThrow(expect.objectContaining({ code: 'empty' }))
  expect(() => buildFolderManifest([new File(['html'], 'index.html')])).toThrow(
    expect.objectContaining({ code: 'unsupported' }),
  )
  expect(() =>
    buildFolderManifest([selected('root/index.html'), new File(['x'], 'other.txt')]),
  ).toThrow(expect.objectContaining({ code: 'invalidPath' }))
})

it('requires an HTML entry within the same six-level non-resource search used by the server', () => {
  for (const path of [
    'root/resources/index.html',
    'root/data/page.htm',
    'root/plugins/plugin.html',
    'root/my-resources/index.html',
    'root/a/b/c/d/e/f/index.html',
    'root/readme.txt',
  ])
    expect(() => buildFolderManifest([selected(path)])).toThrow(
      expect.objectContaining({ code: 'noHtml' }),
    )
  expect(buildFolderManifest([selected('root/a/b/c/d/e/start.htm')]).entries).toHaveLength(1)
})

it('rejects count and byte budgets before any file is opened', () => {
  const file = selected('root/index.html')
  expect(() => buildFolderManifest(Array(FOLDER_LIMITS.maxFiles + 1).fill(file))).toThrow(
    expect.objectContaining({ code: 'tooManyFiles' }),
  )
  Object.defineProperty(file, 'size', { value: FOLDER_LIMITS.maxFileBytes + 1 })
  expect(() => buildFolderManifest([file])).toThrow(expect.objectContaining({ code: 'tooLarge' }))
  const total = [selected('root/index.html'), selected('root/a.bin'), selected('root/b.bin')]
  total.forEach((item) =>
    Object.defineProperty(item, 'size', { value: FOLDER_LIMITS.maxFileBytes }),
  )
  expect(() => buildFolderManifest(total)).toThrow(expect.objectContaining({ code: 'tooLarge' }))
  expect(buildFolderManifest(total.slice(0, 2)).totalBytes).toBe(FOLDER_LIMITS.maxTotalBytes)
})
