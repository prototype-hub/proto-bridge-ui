<script setup lang="ts">
defineOptions({ name: 'ProjectDetailView' })
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Space as ASpace, Tag as ATag, Alert as AAlert } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  UploadOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import PageContainer from '@/shared/components/PageContainer.vue'
import LoadState from '@/shared/components/LoadState.vue'
import DataTable from '@/shared/components/DataTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import UploadDialog from '@/modules/protohub-manager-ui/views/project/components/UploadDialog.vue'
import PrototypeListToolbar from '@/modules/protohub-manager-ui/views/project/components/PrototypeListToolbar.vue'
import CapacityNotice from '@/modules/protohub-manager-ui/views/project/components/CapacityNotice.vue'
import ShareDialog from '@/modules/protohub-manager-ui/views/project/components/ShareDialog.vue'
import { projectListLocation } from '@/modules/protohub-manager-ui/utils/project-navigation'
import { useSession } from '@/app/stores/session'
import type { Revision, Version } from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import ProjectMembersDialog from '@/modules/protohub-manager-ui/views/project/components/ProjectMembersDialog.vue'
const RevisionHistoryDrawer = defineAsyncComponent(
  () => import('@/modules/protohub-manager-ui/views/project/components/RevisionHistoryDrawer.vue'),
)
const ReviewGuestsDrawer = defineAsyncComponent(
  () => import('@/modules/protohub-manager-ui/views/project/components/ReviewGuestsDrawer.vue'),
)
const WorkItemsDrawer = defineAsyncComponent(
  () => import('@/modules/protohub-manager-ui/views/project/components/WorkItemsDrawer.vue'),
)
const workItems = ref<{ version: Version; revision: Revision }>()
function openWorkItems(version: Version, revision: Revision) {
  historyVersion.value = undefined
  workItems.value = { version, revision }
}
async function closeWorkItems() {
  const versionId = workItems.value?.version.id
  workItems.value = undefined
  await nextTick()
  // The history trigger lived in a drawer that has closed; return to its version row.
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-version-history]'))
    .find((button) => button.dataset.versionHistory === versionId)
    ?.focus()
}
const reviewGuestsOpen = ref(false)
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const session = useSession()
const {
  resource,
  usage,
  loadUsage,
  refresh,
  task,
  search,
  submitSearch,
  resetSearch,
  sort,
  changeSort,
  pagination,
  page,
  uploadOpen,
  uploadContext,
  shareVersion,
  historyVersion,
  membersOpen,
  upload,
  preview,
  remove,
} = useProjectDetail()
// Navigation must not retain an open management scope from the previous project.
watch(
  () => resource.data.value.project?.id,
  () => {
    reviewGuestsOpen.value = false
    workItems.value = undefined
  },
)
const columns = computed(() => [
  { title: t('proto.versionName'), dataIndex: 'versionName' },
  { title: t('common.createdAt'), dataIndex: 'createdAt', width: 190 },
  { title: t('common.actions'), key: 'actions', width: 294 },
])
const creationAction = ref<HTMLElement>()
const listHeading = ref<HTMLElement>()
let returnToCreation = false
// A successful upload refreshes capacity before its disabled trigger can receive focus again.
watch(
  [uploadOpen, usage.loading, resource.loading],
  ([dialogOpen, loading, resourceLoading], [wasOpen]) => {
    if (wasOpen && !dialogOpen && !uploadContext.value.version) returnToCreation = true
    if (!returnToCreation || dialogOpen || loading || resourceLoading) return
    const button = creationAction.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    const target = button || listHeading.value
    if (!target) return
    returnToCreation = false
    target.focus()
  },
  { flush: 'post' },
)
</script>
<template>
  <page-container
    class="project-detail-page"
    :title="resource.data.value.project?.name || t('proto.versions')"
    back
    @back="router.push(projectListLocation(router, session.menus, route.query))"
    ><template #actions
      ><a-space wrap
        ><permission-button
          v-if="projectAllows(resource.data.value.project, 'manageShares')"
          :permission="p.share.query"
          :aria-label="t('proto.reviewGuests')"
          @click="reviewGuestsOpen = true"
          >{{ t('proto.reviewGuests') }}</permission-button
        ><permission-button
          v-if="projectAllows(resource.data.value.project, 'manageMembers')"
          :permission="p.project.save"
          :aria-label="t('proto.members')"
          @click="membersOpen = true"
          ><team-outlined />{{ t('proto.members') }}</permission-button
        ></a-space
      ></template
    >
    <p v-if="resource.data.value.project?.description" class="project-summary">
      {{ resource.data.value.project.description }}
    </p>
    <prototype-list-toolbar
      v-model:keyword="search"
      :sort="sort"
      :loading="resource.loading.value"
      @search="submitSearch"
      @reset="resetSearch"
      @sort="changeSort"
      @refresh="refresh" />
    <a-alert
      v-if="resource.data.value.project?.claimRequired"
      type="warning"
      show-icon
      :message="t('proto.claimRequired')" />
    <capacity-notice
      :capacity="usage.data.value?.versions"
      :loading="usage.loading.value"
      :error="usage.error.value"
      kind="versions"
      @retry="loadUsage"
    >
      <template #actions>
        <span ref="creationAction"
          ><permission-button
            v-if="projectAllows(resource.data.value.project, 'edit')"
            :permission="p.version.save"
            type="primary"
            :disabled="
              usage.loading.value ||
              !!usage.error.value ||
              usage.data.value?.versions.canCreate !== true
            "
            @click="upload()"
            >{{ t('proto.upload') }}</permission-button
          ></span
        >
      </template>
    </capacity-notice>
    <load-state
      :loading="resource.loading.value"
      :error="resource.error.value"
      @retry="resource.load"
      ><div class="panel stack project-versions-panel">
        <div class="version-list-heading">
          <h2 ref="listHeading" tabindex="-1">{{ t('proto.versions') }}</h2>
          <span class="muted">{{ t('proto.listResults', { count: pagination.total }) }}</span>
        </div>
        <a-alert v-if="task.error.value" type="error" :message="task.error.value" />
        <a-alert
          v-if="resource.data.value.versions.some((version) => version.migrationRequired)"
          type="warning"
          show-icon
          :message="t('proto.revisionMigrationRequired')"
        />
        <data-table
          class="version-table"
          :rows="resource.data.value.versions"
          :columns="columns"
          :pagination="pagination"
          @page="page"
          ><template #cell="{ column, record }">
            <div v-if="column.dataIndex === 'versionName'" class="version-summary">
              <strong class="version-name">{{ record.versionName }}</strong>
              <p v-if="record.description" class="version-description">{{ record.description }}</p>
              <div class="version-metadata">
                <a-tag
                  :color="
                    record.migrationRequired
                      ? 'orange'
                      : record.status === 'ready'
                        ? 'green'
                        : 'red'
                  "
                >
                  {{
                    t(
                      record.migrationRequired
                        ? 'proto.revisionMigration'
                        : `proto.${record.status}`,
                    )
                  }}
                </a-tag>
                <span v-if="!record.migrationRequired" class="muted">{{
                  t('proto.revisionCount', { count: record.revisionCount })
                }}</span>
              </div>
            </div>
            <span v-else-if="column.dataIndex === 'createdAt'" class="version-created">
              <span class="mobile-label">{{ t('common.createdAt') }} · </span
              >{{ new Date(record.createdAt).toLocaleString() }}
            </span>
            <div v-else-if="column.key === 'actions'" class="version-actions">
              <permission-button
                v-if="projectAllows(resource.data.value.project, 'read')"
                :permission="p.version.query"
                :aria-label="t('proto.preview')"
                :disabled="record.status !== 'ready' || record.migrationRequired"
                @click="preview(record)"
                >{{ t('proto.preview') }}</permission-button
              >
              <permission-button
                v-if="projectAllows(resource.data.value.project, 'read')"
                :permission="p.version.query"
                :aria-label="t('proto.revisionHistory')"
                :data-version-history="record.id"
                :disabled="record.migrationRequired"
                @click="historyVersion = record"
                >{{ t('proto.revisionHistory') }}</permission-button
              >
              <details
                v-if="
                  projectAllows(resource.data.value.project, 'edit') ||
                  projectAllows(resource.data.value.project, 'manageShares')
                "
                class="version-management"
              >
                <summary>{{ t('proto.manageVersion') }}</summary>
                <a-space :size="4">
                  <action-button
                    v-if="projectAllows(resource.data.value.project, 'edit')"
                    :label="t('proto.update')"
                    :icon="UploadOutlined"
                    :permission="p.version.save"
                    :disabled="record.migrationRequired"
                    @action="upload(record)"
                  />
                  <action-button
                    v-if="projectAllows(resource.data.value.project, 'manageShares')"
                    :label="t('proto.share')"
                    :icon="ShareAltOutlined"
                    :permission="p.share.query"
                    :disabled="record.status !== 'ready' || record.migrationRequired"
                    @action="shareVersion = record"
                  />
                  <action-button
                    v-if="projectAllows(resource.data.value.project, 'edit')"
                    :label="t('common.delete')"
                    :icon="DeleteOutlined"
                    :permission="p.version.delete"
                    danger
                    :disabled="task.busy.value"
                    :confirm="t('proto.versionDeleteConfirm')"
                    @action="remove(record.id)"
                  />
                </a-space>
              </details>
            </div>
          </template>
        </data-table></div></load-state
    ><upload-dialog
      :open="uploadOpen"
      :context="uploadContext"
      @close="uploadOpen = false"
      @uploaded="refresh" /><share-dialog
      :project="resource.data.value.project"
      :version="shareVersion"
      @close="shareVersion = undefined" /><project-members-dialog
      :open="membersOpen"
      :project="resource.data.value.project"
      @close="membersOpen = false"
      @changed="refresh" /><review-guests-drawer
      v-if="reviewGuestsOpen"
      :open="reviewGuestsOpen"
      :project="resource.data.value.project"
      @close="reviewGuestsOpen = false" /><revision-history-drawer
      v-if="historyVersion"
      :project="resource.data.value.project"
      :version="historyVersion"
      @close="historyVersion = undefined"
      @work-items="openWorkItems"
      @preview="preview" /><work-items-drawer
      v-if="workItems"
      :project="resource.data.value.project"
      :version="workItems.version"
      :revision="workItems.revision"
      @close="closeWorkItems"
  /></page-container>
