<script setup lang="ts">
defineOptions({ name: 'RevisionCompareView' })
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  Checkbox as ACheckbox,
  Tabs as ATabs,
  TabPane as ATabPane,
  Tag as ATag,
} from 'ant-design-vue'
import { useRevisionComparison } from './hooks/useRevisionComparison'
import type { ComparisonStatus, WorkspacePane } from '@/modules/protohub-manager-ui/types'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import LoadState from '@/shared/components/LoadState.vue'
import DataTable from '@/shared/components/DataTable.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
const { t } = useI18n()
const state = useRevisionComparison()
const sides: WorkspacePane[] = ['left', 'right']
const statuses: Record<ComparisonStatus, string> = {
  added: 'compareAdded',
  removed: 'compareRemoved',
  changed: 'compareChanged',
  unchanged: 'compareUnchanged',
}
const colors: Record<ComparisonStatus, string> = {
  added: 'green',
  removed: 'red',
  changed: 'orange',
  unchanged: 'default',
}
const pageRows = computed(
  () => state.data.value?.pages.data.map((row) => ({ ...row, id: row.path })) || [],
)
const fileRows = computed(
  () => state.data.value?.files.data.map((row) => ({ ...row, id: row.path })) || [],
)
const commonColumns = computed(() => [
  { title: t('proto.comparePath'), dataIndex: 'path', width: 220 },
  { title: t('common.status'), dataIndex: 'status', width: 90 },
  { title: t('proto.compareLeft'), dataIndex: 'left', width: 260 },
  { title: t('proto.compareRight'), dataIndex: 'right', width: 260 },
])
const pageColumns = computed(() => [
  ...commonColumns.value,
  { title: t('common.actions'), key: 'actions', width: 130 },
])
const pagination = (kind: 'pages' | 'files') => ({
  current: state.paging[`${kind}PageIndex`] + 1,
  pageSize: state.paging[`${kind}PageSize`],
  total: state.data.value?.[kind].total || 0,
  showSizeChanger: true,
  pageSizeOptions: ['10', '50', '100'],
})
</script>
<template>
  <main class="comparison-view">
    <header class="comparison-toolbar">
      <h1>{{ t('proto.compareRevisions') }}</h1>
      <a-button :disabled="!state.data.value || !!state.pageError.value" @click="state.copyLink">{{
        t('proto.compareCopyLink')
      }}</a-button>
    </header>
    <a-alert type="info" :message="t('proto.compareHint')" show-icon />
    <load-state
      :loading="state.loading.value && !state.data.value"
      :error="state.error.value"
      @retry="state.load"
    >
      <template v-if="state.data.value">
        <a-alert
          v-if="state.pageError.value"
          type="error"
          :message="state.pageError.value"
          show-icon
        />
        <div class="comparison-panes">
          <section
            v-for="side in sides"
            :key="side"
            class="comparison-pane panel"
            :data-pane="side"
            :aria-label="t(side === 'left' ? 'proto.compareLeft' : 'proto.compareRight')"
          >
            <header class="comparison-meta">
              <h2>{{ t(side === 'left' ? 'proto.compareLeft' : 'proto.compareRight') }}</h2>
              <strong>{{ state.data.value[side].versionName }}</strong>
              <code class="comparison-rid">{{ state.data.value[side].id }}</code>
              <time>{{ new Date(state.data.value[side].createdAt).toLocaleString() }}</time>
            </header>
            <a-alert v-if="state.pageError.value" type="error" :message="state.pageError.value" />
            <a-alert
              v-else-if="!state.selection.value.pages[side]"
              type="info"
              :message="t('proto.compareMissingPage')"
            />
            <a-alert
              v-else-if="!state.selection.value.pages[side]?.pageId"
              type="warning"
              :message="t('proto.compareLegacyPage')"
            />
            <a-alert
              v-else-if="state.panes[side].error"
              :type="state.panes[side].expired ? 'warning' : 'error'"
              :message="state.panes[side].error"
              show-icon
            >
              <template #action
                ><a-button @click="state.authorize(side)">{{
                  t('proto.reauthorizePreview')
                }}</a-button></template
              >
            </a-alert>
            <load-state v-else :loading="state.panes[side].loading">
              <div v-if="state.contexts.value[side]" class="comparison-workspace">
                <prototype-workspace :context="state.contexts.value[side]!" :pane="side" compact />
              </div>
            </load-state>
          </section>
        </div>
        <a-checkbox
          :checked="state.includeUnchanged.value"
          :disabled="state.loading.value"
          @change="(event) => state.toggleUnchanged(event.target.checked)"
          >{{ t('proto.compareIncludeUnchanged') }}</a-checkbox
        >
        <a-tabs>
          <a-tab-pane key="pages" :tab="t('proto.comparePages')">
            <section :aria-label="t('proto.comparePages')">
              <p class="comparison-summary">
                {{ t('proto.compareSummary', state.data.value.summary.pages) }}
              </p>
              <data-table
                :rows="pageRows"
                :columns="pageColumns"
                :pagination="pagination('pages')"
                :loading="state.loading.value"
                @page="(page, size) => state.changePage('pages', page, size)"
              >
                <template #cell="{ record, column }">
                  <text-ellipsis v-if="column.dataIndex === 'path'" :text="record.path" />
                  <a-tag v-else-if="column.dataIndex === 'status'" :color="colors[record.status]">{{
                    t(`proto.${statuses[record.status]}`)
                  }}</a-tag>
                  <a-button
                    v-else-if="column.key === 'actions'"
                    @click="state.selectPage(record)"
                    >{{ t('proto.compareOpenPage') }}</a-button
                  >
                  <template v-else>{{
                    record[column.dataIndex === 'left' ? 'left' : 'right']?.name ||
                    t('proto.compareNoSide')
                  }}</template>
                </template>
              </data-table>
            </section>
          </a-tab-pane>
          <a-tab-pane key="files" :tab="t('proto.compareFiles')">
            <section :aria-label="t('proto.compareFiles')">
              <p class="comparison-summary">
                {{ t('proto.compareSummary', state.data.value.summary.files) }}
              </p>
              <data-table
                :rows="fileRows"
                :columns="commonColumns"
                :pagination="pagination('files')"
                :loading="state.loading.value"
                @page="(page, size) => state.changePage('files', page, size)"
              >
                <template #cell="{ record, column }">
                  <text-ellipsis v-if="column.dataIndex === 'path'" :text="record.path" />
                  <a-tag v-else-if="column.dataIndex === 'status'" :color="colors[record.status]">{{
                    t(`proto.${statuses[record.status]}`)
                  }}</a-tag>
                  <template v-else>
                    <template v-if="record[column.dataIndex === 'left' ? 'left' : 'right']">
                      <code class="comparison-hash">{{
                        record[column.dataIndex === 'left' ? 'left' : 'right']!.sha256
                      }}</code>
                      <span
                        >{{ record[column.dataIndex === 'left' ? 'left' : 'right']!.size }}
                        {{ t('proto.compareSize') }}</span
                      >
                    </template>
                    <template v-else>{{ t('proto.compareNoSide') }}</template>
                  </template>
                </template>
              </data-table>
            </section>
          </a-tab-pane>
        </a-tabs>
      </template>
    </load-state>
  </main>
</template>
<style scoped>
.comparison-view {
  padding: var(--space-4);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  min-width: 0;
}
.comparison-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.comparison-toolbar h1,
.comparison-meta h2 {
  margin: 0;
}
.comparison-panes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.comparison-pane {
  min-width: 0;
  overflow: hidden;
}
.comparison-meta {
  display: grid;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
}
.comparison-rid,
.comparison-hash {
  overflow-wrap: anywhere;
}
.comparison-hash {
  display: block;
}
.comparison-workspace {
  height: 620px;
}
.comparison-workspace :deep(.workspace) {
  height: 100%;
}
.comparison-workspace :deep(.workspace-current) {
  flex-wrap: wrap;
}
.comparison-summary {
  margin-bottom: var(--space-3);
}
@media (width <= 1000px) {
  .comparison-panes {
    grid-template-columns: minmax(0, 1fr);
  }
  .comparison-workspace {
    height: 500px;
  }
}
</style>
