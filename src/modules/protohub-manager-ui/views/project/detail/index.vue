<script setup lang="ts">
defineOptions({ name: 'ProjectDetailView' })
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Space as ASpace,
  Tag as ATag,
  Alert as AAlert,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  EyeOutlined,
  UndoOutlined,
  UploadOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  TeamOutlined,
  HistoryOutlined,
} from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import PageContainer from '@/shared/components/PageContainer.vue'
import LoadState from '@/shared/components/LoadState.vue'
import DataTable from '@/shared/components/DataTable.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import UploadDialog from '@/modules/protohub-manager-ui/views/project/components/UploadDialog.vue'
import PrototypeListToolbar from '@/modules/protohub-manager-ui/views/project/components/PrototypeListToolbar.vue'
import CapacityNotice from '@/modules/protohub-manager-ui/views/project/components/CapacityNotice.vue'
import ShareDialog from '@/modules/protohub-manager-ui/views/project/components/ShareDialog.vue'
import { projectListLocation } from '@/modules/protohub-manager-ui/utils/project-navigation'
import { useSession } from '@/app/stores/session'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import ProjectMembersDialog from '@/modules/protohub-manager-ui/views/project/components/ProjectMembersDialog.vue'
const RevisionHistoryDrawer = defineAsyncComponent(
  () => import('@/modules/protohub-manager-ui/views/project/components/RevisionHistoryDrawer.vue'),
)
const ReviewGuestsDrawer = defineAsyncComponent(
  () => import('@/modules/protohub-manager-ui/views/project/components/ReviewGuestsDrawer.vue'),
)
const reviewGuestsOpen = ref(false)
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const session = useSession()
const {
  resource,
  trash,
  restore,
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
  },
)
const columns = computed(() => [
  { title: t('proto.versionName'), dataIndex: 'versionName' },
  { title: t('common.description'), dataIndex: 'description' },
  { title: t('common.status'), dataIndex: 'status' },
  { title: t('proto.revision'), dataIndex: 'revisionCount' },
  {
    title: t(trash.value ? 'proto.deletedAt' : 'common.createdAt'),
    dataIndex: trash.value ? 'deletedTime' : 'createdAt',
  },
  { title: t('common.actions'), key: 'actions', width: 224 },
])
</script>
<template>
  <page-container
    :title="resource.data.value.project?.name || t('proto.versions')"
    back
    @back="router.push(projectListLocation(router, session.menus, route.query))"
    ><template #actions
      ><a-space wrap
        ><permission-button
          v-if="!trash && projectAllows(resource.data.value.project, 'manageShares')"
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
        ><permission-button
          v-if="!trash && projectAllows(resource.data.value.project, 'edit')"
          :permission="p.version.save"
          type="primary"
          :disabled="!resource.data.value.project || usage.data.value?.versions.canCreate === false"
          @click="upload()"
          >{{ t('proto.upload') }}</permission-button
        ></a-space
      ></template
    >
    <a-radio-group
      v-if="projectAllows(resource.data.value.project, 'edit')"
      v-model:value="trash"
      class="prototype-list-mode"
      :aria-label="t('proto.listMode')"
    >
      <a-radio-button :value="false">{{ t('proto.activeVersions') }}</a-radio-button>
      <a-radio-button :value="true">{{ t('proto.recycleBin') }}</a-radio-button>
    </a-radio-group>
    <a-alert v-if="trash" type="info" show-icon :message="t('proto.recycleHint')" />
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
      :message="t('proto.claimRequired')" /><capacity-notice
      :capacity="usage.data.value?.versions"
      :loading="usage.loading.value"
      :error="usage.error.value"
      kind="versions"
      @retry="loadUsage" /><load-state
      :loading="resource.loading.value"
      :error="resource.error.value"
      @retry="resource.load"
      ><div class="panel stack project-versions-panel">
        <text-ellipsis :text="resource.data.value.project?.description" /><a-alert
          v-if="task.error.value"
          type="error"
          :message="task.error.value"
        /><a-alert
          v-if="resource.data.value.versions.some((version) => version.migrationRequired)"
          type="warning"
          show-icon
          :message="t('proto.revisionMigrationRequired')"
        /><data-table
          :rows="resource.data.value.versions"
          :columns="columns"
          :pagination="pagination"
          @page="page"
          ><template #cell="{ column, record }"
            ><a-space v-if="column.key === 'actions'" :size="8">
              <action-button
                v-if="trash && projectAllows(resource.data.value.project, 'edit')"
                :label="t('proto.restore')"
                :icon="UndoOutlined"
                :permission="p.version.save"
                :disabled="task.busy.value"
                :confirm="t('proto.versionRestoreConfirm')"
                @action="restore(record.id)"
              />
              <action-button
                v-if="!trash && projectAllows(resource.data.value.project, 'read')"
                :label="t('proto.preview')"
                :icon="EyeOutlined"
                :permission="p.version.query"
                :disabled="record.status !== 'ready' || record.migrationRequired"
                @action="preview(record)"
              />
              <action-button
                v-if="!trash && projectAllows(resource.data.value.project, 'read')"
                :label="t('proto.revisionHistory')"
                :icon="HistoryOutlined"
                :permission="p.version.query"
                :disabled="record.migrationRequired"
                @action="historyVersion = record"
              />
              <action-button
                v-if="!trash && projectAllows(resource.data.value.project, 'edit')"
                :label="t('proto.update')"
                :icon="UploadOutlined"
                :permission="p.version.save"
                :disabled="record.migrationRequired"
                @action="upload(record)"
              />
              <action-button
                v-if="!trash && projectAllows(resource.data.value.project, 'manageShares')"
                :label="t('proto.share')"
                :icon="ShareAltOutlined"
                :permission="p.share.query"
                :disabled="record.status !== 'ready' || record.migrationRequired"
                @action="shareVersion = record"
              />
              <action-button
                v-if="!trash && projectAllows(resource.data.value.project, 'edit')"
                :label="t('common.delete')"
                :icon="DeleteOutlined"
                :permission="p.version.delete"
                danger
                :disabled="task.busy.value"
                :confirm="t('proto.versionDeleteConfirm')"
                @action="remove(record.id)"
              /> </a-space
            ><a-tag
              v-else-if="column.dataIndex === 'status'"
              :color="
                record.migrationRequired ? 'orange' : record.status === 'ready' ? 'green' : 'red'
              "
              >{{
                t(record.migrationRequired ? 'proto.revisionMigration' : `proto.${record.status}`)
              }}</a-tag
            ><template v-else-if="column.dataIndex === 'revisionCount'">
              {{
                record.migrationRequired
                  ? '—'
                  : t('proto.revisionCount', { count: record.revisionCount })
              }} </template
            ><text-ellipsis
              v-else-if="column.dataIndex === 'description'"
              :text="record.description"
            /><template
              v-else-if="column.dataIndex === 'createdAt' || column.dataIndex === 'deletedTime'"
              >{{
                new Date(
                  column.dataIndex === 'deletedTime' ? record.deletedTime! : record.createdAt,
                ).toLocaleString()
              }}</template
            ><template v-else>{{
              record[column.dataIndex as keyof typeof record]
            }}</template></template
          ></data-table
        >
      </div></load-state
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
      @preview="preview"
  /></page-container>
</template>
<style scoped>
.prototype-list-mode {
  margin-bottom: var(--space-4);
}
.project-versions-panel {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
</style>
