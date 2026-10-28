<script setup lang="ts">
import { computed, defineAsyncComponent, toRef, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Drawer as ADrawer,
  Button as AButton,
  Tag as ATag,
  Checkbox as ACheckbox,
} from 'ant-design-vue'
import { FileSearchOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePermissions } from '@/shared/auth/provider'
import type { Project, Revision, Version } from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { useRevisions } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisions'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'

const props = defineProps<{ version?: Version; project?: Project }>()
const RevisionQualityDrawer = defineAsyncComponent(() => import('./RevisionQualityDrawer.vue'))
const emit = defineEmits<{
  close: []
  preview: [version: Version, revisionId: string]
  workItems: [version: Version, revision: Revision]
}>()
const { t } = useI18n()
const permissions = usePermissions()
const open = computed(
  () =>
    !!props.version &&
    projectAllows(props.project, 'read') &&
    props.version.projectId === props.project?.id &&
    permissions.can(p.version.query),
)
const state = useRevisions(toRef(props, 'version'), open)
const router = useRouter()
const selected = ref<string[]>([])
const qualityRevision = shallowRef<Revision>()
// Selection survives cursor appends, but cannot cross a closed or replaced version scope.
watch(
  () => [open.value, props.version?.id],
  () => {
    selected.value = []
    qualityRevision.value = undefined
  },
)
function select(id: string, checked: boolean) {
  selected.value = checked
    ? [...selected.value, id].slice(0, 2)
    : selected.value.filter((value) => value !== id)
}
function compare() {
  if (!open.value || selected.value.length !== 2 || !props.version) return
  window.open(
    applicationUrl(
      router,
      router.resolve({
        name: 'PrototypeHub-revision-compare',
        params: { projectId: props.version.projectId, versionId: props.version.id },
        query: { leftRevisionId: selected.value[0], rightRevisionId: selected.value[1] },
      }).fullPath,
    ),
    '_blank',
    'noopener,noreferrer',
  )
}
const columns = computed(() => [
  { title: t('proto.compareSelect'), key: 'select', width: 48 },
  { title: t('proto.revision'), dataIndex: 'id' },
  { title: t('common.actions'), key: 'actions', width: 240 },
])
</script>
<template>
  <a-drawer
    root-class-name="revision-history-drawer"
    :open="open"
    :title="t('proto.revisionHistory')"
    width="min(800px, 100vw)"
    @close="emit('close')"
  >
    <section role="dialog" aria-modal="true" :aria-label="t('proto.revisionHistory')" class="stack">
      <header class="history-context">
        <strong>{{ version?.versionName }}</strong>
        <p class="muted">{{ t('proto.historyFixedContext') }}</p>
      </header>
      <div class="history-compare-bar">
        <span aria-live="polite">{{
          t('proto.compareSelectedCount', { count: selected.length })
        }}</span>
        <a-button type="primary" :disabled="selected.length !== 2 || !open" @click="compare">{{
          t('proto.compareRevisions')
        }}</a-button>
      </div>
      <details class="history-help">
        <summary>{{ t('proto.feedbackHelp') }}</summary>
        <p class="muted">
          {{ t('proto.revisionHistoryHint') }} {{ t('proto.compareSelectionHint') }}
        </p>
      </details>
      <load-state
        :loading="state.loading.value && !state.rows.value.length"
        :error="state.error.value"
        :empty="!state.rows.value.length"
        @retry="state.load()"
      >
        <data-table class="history-table" :rows="state.rows.value" :columns="columns">
          <template #cell="{ record, column }">
            <a-checkbox
              v-if="column.key === 'select'"
              :aria-label="t('proto.selectRevision', { id: record.id })"
              :checked="selected.includes(record.id)"
              :disabled="selected.length === 2 && !selected.includes(record.id)"
              @change="(event) => select(record.id, event.target.checked)"
            />
            <div v-else-if="column.dataIndex === 'id'" class="history-revision">
              <div class="history-revision-title">
                <text-ellipsis :text="record.id" /><a-tag
                  v-if="record.id === version?.currentRevisionId"
                  color="green"
                  >{{ t('proto.currentRevision') }}</a-tag
                >
              </div>
              <span class="muted history-numbers"
                >{{ new Date(record.createdAt).toLocaleString() }} ·
                {{ t('proto.historyFileCount', { count: record.fileCount }) }} ·
                {{ (record.totalBytes / 1024 / 1024).toFixed(2) }} MiB</span
              >
              <p v-if="record.description" class="muted">{{ record.description }}</p>
            </div>
            <div v-else-if="column.key === 'actions'" class="history-actions">
              <permission-button
                :permission="p.version.query"
                :aria-label="t('proto.preview')"
                @click="version && emit('preview', version, record.id)"
                >{{ t('proto.preview') }}</permission-button
              >
              <permission-button
                :permission="p.version.query"
                @click="version && emit('workItems', version, record)"
                >{{ t('proto.workItems') }}</permission-button
              >
              <action-button
                :label="t('proto.qualityCheck')"
                :icon="FileSearchOutlined"
                :permission="p.version.query"
                @action="qualityRevision = record"
              />
            </div>
          </template>
        </data-table>
        <a-button
          v-if="state.hasMore.value"
          :loading="state.loading.value"
          @click="state.load(true)"
        >
          {{ t('proto.loadMoreRevisions') }}
        </a-button>
      </load-state>
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-drawer>
  <revision-quality-drawer
    v-if="qualityRevision"
    :revision="qualityRevision"
    :allowed="open"
    @close="qualityRevision = undefined"
  />
</template>

<style scoped>
.history-context {
  display: grid;
  gap: var(--space-2);
}
.history-context strong {
  font-size: 18px;
  overflow-wrap: anywhere;
}
.history-context p,
.history-help p,
.history-revision p {
  margin: 0;
  overflow-wrap: anywhere;
}
.history-compare-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.history-help summary {
  width: fit-content;
  cursor: pointer;
  color: var(--color-muted);
}
.history-help summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.history-help p {
  margin-top: var(--space-2);
}
.history-revision {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}
.history-revision-title,
.history-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.history-revision-title > :first-child {
  max-width: 100%;
}
.history-numbers {
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
@media (width <= 575px) {
  .history-table :deep(.ant-table-content) {
    overflow: visible !important;
  }
  .history-table :deep(table) {
    display: block;
    width: 100% !important;
    min-width: 0 !important;
  }
  .history-table :deep(colgroup),
  .history-table :deep(thead) {
    display: none;
  }
  .history-table :deep(tbody) {
    display: block;
  }
  .history-table :deep(.ant-table-row) {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: var(--space-2);
    padding-block: var(--space-4);
    border-top: 1px solid var(--color-border);
  }
  .history-table :deep(.ant-table-row > td) {
    display: block;
    padding: 0;
    border: 0;
  }
  .history-table :deep(.ant-table-row > td:last-child) {
    grid-column: 2;
  }
}
</style>
