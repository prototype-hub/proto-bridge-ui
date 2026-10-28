<script setup lang="ts">
defineOptions({ name: 'ProjectsView' })
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { computed, toRef } from 'vue'
import {
  Pagination as APagination,
  Card as ACard,
  Space as ASpace,
  Alert as AAlert,
} from 'ant-design-vue'
import {
  ClockCircleOutlined,
  UndoOutlined,
  DeleteOutlined,
  EditOutlined,
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
import { recycleListLocation } from '@/modules/protohub-manager-ui/utils/project-navigation'
import { useSession } from '@/app/stores/session'
const props = withDefaults(defineProps<{ recycled?: boolean; embedded?: boolean }>(), {
  recycled: false,
  embedded: false,
})
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const session = useSession()
const {
  resource,
  trash,
  restoredProject,
  restore,
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
} = useProjects(toRef(props, 'recycled'))
const versionRecycle = computed(() =>
  restoredProject.value
    ? recycleListLocation(router, session.menus, restoredProject.value.id)
    : undefined,
)
function openDetail(id: string) {
  void router.push({ name: 'project-detail', params: { id }, query: { ...route.query } })
}
</script>
<template>
  <component
    :is="embedded ? 'section' : PageContainer"
    :title="embedded ? undefined : t(trash ? 'proto.projectRecycleBin' : 'proto.projects')"
    ><template #actions
      ><permission-button
        v-if="!trash"
        :permission="p.project.save"
        type="primary"
        :disabled="trash || usage.data.value?.projects.canCreate === false"
        @click="edit()"
        >{{ t('proto.newProject') }}</permission-button
      ></template
    >
    <a-alert v-if="trash" type="info" show-icon :message="t('proto.recycleHint')" />
    <a-alert
      v-if="trash && restoredProject"
      type="success"
      show-icon
      :message="t('proto.projectRestored')"
    >
      <template #action
        ><permission-button
          v-if="versionRecycle"
          :permission="p.version.query"
          @click="router.push(versionRecycle)"
          >{{ t('proto.openVersionRecycle') }}</permission-button
        ></template
      >
    </a-alert>
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
    <div v-if="!resource.loading.value && !resource.error.value" class="list-heading">
      <h2>{{ t(trash ? 'proto.projectRecycleBin' : 'proto.projectListTitle') }}</h2>
      <span class="muted">{{ t('proto.listResults', { count: pagination.total }) }}</span>
    </div>
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
          :role="trash ? undefined : 'link'"
          :tabindex="trash ? undefined : 0"
          :aria-label="`${t('common.detail')}：${project.name}`"
          @click="!trash && openDetail(project.id)"
          @keydown.enter.self.prevent="!trash && openDetail(project.id)"
          @keydown.space.self.prevent="!trash && openDetail(project.id)"
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
                  :text="`${t(trash ? 'proto.deletedAt' : 'proto.updatedAt')}：${new Date(project.deletedTime || project.updatedAt).toLocaleString()}`"
                />
              </span>
              <a-space class="project-actions" :size="4" :wrap="false" @click.stop @keydown.stop>
                <action-button
                  v-if="trash && projectAllows(project, 'deleteProject')"
                  :label="t('proto.restore')"
                  :icon="UndoOutlined"
                  :permission="p.project.save"
                  :disabled="task.busy.value"
                  :confirm="t('proto.projectRestoreConfirm')"
                  @action="restore(project)"
                />
                <router-link
                  v-if="!trash"
                  class="project-open"
                  :aria-label="`${t('proto.openProject')}：${project.name}`"
                  :to="{
                    name: 'project-detail',
                    params: { id: project.id },
                    query: { ...route.query },
                  }"
                  >{{ t('proto.openProject') }}</router-link
                >
                <action-button
                  v-if="!trash && projectAllows(project, 'edit')"
                  :label="t('common.edit')"
                  :icon="EditOutlined"
                  :permission="p.project.save"
                  @action="edit(project)"
                />
                <action-button
                  v-if="!trash && projectAllows(project, 'deleteProject')"
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
  /></component>
</template>
<style scoped>
.list-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.list-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.project-pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
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
  font-weight: 600;
  font-size: 16px;
  text-align: left;
  overflow-wrap: anywhere;
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
  flex-wrap: wrap;
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
.project-open {
  padding: var(--space-1) var(--space-2);
  text-underline-offset: 3px;
}
.project-actions {
  flex: 0 0 auto;
  margin-inline-start: auto;
}
@media (max-width: 575px) {
  .project-updated {
    overflow: hidden;
  }
}
</style>