</template>
<style scoped>
.project-summary {
  margin: calc(-1 * var(--space-2)) 0 var(--space-4);
  color: var(--color-muted);
  overflow-wrap: anywhere;
  max-width: 75ch;
}
.project-versions-panel {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.version-list-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}
.version-list-heading h2 {
  margin: 0;
  font-size: 16px;
}
.version-summary {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.version-name {
  overflow-wrap: anywhere;
  font-size: 15px;
}
.version-description {
  margin: 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.version-metadata,
.version-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.version-created {
  color: var(--color-muted);
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
.mobile-label {
  display: none;
}
.version-management {
  width: 100%;
}
.version-management summary {
  width: fit-content;
  padding-block: var(--space-1);
  color: var(--color-muted);
  cursor: pointer;
  font-size: var(--text-small);
}
.version-management summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (width <= 767px) {
  .version-table :deep(.ant-table-content) {
    overflow: visible !important;
  }
  .version-table :deep(table) {
    display: block;
    width: 100% !important;
    min-width: 0 !important;
    table-layout: auto !important;
  }
  .version-table :deep(colgroup),
  .version-table :deep(thead) {
    display: none;
  }
  .version-table :deep(tbody) {
    display: block;
  }
  .version-table :deep(.ant-table-row) {
    display: block;
    padding-block: var(--space-4);
    border-top: 1px solid var(--color-border);
  }
  .version-table :deep(.ant-table-row > td) {
    display: block;
    padding: var(--space-1) 0;
    border: 0;
  }
  .version-actions {
    margin-top: var(--space-2);
  }
  .version-management {
    width: auto;
    margin-inline-start: auto;
  }
  .version-management[open] {
    width: 100%;
  }
  .mobile-label {
    display: inline;
  }
}
</style>
