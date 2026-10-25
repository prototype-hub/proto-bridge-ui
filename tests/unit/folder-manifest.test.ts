// @vitest-environment node
import { expect, it } from 'vitest'
import {
  buildFolderManifest,
  FOLDER_LIMITS,
  FolderArchiveError,
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

it('strips a hidden outer root without relaxing the inner hidden-file or traversal rules', () => {
  const manifest = buildFolderManifest([
    selected('.中文导出/index.html'),
    selected('.中文导出/resources/scripts/axure/axQuery.js'),
    selected('.中文导出/start_c_1.html'),
    selected(".中文导出/页面 (1)/O'Brien.html"),
  ])
  expect(manifest.rootName).toBe('.中文导出')
  expect(manifest.entries.map(({ path }) => path)).toContain("页面 (1)/O'Brien.html")
  for (const path of ['./index.html', '../index.html', '.export/.DS_Store', '.export/.cache/a.js'])
    expect(() => buildFolderManifest([selected(path)])).toThrow(
      expect.objectContaining({ code: 'invalidPath' }),
    )
})

it('preserves case and composed/decomposed Unicode paths without incorrectly deduplicating', () => {
  const paths = ['root/index.html', 'root/Index.html', 'root/é.html', 'root/e\u0301.html']
  const manifest = buildFolderManifest(paths.map((path) => selected(path)))
  expect(manifest.entries.map(({ path }) => path)).toEqual([
    'Index.html',
    'e\u0301.html',
    'index.html',
    'é.html',
  ])
})

it.each([
  ['root/.DS_Store', 'hiddenEntry'],
  ['root/a\\b/index.html', 'invalidCharacters'],
  ['root/\ud800/index.html', 'invalidUnicode'],
  ['root/' + 'a'.repeat(4096) + '/index.html', 'pathTooLong'],
  ['/root/index.html', 'absolutePath'],
  ['root//index.html', 'emptySegment'],
  ['root/../index.html', 'traversal'],
] as const)('explains the exact offending path %j with reason %s', (path, reason) => {
  expect(() => buildFolderManifest([selected(path)])).toThrow(
    expect.objectContaining({
      code: 'invalidPath',
      issues: [{ path, reason }],
      totalIssueCount: 1,
    }),
  )
})

it('identifies both source paths for duplicates and file/directory conflicts in either order', () => {
  for (const [first, second, reason] of [
    ['root/index.html', 'root/index.html', 'duplicate'],
    ['root/index.html', 'root/index.html/nested.html', 'fileDirectoryConflict'],
    ['root/index.html/nested.html', 'root/index.html', 'fileDirectoryConflict'],
  ])
    expect(() => buildFolderManifest([selected(first!), selected(second!)])).toThrow(
      expect.objectContaining({
        issues: [{ path: second, reason, conflictingPath: first }],
        totalIssueCount: 1,
      }),
    )
})

it('reports missing paths, mixed roots and misleading leaf names precisely', () => {
  const misleading = selected('root/actual.html')
  Object.defineProperty(misleading, 'name', { value: 'mismatch.html' })
  expect(() =>
    buildFolderManifest([
      selected('root/index.html'),
      new File(['x'], 'loose.txt'),
      selected('other/page.html'),
      misleading,
    ]),
  ).toThrow(
    expect.objectContaining({
      issues: [
        { path: 'loose.txt', reason: 'missingRelativePath' },
        { path: 'other/page.html', reason: 'mixedRoots' },
        { path: 'root/actual.html', reason: 'nameMismatch' },
      ],
      totalIssueCount: 3,
    }),
  )
})

it('bounds displayed issues at 20 while counting the full selection without reading file bytes', () => {
  const files = [selected('root/index.html')]
  for (let index = 0; index < 25; index++) files.push(selected(`root/.hidden-${index}.js`))
  files.forEach((file) => {
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => {
        throw new Error('Validation must not read any file, including a valid first file')
      },
    })
  })
  let failure: FolderArchiveError | undefined
  try {
    buildFolderManifest(files)
  } catch (cause) {
    if (cause instanceof FolderArchiveError) failure = cause
    else throw cause
  }
  expect(failure?.code).toBe('invalidPath')
  expect(failure?.issues).toHaveLength(20)
  expect(failure?.totalIssueCount).toBe(25)
  expect(failure?.issues[19]).toEqual({ path: 'root/.hidden-19.js', reason: 'hiddenEntry' })
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
