import type { ServerMenu } from './types'

/** Resolve display labels without replacing the menu's persisted default name. */
export function menuDisplayName(menu: Pick<ServerMenu, 'name' | 'i18nMessages'>, locale: string) {
  const names = menu.i18nMessages?.name
  return locale.startsWith('zh')
    ? names?.zh_CN || menu.name
    : names?.en_US || names?.en || menu.name
}
