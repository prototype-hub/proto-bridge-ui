<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import { Tree as ATree, Empty as AEmpty } from 'ant-design-vue'
import { FolderOutlined, FileOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import { pageNodes, expandedPageKeys, type PageNode } from '../utils/pages'
import type { PrototypePage } from '../types'
const props = defineProps({
  pages: { type: Array as PropType<PrototypePage[]>, required: true },
  selected: { type: String, default: '' },
})
const emit = defineEmits<{ select: [path: string] }>()
const { t } = useI18n()
const nodes = computed(() => pageNodes(props.pages))
const expanded = ref<string[]>([])
const selectedKey = ref('')
function flatten(value: PageNode[]): PageNode[] {
  return value.flatMap((node) => [node, ...flatten(node.children || [])])
}
const allNodes = computed(() => flatten(nodes.value))
watch(
  nodes,
  (value) => {
    expanded.value = expandedPageKeys(value)
  },
  { immediate: true },
)
watch(
  [allNodes, () => props.selected],
  ([value, path]) => {
    if (!value.some((node) => node.key === selectedKey.value && node.path === path))
      selectedKey.value = value.find((node) => node.selectable && node.path === path)?.key || ''
  },
  { immediate: true },
)
function select(keys: (string | number)[]) {
  const node = allNodes.value.find((node) => node.key === String(keys[0] || ''))
  if (node?.selectable && node.path) {
    selectedKey.value = node.key
    emit('select', node.path)
  }
}
function toggleFolder(key: string) {
  expanded.value = expanded.value.includes(key)
    ? expanded.value.filter((value) => value !== key)
    : [...expanded.value, key]
}
</script>
<template>
  <a-empty v-if="!nodes.length" :description="t('common.empty')" />
  <div v-else class="prototype-page-tree">
    <a-tree
      :tree-data="nodes"
      :selected-keys="selectedKey ? [selectedKey] : []"
      :expanded-keys="expanded"
      :show-line="{ showLeafIcon: false }"
      show-icon
      block-node
      @expand="(keys) => (expanded = keys.map(String))"
      @select="select"
      ><template #icon="{ folder }"
        ><folder-outlined v-if="folder" /><file-outlined v-else /></template
      ><template #title="node"
        ><button
          v-if="node.folder"
          type="button"
          class="tree-folder"
          :aria-expanded="expanded.includes(node.key)"
          @click.stop="toggleFolder(node.key)"
        >
          <text-ellipsis :text="node.title" /></button
        ><span v-else class="tree-page"><text-ellipsis :text="node.title" /></span></template
    ></a-tree>
  </div>
</template>
<style scoped>
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
