<script setup lang="ts">
defineOptions({ name: 'RecycleView' })
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Tabs as ATabs,
  TabPane as ATabPane,
} from 'ant-design-vue'
import { UndoOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { useVersionRecycle } from './hooks/useVersionRecycle'
import ProjectsView from '@/modules/protohub-manager-ui/views/project/index.vue'
import PrototypeListToolbar from '@/modules/protohub-manager-ui/views/project/components/PrototypeListToolbar.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import LoadState from '@/shared/components/LoadState.vue'
import DataTable from '@/shared/components/DataTable.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import ActionButton from '@/shared/components/ActionButton.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const permissions = usePermissions()
const canProjects = computed(() => permissions.can(p.project.query))
const canVersions = computed(() => permissions.can(p.version.query))
const activeTab = computed(() =>
  route.query.tab === 'versions' && canVersions.value
    ? 'versions'
    : canProjects.value
      ? 'projects'
      : canVersions.value
        ? 'versions'
        : undefined,
)
const projectId = computed(() => {
  const value = route.query.projectId
  if (value === undefined) return undefined
  // Malformed, repeated or empty filters cannot silently broaden a selected-project query.
  return typeof value === 'string' &&
    value.length > 0 &&
    value.trim().length > 0 &&
    value.length <= 128 &&
    Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    ? value
    : null
})
const versions = useVersionRecycle(
  projectId,
  computed(() => activeTab.value === 'versions'),
)
function selectTab(value: string | number) {
  const tab = value === 'versions' ? 'versions' : 'projects'
  void router.replace({ query: { ...route.query, tab } })
}
function clearProjectFilter() {
  const query = { ...route.query }
  delete query.projectId
  void router.replace({ query })
}
const columns = computed(() => [
  { title: t('proto.versionName'), dataIndex: 'versionName' },
  { title: t('proto.projectIdentifier'), dataIndex: 'projectId' },
  { title: t('common.description'), dataIndex: 'description' },
  { title: t('proto.deletedAt'), dataIndex: 'deletedTime', width: 180 },
  { title: t('common.actions'), key: 'actions', width: 96 },
])
</script>
<template>
  <page-container :title="t('proto.recycleBin')">
    <a-tabs v-if="activeTab" :active-key="activeTab" @change="selectTab">
      <a-tab-pane v-if="canProjects" key="projects" :tab="t('proto.projectRecycleBin')">
        <projects-view v-if="activeTab === 'projects'" recycled embedded />
      </a-tab-pane>
      <a-tab-pane v-if="canVersions" key="versions" :tab="t('proto.versionRecycleBin')">
        <section v-if="activeTab === 'versions'" class="stack version-recycle-panel">
          <a-alert type="info" show-icon :message="t('proto.recycleHint')" />
          <a-alert type="info" show-icon :message="t('proto.versionRecycleScope')" />
          <a-alert
            v-if="route.query.projectId !== undefined"
            type="info"
            :message="
              projectId
                ? t('proto.recycleProjectFilter', { id: projectId })
                : t('proto.recycleFilterInvalid')
            "
            class="version-recycle-filter"
            ><template #action
              ><a-button @click="clearProjectFilter">{{
                t('proto.allRecycleProjects')
              }}</a-button></template
            ></a-alert
          >
          <prototype-list-toolbar
            v-model:keyword="versions.keyword.value"
            :sort="versions.sort.value"
            :loading="versions.resource.loading.value"
            @search="versions.search"
            @reset="versions.reset"
            @sort="versions.changeSort"
            @refresh="versions.resource.load"
          />
          <a-alert
            v-if="versions.task.error.value"
            type="error"
            :message="versions.task.error.value"
          />
          <load-state
            :loading="versions.resource.loading.value"
            :error="versions.resource.error.value"
            :empty="!versions.resource.data.value.length"
            @retry="versions.resource.load"
          >
            <data-table
              :rows="versions.resource.data.value"
              :columns="columns"
              :pagination="versions.pagination"
              @page="versions.page"
              ><template #cell="{ column, record }">
                <action-button
                  v-if="column.key === 'actions'"
                  :label="t('proto.restore')"
                  :icon="UndoOutlined"
                  :permission="p.version.save"
                  :disabled="versions.task.busy.value"
                  :confirm="t('proto.versionRestoreConfirm')"
                  @action="versions.restore(record)"
                />
                <template v-else-if="column.dataIndex === 'deletedTime'">{{
                  new Date(record.deletedTime!).toLocaleString()
                }}</template>
                <text-ellipsis
                  v-else
                  :text="String(record[column.dataIndex as keyof typeof record] || '')"
                /> </template
            ></data-table>
          </load-state>
        </section>
      </a-tab-pane>
    </a-tabs>
    <a-alert v-else type="error" show-icon :message="t('proto.recycleUnavailable')" />
  </page-container>
</template>
<style scoped>
.version-recycle-panel {
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  max-width: 100%;
}
.version-recycle-filter :deep(.ant-alert-content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (width <= 600px) {
  .version-recycle-filter {
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .version-recycle-filter :deep(.ant-alert-action) {
    margin-inline-start: auto;
  }
}
</style>
