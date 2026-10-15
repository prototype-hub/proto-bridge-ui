import { useLegacyDetail } from '@/modules/authentication-manager-ui/hooks/useLegacyDetail'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { menuManagement } from '@/modules/authentication-manager-ui/api/menu/menu'
import {
  DEFAULT_MENU_OWNER,
  accessSupport,
  cloneMenus,
  menuPayload,
  validateMenu,
  findMenu,
  menuDepth,
  treeDepth,
  descendants,
  buttonPermissions,
} from '@/modules/authentication-manager-ui/utils/menu'
import type { ServerMenu, MenuButton } from '@/shared/auth/types'
import type { Query } from '@/shared/api/types'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'
import { useSession } from '@/app/stores/session'
import { i18n } from '@/shared/i18n'
import { menuDisplayName } from '@/shared/auth/menu-display'
export function useMenus() {
  const session = useSession()
  const route = useRoute(),
    query = ref<Query>({})
  const resource = useResource(
    (signal) => menuManagement.list(query.value, { signal, silent: true }),
    [],
  )
  const task = useTask(),
    open = ref(false),
    creating = ref(false),
    form = ref<ServerMenu>({ id: '', name: '', code: '' })
  const original = ref<ServerMenu>()
  function edit(menu?: ServerMenu, parent?: ServerMenu) {
    creating.value = !menu
    original.value = menu ? cloneMenus([menu])[0] : undefined
    form.value = menu
      ? cloneMenus([menu])[0]!
      : {
          id: '',
          name: '',
          code: '',
          url: parent?.url || '/',
          parentId: parent?.id,
          sortIndex:
            Math.max(
              0,
              ...(parent?.children || resource.data.value).map((row) =>
                row.sortIndex === 9999 ? 0 : row.sortIndex || 0,
              ),
            ) + 1,
          icon: '',
          describe: '',
          buttons: [],
          permissions: [],
          accessSupport: 'unsupported',
          owner: parent ? parent.owner : DEFAULT_MENU_OWNER,
          options: { show: true },
        }
    form.value.accessSupport = accessSupport(form.value.accessSupport)
    // Existing bindings stay editable in the payload; a new menu is resolved from its page URL.
    const componentCode = menu?.componentCode || menu?.options?.meta?.componentCode
    if (componentCode) form.value.componentCode = componentCode
    open.value = true
  }
  async function detail(menu: ServerMenu) {
    await task.run(async () => edit(await menuManagement.detail(menu.id)))
  }
  const parents = computed(() => {
    const current = findMenu(resource.data.value, form.value.id)
    const blocked = new Set([form.value.id, ...(current ? descendants(current) : [])])
    const flat = (rows: ServerMenu[]): ServerMenu[] =>
      rows.flatMap((row) => [row, ...flat(row.children || [])])
    return flat(resource.data.value)
      .filter(
        (row) =>
          !blocked.has(row.id) &&
          (creating.value || row.owner === form.value.owner) &&
          menuDepth(resource.data.value, row.id) + 1 + treeDepth(current?.children || []) <= 3,
      )
      .map((row) => ({ value: row.id, label: menuDisplayName(row, i18n.global.locale.value) }))
  })
  async function save() {
    await task.run(async () => {
      // A newly created child follows the final selected parent, including a changed selection.
      if (creating.value) {
        const parent = form.value.parentId
          ? findMenu(resource.data.value, form.value.parentId)
          : undefined
        form.value.owner = parent ? parent.owner : DEFAULT_MENU_OWNER
      }
      validateMenu(form.value, resource.data.value)
      if (creating.value || form.value.code !== original.value?.code) {
        const result = await menuManagement.validate(form.value.code)
        if (!result.passed) throw new Error(result.reason || t('common.invalid'))
      }
      const result = await menuManagement.save(menuPayload(form.value), creating.value)
      const id = result?.id || form.value.id
      if (id) {
        original.value = await menuManagement.detail(id)
        form.value = {
          ...cloneMenus([original.value])[0]!,
          accessSupport: accessSupport(original.value.accessSupport),
        }
        creating.value = false
      }
      saved()
      await resource.load()
      if (session.initialized) await session.refreshMenus()
    })
  }
  async function updateButtons(buttons: MenuButton[]) {
    if (!original.value?.id) {
      task.error.value = t('configuration.saveMenuFirst')
      return
    }
    await task.run(async () => {
      buttonPermissions(buttons)
      await menuManagement.save({ ...original.value!, buttons }, false)
      original.value = await menuManagement.detail(original.value!.id)
      form.value.buttons = original.value.buttons || []
      saved()
      await resource.load()
      if (session.initialized) await session.refreshMenus()
    })
  }
  async function remove(id: string) {
    await task.run(async () => {
      await menuManagement.remove(id)
      deleted()
      await resource.load()
      if (session.initialized) await session.refreshMenus()
    })
  }
  async function search(value: Query) {
    query.value = value
    await resource.load()
  }
  useLegacyDetail(async (id) => {
    if (id === ':id') {
      const parent = findMenu(resource.data.value, String(route.query.pid || ''))
      edit(undefined, parent)
      form.value.parentId = String(route.query.pid || '') || undefined
      form.value.url = String(route.query.basePath || '/')
      form.value.sortIndex = Number(route.query.sortIndex || 1)
    } else edit(await menuManagement.detail(id))
  })
  onMounted(resource.load)
  return {
    resource,
    task,
    open,
    creating,
    form,
    parents,
    edit,
    detail,
    save,
    updateButtons,
    remove,
    search,
  }
}
