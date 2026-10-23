<script setup lang="ts">
import { computed, ref, watch, nextTick, type PropType } from 'vue'
import { Tree as ATree, Empty as AEmpty, InputSearch as AInputSearch } from 'ant-design-vue'
import { FolderOutlined, FileOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import {
  pageNodes,
  expandedPageKeys,
  filterPageNodes,
  pageAncestorKeys,
  type PageNode,
} from '../utils/pages'
import type { PrototypePage } from '../types'
const props = defineProps({
  pages: { type: Array as PropType<PrototypePage[]>, required: true },
  selected: { type: String, default: '' },
  selectedId: { type: String, default: '' },
})
const emit = defineEmits<{ select: [path: string, pageId?: string, page?: PrototypePage] }>()
const { t } = useI18n()
const nodes = computed(() => pageNodes(props.pages))
const expanded = ref<string[]>([])
const selectedKey = ref('')
const keyword = ref('')
const searchExpanded = ref<string[]>([])
const activeExpanded = computed(() =>
  keyword.value.trim() ? searchExpanded.value : expanded.value,
)
const tree = ref<HTMLElement>()
const filtered = computed(() => filterPageNodes(nodes.value, keyword.value, selectedKey.value))
const hasMatches = computed(() => filterPageNodes(nodes.value, keyword.value).length > 0)
function flatten(value: PageNode[]): PageNode[] {
  return value.flatMap((node) => [node, ...flatten(node.children || [])])
}
const allNodes = computed(() => flatten(nodes.value))
function expand(keys: (string | number)[]) {
  const value = keys.map(String)
  if (keyword.value.trim()) searchExpanded.value = value
  else expanded.value = value
}
watch([keyword, nodes], () => {
  // A new search reveals its matches once; subsequent folder toggles remain under user control.
  if (keyword.value.trim()) searchExpanded.value = expandedPageKeys(filtered.value)
})
watch(
  nodes,
  (value) => {
    expanded.value = expandedPageKeys(value)
  },
  { immediate: true },
)
watch(
  [allNodes, () => props.selected, () => props.selectedId],
  ([value, path, id]) => {
    if (
      !value.some(
        (node) =>
          node.key === selectedKey.value && node.path === path && (!id || node.pageId === id),
      )
    )
      selectedKey.value =
        value.find((node) => node.selectable && node.path === path && (!id || node.pageId === id))
          ?.key || ''
    expand([
      ...new Set([...activeExpanded.value, ...pageAncestorKeys(nodes.value, selectedKey.value)]),
    ])
    void nextTick(() =>
      tree.value?.querySelector('.ant-tree-node-selected')?.scrollIntoView?.({ block: 'nearest' }),
    )
  },
  { immediate: true },
)
function select(keys: (string | number)[]) {
  const node = allNodes.value.find((node) => node.key === String(keys[0] || ''))
  if (node?.selectable && node.path) {
    selectedKey.value = node.key
    // A path may have several manifest labels, including legacy aliases without an ID.
    if (allNodes.value.filter((item) => item.selectable && item.path === node.path).length > 1)
      emit('select', node.path, node.pageId || undefined, node.source)
    else if (node.pageId) emit('select', node.path, node.pageId)
    else emit('select', node.path)
  }
}
function toggleFolder(key: string) {
  expand(
    activeExpanded.value.includes(key)
      ? activeExpanded.value.filter((value) => value !== key)
      : [...activeExpanded.value, key],
  )
}
</script>
<template>
  <a-input-search
    v-if="nodes.length"
    v-model:value="keyword"
    type="search"
    :aria-label="t('proto.searchPages')"
    :placeholder="t('proto.searchPages')"
    allow-clear
    class="page-search"
  />
  <a-empty v-if="!nodes.length" :description="t('common.empty')" />
  <div v-else ref="tree" class="prototype-page-tree">
    <a-empty v-if="keyword.trim() && !hasMatches" :description="t('proto.noPageMatches')" />
    <a-tree
      :tree-data="filtered"
      :selected-keys="selectedKey ? [selectedKey] : []"
      :expanded-keys="activeExpanded"
      :show-line="{ showLeafIcon: false }"
      show-icon
      block-node
      @expand="expand"
      @select="select"
      ><template #icon="{ folder }"
        ><folder-outlined v-if="folder" /><file-outlined v-else /></template
      ><template #title="node"
        ><button
          v-if="node.folder"
          type="button"
          class="tree-folder"
          :aria-expanded="activeExpanded.includes(node.key)"
          @click.stop="toggleFolder(node.key)"
        >
          <text-ellipsis :text="node.title" /></button
        ><span v-else class="tree-page"><text-ellipsis :text="node.title" /></span></template
    ></a-tree>
  </div>
</template>
<style scoped>
.page-search {
  margin-bottom: var(--space-3);
}
.prototype-page-tree {
  min-width: 0;
}
.prototype-page-tree :deep(.ant-tree-treenode) {
  min-width: 0;
}
.prototype-page-tree :deep(.ant-tree-node-content-wrapper) {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.prototype-page-tree :deep(.ant-tree-iconEle) {
  flex: none;
}
.prototype-page-tree :deep(.ant-tree-title) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.tree-folder {
  padding: 0;
  color: var(--color-muted);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}
.tree-page {
  color: var(--color-primary);
}
.tree-page,
.tree-folder {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
