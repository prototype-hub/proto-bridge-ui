<script setup lang="ts">
defineOptions({ name: 'ProjectsView' })
import { useRoute, useRouter } from 'vue-router'
import {
  Pagination as APagination,
  Card as ACard,
  Space as ASpace,
  Alert as AAlert,
} from 'ant-design-vue'
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useProjects } from '@/modules/protohub-manager-ui/views/project/hooks/useProjects'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import PrototypeListToolbar from '@/modules/protohub-manager-ui/views/project/components/PrototypeListToolbar.vue'
import ProjectDialog from '@/modules/protohub-manager-ui/views/project/components/ProjectDialog.vue'
import CapacityNotice from '@/modules/protohub-manager-ui/views/project/components/CapacityNotice.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import LoadState from '@/shared/components/LoadState.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const {
  resource,
  usage,
  loadUsage,
  refresh,
  task,
  open,
  form,
  search,
  submitSearch,
  resetSearch,
  sort,
  changeSort,
  pagination,
  page,
  edit,
  save,
  remove,
} = useProjects()
function openDetail(id: string) {
  void router.push({ name: 'project-detail', params: { id }, query: { ...route.query } })
}
</script>
<template>
  <page-container :title="t('proto.projects')"
    ><template #actions
      ><permission-button
        :permission="p.project.save"
        type="primary"
        :disabled="usage.data.value?.projects.canCreate === false"
        @click="edit()"
        >{{ t('proto.newProject') }}</permission-button
      ></template
    >
    <prototype-list-toolbar
      v-model:keyword="search"
      :sort="sort"
      :loading="resource.loading.value"
      @search="submitSearch"
      @reset="resetSearch"
      @sort="changeSort"
      @refresh="refresh" />
    <capacity-notice
      :capacity="usage.data.value?.projects"
      :loading="usage.loading.value"
      :error="usage.error.value"
      kind="projects"
      @retry="loadUsage" />
    <a-alert v-if="task.error.value" type="error" :message="task.error.value" /><load-state
      :loading="resource.loading.value"
      :error="resource.error.value"
      :empty="!resource.data.value.length"
      @retry="resource.load"
      ><div class="project-grid">
        <a-card
          v-for="project in resource.data.value"
          :key="project.id"
          class="project-card"
          hoverable
          role="link"
          tabindex="0"
          :aria-label="`${t('common.detail')}：${project.name}`"
          @click="openDetail(project.id)"
          @keydown.enter.self.prevent="openDetail(project.id)"
          @keydown.space.self.prevent="openDetail(project.id)"
          ><article class="project-card-content">
            <header class="project-card-header">
              <span class="project-icon" aria-hidden="true"><folder-open-outlined /></span
              ><span class="project-name">{{ project.name }}</span>
            </header>
            <div class="project-description">
              <text-ellipsis :text="project.description" />
            </div>
            <footer class="project-card-footer">
              <span class="project-updated muted">
                <clock-circle-outlined />
                <text-ellipsis
                  class="project-updated-text"
                  :text="`${t('proto.updatedAt')}：${new Date(project.updatedAt).toLocaleString()}`"
                />
              </span>
              <a-space class="project-actions" :size="4" :wrap="false" @click.stop @keydown.stop>
                <action-button
                  :label="t('common.detail')"
                  :icon="EyeOutlined"
                  @action="openDetail(project.id)"
                />
                <action-button
                  v-if="projectAllows(project, 'edit')"
                  :label="t('common.edit')"
                  :icon="EditOutlined"
                  :permission="p.project.save"
                  @action="edit(project)"
                />
                <action-button
                  v-if="projectAllows(project, 'deleteProject')"
                  :label="t('common.delete')"
                  :icon="DeleteOutlined"
                  :permission="p.project.delete"
                  danger
                  :disabled="task.busy.value"
                  :confirm="t('proto.projectDeleteConfirm')"
                  @action="remove(project.id)"
                />
              </a-space>
            </footer></article
        ></a-card></div
    ></load-state>
    <a-pagination
      v-if="pagination.total"
      v-bind="pagination"
      class="project-pagination"
      @change="page" />
    <project-dialog
      :open="open"
      :form="form"
      :busy="task.busy.value"
      :error="task.error.value"
      @close="open = false"
      @save="save"
  /></page-container>
</template>
<style scoped>
.project-pagination {
  margin-top: var(--space-4);
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: var(--space-4);
  min-width: 0;
}
.project-card {
  height: 100%;
  overflow: hidden;
  border-color: var(--color-border);
  cursor: pointer;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.project-card:hover {
  border-color: #91caff;
  box-shadow: 0 6px 18px rgb(0 0 0 / 8%);
}
.project-card:focus-visible {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(22 119 255 / 20%);
}
.project-card :deep(.ant-card-body) {
  height: 100%;
  padding: var(--space-4);
}
.project-card-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
  min-width: 0;
}
.project-card-header {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
}
.project-icon {
  display: inline-flex;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: var(--color-primary);
  font-size: 20px;
  background: #e6f4ff;
  border-radius: var(--radius);
}
.project-name {
  display: block;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  font-size: 16px;
  text-align: left;
  white-space: nowrap;
}
.project-description {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 0 var(--space-1);
  color: var(--color-muted);
}
.project-card-footer {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  gap: var(--space-2);
}
.project-updated {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: var(--space-1);
  font-size: var(--text-small);
}
.project-updated-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-actions {
  flex: 0 0 auto;
}
@media (max-width: 575px) {
  .project-updated {
    overflow: hidden;
  }
}
</style>
