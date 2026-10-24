<script setup lang="ts">
import { toRef, type PropType } from 'vue'
import {
  Button as AButton,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Spin as ASpin,
  Alert as AAlert,
  Drawer as ADrawer,
} from 'ant-design-vue'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useWorkspace } from '@/modules/protohub-manager-ui/hooks/useWorkspace'
import type { WorkspaceContext, PrototypePage, WorkspacePane } from '../types'
import PageTree from './PageTree.vue'
import InspectorPanel from './InspectorPanel.vue'
const props = defineProps({
  context: { type: Object as PropType<WorkspaceContext>, required: true },
  pane: { type: String as PropType<WorkspacePane>, default: undefined },
  compact: { type: Boolean, default: false },
})
const { t } = useI18n()
const {
  mode,
  navVisible,
  isNarrow,
  inspectorOpen,
  frame,
  currentPage,
  selectedPage,
  pageId,
  canCopy,
  copyCurrentPage,
  select: selectPage,
  url,
  loading,
  error,
  element,
  toggleTitle,
  load,
  loaded,
  failed,
} = useWorkspace(toRef(props, 'context'), props.pane, props.compact)
function select(path: string, id?: string, page?: PrototypePage) {
  selectPage(path, id, page)
  if (isNarrow.value) navVisible.value = false
}
</script>
<template>
  <div class="workspace">
    <header class="workspace-header">
      <div class="workspace-name">
        <a-button :aria-label="toggleTitle" :title="toggleTitle" @click="navVisible = !navVisible"
          ><menu-fold-outlined v-if="navVisible" /><menu-unfold-outlined v-else /></a-button
        ><strong :title="context.title">{{ context.title }}</strong
        ><span class="muted">{{ context.versionName }}</span>
      </div>
      <a-radio-group v-model:value="mode" button-style="solid"
        ><a-radio-button value="preview">{{ t('proto.preview') }}</a-radio-button
        ><a-radio-button value="inspect">{{ t('proto.inspect') }}</a-radio-button></a-radio-group
      ><a-button v-if="isNarrow && mode === 'inspect'" @click="inspectorOpen = true">{{
        t('proto.details')
      }}</a-button>
      <div class="workspace-current" aria-live="polite">
        <span :title="selectedPage?.path || currentPage"
          >{{ t('proto.currentPage') }}: {{ selectedPage?.name || currentPage }}</span
        >
        <span v-if="selectedPage?.path" class="muted current-path" :title="selectedPage.path">{{
          selectedPage.path
        }}</span>
        <a-button
          :disabled="!canCopy"
          :title="canCopy ? t('proto.copyPageLink') : t('proto.noStablePageLink')"
          @click="copyCurrentPage"
          >{{ t('proto.copyPageLink') }}</a-button
        >
      </div>
    </header>
    <div
      class="workspace-body"
      :class="{
        'has-nav': navVisible && !isNarrow,
        'has-inspector': mode === 'inspect' && !isNarrow,
      }"
    >
      <nav v-show="navVisible && !isNarrow" class="workspace-nav">
        <h2>{{ t('proto.pages') }}</h2>
        <page-tree
          v-if="!isNarrow"
          :pages="context.pages"
          :selected="currentPage"
          :selected-id="pageId"
          @select="select"
        />
      </nav>
      <main class="frame-stage">
        <a-alert v-if="error" :message="error" type="error"
          ><template #action
            ><a-button @click="load">{{ t('common.retry') }}</a-button></template
          ></a-alert
        ><a-spin v-if="loading" class="frame-spinner" /><iframe
          v-if="url"
          ref="frame"
          :key="url"
          :src="url"
          sandbox="allow-scripts allow-forms"
          referrerpolicy="no-referrer"
          :title="context.title"
          @load="loaded"
          @error="failed"
        />
      </main>
      <inspector-panel v-if="mode === 'inspect' && !isNarrow" :element="element" />
    </div>
    <a-drawer
      :open="isNarrow && navVisible"
      :title="t('proto.pages')"
      placement="left"
      :width="280"
      @close="navVisible = false"
      ><section role="dialog" :aria-label="t('proto.pages')" aria-modal="true">
        <page-tree
          :pages="context.pages"
          :selected="currentPage"
          :selected-id="pageId"
          @select="select"
        /></section></a-drawer
    ><a-drawer
      :open="isNarrow && inspectorOpen && mode === 'inspect'"
      :title="t('proto.details')"
      :width="'90vw'"
      @close="inspectorOpen = false"
      ><inspector-panel :element="element"
    /></a-drawer>
  </div>
</template>
<style scoped>
.workspace {
  display: grid;
  height: 100dvh;
  grid-template-rows: auto minmax(0, 1fr);
}
.workspace-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.workspace-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
}
.workspace-name strong {
  max-width: 35vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-current {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}
.workspace-current span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-current .current-path {
  flex: 1;
}
.workspace-current :deep(.ant-btn) {
  margin-inline-start: auto;
  flex: none;
}
.workspace-body {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
}
.workspace-body.has-nav {
  grid-template-columns: var(--layout-nav) minmax(0, 1fr);
}
.workspace-body.has-inspector {
  grid-template-columns: minmax(0, 1fr) var(--layout-inspector);
}
.workspace-body.has-nav.has-inspector {
  grid-template-columns: var(--layout-nav) minmax(0, 1fr) var(--layout-inspector);
}
.workspace-nav {
  min-width: 0;
  overflow: auto;
  padding: var(--space-3);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}
.workspace-nav h2 {
  font-size: var(--text-body);
}
.frame-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: var(--space-3);
}
.frame-stage iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--color-surface);
}
.frame-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: var(--layer-overlay);
}
@media (width <= 760px) {
  .workspace-header {
    gap: var(--space-2);
  }
  .workspace-name strong {
    max-width: 40vw;
  }
  .frame-stage {
    padding: var(--space-1);
  }
}
</style>
