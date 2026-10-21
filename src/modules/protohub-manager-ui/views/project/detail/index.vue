<script setup lang="ts">
defineOptions({ name: 'ProjectDetailView' })
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Space as ASpace, Tag as ATag, Alert as AAlert } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  EyeOutlined,
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
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import UploadDialog from '@/modules/protohub-manager-ui/views/project/components/UploadDialog.vue'
import CapacityNotice from '@/modules/protohub-manager-ui/views/project/components/CapacityNotice.vue'
import ShareDialog from '@/modules/protohub-manager-ui/views/project/components/ShareDialog.vue'
import { projectListLocation } from '@/modules/protohub-manager-ui/utils/project-navigation'
import { useSession } from '@/app/stores/session'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import ProjectMembersDialog from '@/modules/protohub-manager-ui/views/project/components/ProjectMembersDialog.vue'
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
  uploadOpen,
  uploadContext,
  shareVersion,
  membersOpen,
  upload,
  preview,
  remove,
} = useProjectDetail()
const columns = computed(() => [
  { title: t('proto.versionName'), dataIndex: 'versionName' },
  { title: t('common.description'), dataIndex: 'description' },
  { title: t('common.status'), dataIndex: 'status' },
  { title: t('common.createdAt'), dataIndex: 'createdAt' },
  { title: t('common.actions'), key: 'actions', width: 184 },
])
</script>
<template>
  <page-container
    :title="resource.data.value.project?.name || t('proto.versions')"
    back
    @back="router.push(projectListLocation(router, session.menus, route.query))"
    ><template #actions
      ><a-space
        ><permission-button
          v-if="projectAllows(resource.data.value.project, 'manageMembers')"
          :permission="p.project.save"
          :aria-label="t('proto.members')"
          @click="membersOpen = true"
          ><team-outlined />{{ t('proto.members') }}</permission-button
        ><permission-button
          v-if="projectAllows(resource.data.value.project, 'edit')"
          :permission="p.version.save"
          type="primary"
          :disabled="!resource.data.value.project || usage.data.value?.versions.canCreate === false"
          @click="upload()"
          >{{ t('proto.upload') }}</permission-button
        ></a-space
      ></template
    ><a-alert
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
        /><data-table :rows="resource.data.value.versions" :columns="columns"
          ><template #cell="{ column, record }"
            ><a-space v-if="column.key === 'actions'" :size="8">
              <action-button
                v-if="projectAllows(resource.data.value.project, 'read')"
                :label="t('proto.preview')"
                :icon="EyeOutlined"
                :permission="p.version.query"
                :disabled="record.status !== 'ready'"
                @action="preview(record)"
              />
              <action-button
                v-if="projectAllows(resource.data.value.project, 'edit')"
                :label="t('proto.update')"
                :icon="UploadOutlined"
                :permission="p.version.save"
                @action="upload(record)"
              />
              <action-button
                v-if="projectAllows(resource.data.value.project, 'manageShares')"
                :label="t('proto.share')"
                :icon="ShareAltOutlined"
                :permission="p.share.query"
                :disabled="record.status !== 'ready'"
                @action="shareVersion = record"
              />
              <action-button
                v-if="projectAllows(resource.data.value.project, 'edit')"
                :label="t('common.delete')"
                :icon="DeleteOutlined"
                :permission="p.version.delete"
                danger
                :disabled="task.busy.value"
                :confirm="t('common.confirmDelete')"
                @action="remove(record.id)"
              /> </a-space
            ><a-tag
              v-else-if="column.dataIndex === 'status'"
              :color="record.status === 'ready' ? 'green' : 'red'"
              >{{ t(`proto.${record.status}`) }}</a-tag
            ><text-ellipsis
              v-else-if="column.dataIndex === 'description'"
              :text="record.description"
            /><template v-else-if="column.dataIndex === 'createdAt'">{{
              new Date(record.createdAt).toLocaleString()
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
      @changed="refresh"
  /></page-container>
</template>
<style scoped>
.project-versions-panel {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
</style>
