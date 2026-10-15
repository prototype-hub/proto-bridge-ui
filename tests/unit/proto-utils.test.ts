import { it, expect } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import {
  applicationUrl,
  runtimePageUrl,
  entryFromUrls,
} from '@/modules/protohub-manager-ui/utils/urls'
import {
  pageNodes,
  expandedPageKeys,
  firstAccessiblePagePath,
} from '@/modules/protohub-manager-ui/utils/pages'
import {
  rgbToHex,
  inspectCss,
  isInspectElement,
  safeAssetUrl,
  isFrameSource,
} from '@/modules/protohub-manager-ui/utils/inspect'
import { validZip } from '@/modules/protohub-manager-ui/views/project/hooks/useUpload'
it('preserves origin, deployment base and encoded public share tokens', () => {
  const router = createRouter({
    history: createWebHistory('/tools/'),
    routes: [{ path: '/share/:token', component: {} }],
  })
  expect(applicationUrl(router, '/share/token%20value', 'https://example.test')).toBe(
    'https://example.test/tools/share/token%20value',
  )
  expect(runtimePageUrl('/api/runtime/key', '目录/a b.html', 'https://example.test')).toBe(
    'https://example.test/api/runtime/key/%E7%9B%AE%E5%BD%95/a%20b.html',
  )
  expect(() =>
    runtimePageUrl('https://outside.example/runtime', 'a.html', 'https://example.test'),
  ).toThrow()
  for (const path of [
    '',
    '/login',
    '//outside.example/page.html',
    '../a.html',
    '%2e%2e/a.html',
    'a\\b.html',
  ])
    expect(() => runtimePageUrl('/runtime', path, 'https://example.test')).toThrow()
  expect(entryFromUrls('/runtime', '/runtime/a%20b.html')).toBe('a b.html')
})
it('encodes raw filename segments once and restores percent literals without a second decode', () => {
  const base = '/api/prototype-hub/runtime/v1/key'
  const origin = 'https://example.test'
  for (const path of [
    '目录/index%.html',
    '目录/literal%20.html',
    'a b?#.html',
    '目录;v/index;v.html',
  ]) {
    const expected = `${origin}${base}/${path.split('/').map(encodeURIComponent).join('/')}`
    const url = runtimePageUrl(base, path, origin)
    expect(url).toBe(expected)
    expect(entryFromUrls(`${origin}${base}`, url)).toBe(path)
  }
  for (const path of [
    '../index.html',
    '%2e%2e/index.html',
    'a\\b.html',
    '%5cindex.html',
    'index%00.html',
  ])
    expect(() => runtimePageUrl(base, path, origin)).toThrow('Invalid runtime path')
})
it('keeps folders and clickable parent pages with nested pages', () => {
  const nodes = pageNodes([
    {
      name: 'Folder',
      folder: true,
      children: [
        { name: 'Parent', path: 'parent.html', children: [{ name: 'Child', path: 'child.html' }] },
      ],
    },
  ])
  expect(nodes[0].selectable).toBe(false)
  expect(nodes[0].children?.[0].selectable).toBe(true)
  expect(nodes[0].children?.[0].children?.[0].key).toBe('child.html')
  expect(expandedPageKeys(nodes)).toEqual(['folder:root-0', 'parent.html'])
})
it('finds the first accessible menu page depth-first and skips folders or rejected paths', () => {
  const pages = [
    {
      name: 'Folder',
      folder: true,
      path: 'folder.html',
      children: [
        { name: 'Rejected', path: '../outside.html' },
        {
          name: 'First page',
          path: 'nested/first.html',
          children: [{ name: 'Child page', path: 'nested/child.html' }],
        },
      ],
    },
    { name: 'Later page', path: 'later.html' },
  ]
  const canAccess = (path: string) => {
    try {
      runtimePageUrl('/runtime', path, 'https://example.test')
      return true
    } catch {
      return false
    }
  }

  expect(firstAccessiblePagePath(pages, canAccess)).toBe('nested/first.html')
  expect(
    firstAccessiblePagePath([{ name: 'Empty folder', folder: true }], canAccess),
  ).toBeUndefined()
})
it('formats CSS and validates Inspector messages and assets', () => {
  const element = {
    tagName: 'DIV',
    id: 'u1',
    className: 'ax_default',
    text: 'Hello',
    position: { x: 1, y: 2, pageX: 1, pageY: 2 },
    size: { width: 120, height: 40 },
    typography: { color: 'rgba(22, 119, 255, 0.5)' },
    appearance: { borderRadius: '6px' },
    spacing: { paddingTop: '8px' },
    html: '<div>Hello</div>',
    assets: [],
  }
  expect(rgbToHex('rgba(22, 119, 255, 0.5)')).toBe('#1677FF80')
  expect(inspectCss(element)).toContain('border-radius: 6px;')
  expect(isInspectElement(element)).toBe(true)
  expect(isInspectElement({ ...element, size: { width: '120', height: 40 } })).toBe(false)
  expect(safeAssetUrl('javascript:alert(1)')).toBeUndefined()
  expect(safeAssetUrl('https://untrusted.example/image')).toBeUndefined()
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  expect(isFrameSource(iframe.contentWindow, window)).toBe(false)
  expect(isFrameSource(iframe.contentWindow, iframe.contentWindow)).toBe(true)
  iframe.remove()
})
it('rejects empty and non-ZIP uploads', () => {
  expect(validZip(new File([], 'test.zip'))).toBe(false)
  expect(validZip(new File(['a'], 'test.txt'))).toBe(false)
  expect(validZip(new File(['zip'], 'Axure.ZIP'))).toBe(true)
})
