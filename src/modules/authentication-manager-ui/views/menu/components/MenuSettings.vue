<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Modal as AModal,
  Tree as ATree,
  Alert as AAlert,
  Space as ASpace,
  Button as AButton,
  Popconfirm as APopconfirm,
} from 'ant-design-vue'
import type { AntTreeNodeDropEvent, TreeDataItem } from 'ant-design-vue/es/tree'
import { useI18n } from 'vue-i18n'
import type { ServerMenu } from '@/shared/auth/types'
import { getMenuTree } from '@/modules/authentication-manager-ui/api/menu/menu'
import {
  updateMenus,
  getSystemPermission,
} from '@/modules/authentication-manager-ui/api/menu/initHome'
import baseMenu from '@/modules/authentication-manager-ui/views/menu/default-menus.json'
import {
  cloneMenus,
  menuQuery,
  treeDepth,
  settingsPayload,
  synchronizeSystemMenus,
} from '@/modules/authentication-manager-ui/utils/menu'
import { recordsOf, resultOf, isRecord } from '@/modules/authentication-manager-ui/utils/model'
import { useTask } from '@/shared/composables/useTask'
import LoadState from '@/shared/components/LoadState.vue'
import { saved } from '@/shared/utils/feedback'
import { useSession } from '@/app/stores/session'
import { menuDisplayName } from '@/shared/auth/menu-display'
const open = defineModel<boolean>({ required: true }),
  emit = defineEmits<{ refresh: [] }>(),
  { t, locale } = useI18n(),
  task = useTask()
const menus = ref<ServerMenu[]>([]),
  checked = ref<string[]>([]),
  defaults = ref<ServerMenu[]>([])
function treeNodes(rows: ServerMenu[]): TreeDataItem[] {
  return rows.map((row) => ({
    ...row,
    key: row.code,
    title: menuDisplayName(row, locale.value),
    children: treeNodes(row.children || []),
  }))
}
const treeData = computed(() => treeNodes(menus.value))
async function refreshNavigation() {
  const session = useSession()
  await session.refreshMenus()
}
const codes = (rows: ServerMenu[]): string[] =>
  rows.flatMap((row) => [
    ...(row.options?.show !== false ? [row.code] : []),
    ...codes(row.children || []),
  ])
async function load() {
  await task.run(async () => {
    const response = await getMenuTree(menuQuery({}, true))
    menus.value = recordsOf(response) as ServerMenu[]
    checked.value = codes(menus.value)
  })
}
function check(value: unknown) {
  const selected = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.checked)
      ? value.checked
      : []
  checked.value = [...new Set([...selected.map(String), 'system', 'system/Menu', 'account-center'])]
}
function drop(info: AntTreeNodeDropEvent) {
  const tree = cloneMenus(menus.value),
    drag = String(info.dragNode.key),
    target = String(info.node.key)
  let moving: ServerMenu | undefined
  function remove(rows: ServerMenu[]) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.code === drag) {
        moving = rows.splice(i, 1)[0]
        return
      }
      remove(rows[i]!.children || [])
    }
  }
  remove(tree)
  if (!moving) return
  function insert(rows: ServerMenu[]) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (row.code === target) {
        if (info.dropToGap) {
          const position =
            info.dropPosition -
            Number(
              String(info.node.pos || '')
                .split('-')
                .pop(),
            )
          rows.splice(i + (position > 0 ? 1 : 0), 0, moving!)
        } else {
          row.children ||= []
          row.children.push(moving!)
        }
        return true
      }
      if (insert(row.children || [])) return true
    }
    return false
  }
  if (!insert(tree)) return
  if (treeDepth(tree) > 3) {
    task.error.value = t('configuration.maximumDepth')
    return
  }
  menus.value = tree
}
async function save() {
  await task.run(async () => {
    await updateMenus(settingsPayload(menus.value, checked.value))
    await refreshNavigation()
    saved()
    open.value = false
    emit('refresh')
  })
}
async function synchronize() {
  await task.run(async () => {
    const result = resultOf(await getSystemPermission())
    const ids = new Set(
      (Array.isArray(result) ? result : []).map((item) => {
        try {
          const value: unknown = typeof item === 'string' ? JSON.parse(item) : item
          return isRecord(value) ? String(value.id) : ''
        } catch {
          return ''
        }
      }),
    )
    function supported(rows: ServerMenu[]): ServerMenu[] {
      return rows.flatMap((row) => {
        const children = supported(row.children || [])
        const required = Array.isArray(row.showPage) ? row.showPage.map(String) : []
        return children.length || !required.length || required.some((id) => ids.has(id))
          ? [{ ...row, children }]
          : []
      })
    }
    defaults.value = supported(baseMenu as unknown as ServerMenu[])
    const merged = synchronizeSystemMenus(menus.value, defaults.value)
    await updateMenus(settingsPayload(merged, codes(merged)))
    await refreshNavigation()
    saved()
    menus.value = merged
    checked.value = codes(merged)
    emit('refresh')
  })
}
watch(
  open,
  (value) => {
    if (value) void load()
  },
  { immediate: true },
)
</script>
<template>
  <a-modal
    v-model:open="open"
    :title="t('configuration.menuSettings')"
    :width="900"
    :footer="null"
    :destroy-on-close="true"
  >
    <a-alert type="info" :message="t('configuration.treeHint')" show-icon /><a-alert
      v-if="task.error.value"
      type="error"
      :message="task.error.value"
    />
    <load-state :loading="task.busy.value" :error="''"
      ><a-tree
        v-if="menus.length"
        class="settings-tree"
        :tree-data="treeData"
        :field-names="{ key: 'code', title: 'name', children: 'children' }"
        :checked-keys="checked"
        checkable
        draggable
        default-expand-all
        @check="check"
        @drop="drop"
    /></load-state>
    <a-space
      ><a-popconfirm :title="t('configuration.overwriteConfirm')" @confirm="save"
        ><a-button type="primary" :loading="task.busy.value">{{
          t('common.save')
        }}</a-button></a-popconfirm
      ><a-popconfirm :title="t('configuration.synchronizeConfirm')" @confirm="synchronize"
        ><a-button :loading="task.busy.value">{{
          t('configuration.synchronize')
        }}</a-button></a-popconfirm
      ></a-space
    >
  </a-modal>
</template>
<style scoped>
.settings-tree {
  max-height: 540px;
  overflow: auto;
  margin: 16px 0;
}
</style>
