import type { MenuLink } from './menu-adapter'

export function firstPage(item: MenuLink): string | undefined {
  return (
    item.children?.map(firstPage).find(Boolean) || (item.key.startsWith('/') ? item.key : undefined)
  )
}

// Choose the same children-first destination as a top-menu click, using only authorized links.
export function defaultPage(items: MenuLink[]): string {
  return items.map(firstPage).find(Boolean) || '/account/center'
}

export function menuTrail(items: MenuLink[], path: string): MenuLink[] {
  let best: MenuLink[] = []
  let score = -1
  function walk(nodes: MenuLink[], ancestors: MenuLink[]) {
    for (const item of nodes) {
      const trail = [...ancestors, item]
      if (
        item.key.startsWith('/') &&
        (path === item.key || path.startsWith(`${item.key}/`)) &&
        item.key.length > score
      ) {
        best = trail
        score = item.key.length
      }
      if (item.children) walk(item.children, trail)
    }
  }
  walk(items, [])
  return best
}

export function splitNavigation(items: MenuLink[], path: string, selectedRoot?: string) {
  const trail = menuTrail(items, path)
  // Non-menu pages retain an actual granted root as their top-level navigation context.
  const root =
    items.find((item) => item.key === selectedRoot) ||
    trail[0] ||
    items.find((item) => item.children?.length) ||
    items[0]
  return {
    primary: items,
    secondary: root?.children || [],
    root,
    trail,
    selectedKeys: trail.slice(-1).map((item) => item.key),
  }
}
