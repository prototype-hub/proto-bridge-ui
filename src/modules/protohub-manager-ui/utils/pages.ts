import type { PrototypePage } from '../types'
export interface PageNode {
  key: string
  title: string
  folder: boolean
  selectable: boolean
  path?: string
  children?: PageNode[]
}
export function pageNodes(
  pages: PrototypePage[],
  parent = 'root',
  usedKeys = new Set<string>(),
): PageNode[] {
  return pages.map((page, index) => {
    const folder = page.folder === true || (!page.path && !!page.children?.length)
    let key = folder ? `folder:${parent}-${index}` : page.path || `page:${parent}-${index}`
    if (usedKeys.has(key)) key = `page:${parent}-${index}`
    usedKeys.add(key)
    const children = pageNodes(page.children || [], `${parent}-${index}`, usedKeys)
    return {
      key,
      title: page.name,
      folder,
      selectable: !!page.path && !folder,
      path: page.path,
      children: children.length ? children : undefined,
    }
  })
}
export const expandedPageKeys = (nodes: PageNode[]): string[] =>
  nodes.flatMap((node) => [
    ...(node.children?.length ? [node.key] : []),
    ...expandedPageKeys(node.children || []),
  ])
