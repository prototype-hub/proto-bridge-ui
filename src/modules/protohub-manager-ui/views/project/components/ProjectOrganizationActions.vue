<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Button as AButton,
  Modal as AModal,
  Form as AForm,
  FormItem as AFormItem,
  Alert as AAlert,
  Popconfirm as APopconfirm,
  Popover as APopover,
} from 'ant-design-vue'
import { StarOutlined, StarFilled, MoreOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/modules/protohub-manager-ui/types'
import { useProjectOrganization } from '../hooks/useProjectOrganization'
import ProjectLabelSelect from './ProjectLabelSelect.vue'
const props = defineProps<{ project: Project; blocked?: boolean }>()
const emit = defineEmits<{
  changed: [value: Project, kind: 'organization' | 'favorite']
  protect: [value: boolean]
}>()
const { t } = useI18n()
const state = useProjectOrganization(toRef(props, 'project'), (value, kind) =>
  emit('changed', value, kind),
)
watch(
  [state.open, state.busy, state.unknown, state.conflict],
  (values) => emit('protect', values.some(Boolean)),
  { immediate: true, flush: 'sync' },
)
const trigger = ref<HTMLButtonElement>(),
  menuOpen = ref(false)
function edit() {
  if (props.blocked) return
  menuOpen.value = false
  state.edit()
}
function canLeave() {
  if (!(state.dirty.value || state.unknown.value || state.busy.value)) return true
  return window.confirm(t('proto.discardOrganization'))
}
function close() {
  if (canLeave()) {
    state.open.value = false
    if (!state.unknown.value) state.clear()
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!canLeaveSilently()) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function canLeaveSilently() {
  return !(state.dirty.value || state.unknown.value || state.busy.value)
}
async function focusTrigger() {
  await nextTick()
  trigger.value?.focus()
}
watch(state.open, (open) => {
  if (!open) void focusTrigger()
})
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  emit('protect', false)
})
</script>
<template>
  <div class="project-organization-actions" :data-project-id="project.id" @click.stop @keydown.stop>
    <a-button
      v-if="state.canFavorite.value"
      class="project-favorite"
      type="text"
      :aria-label="t(project.favorite ? 'proto.unfavorite' : 'proto.favorite')"
      :aria-pressed="project.favorite"
      :loading="state.busy.value"
      :disabled="blocked || state.locked.value || state.conflict.value"
      @click="state.favorite()"
    >
      <template #icon><star-filled v-if="project.favorite" /><star-outlined v-else /></template>
    </a-button>
    <a-popover
      v-if="state.canEdit.value"
      v-model:open="menuOpen"
      trigger="click"
      placement="bottomRight"
    >
      <template #content
        ><div class="project-organization-menu-items">
          <button type="button" :disabled="blocked || state.locked.value" @click="edit">
            {{ t('proto.organizationEdit') }}
          </button>
          <a-popconfirm
            :title="
              t(project.archivedTime != null ? 'proto.unarchiveConfirm' : 'proto.archiveConfirm', {
                name: project.name,
              })
            "
            :disabled="blocked || state.locked.value || state.conflict.value"
            :overlay-style="{ maxWidth: 'calc(100vw - 24px)' }"
            @confirm="state.archive()"
          >
            <button type="button" :disabled="blocked || state.locked.value || state.conflict.value">
              {{
                t(project.archivedTime != null ? 'proto.unarchiveProject' : 'proto.archiveProject')
              }}
            </button>
          </a-popconfirm>
        </div></template
      >
      <button
        ref="trigger"
        type="button"
        class="project-organization-menu-trigger"
        :aria-label="t('proto.organizationEdit')"
        :aria-expanded="menuOpen"
        :disabled="blocked || state.locked.value"
      >
        <more-outlined aria-hidden="true" />
      </button>
    </a-popover>
    <div v-if="!state.open.value && state.error.value" class="organization-feedback" role="status">
      <span>{{ state.error.value }}</span>
      <a-button
        v-if="state.unknown.value"
        size="small"
        :loading="state.busy.value"
        @click="state.retry()"
        >{{ t('proto.retryOriginal') }}</a-button
      >
      <a-button
        v-if="state.unknown.value || state.conflict.value"
        size="small"
        :loading="state.busy.value"
        @click="state.refreshVersion()"
        >{{ t('proto.refreshProjectState') }}</a-button
      >
    </div>
    <a-modal
      :open="state.open.value"
      :title="`${t('proto.organization')} · ${project.name}`"
      :footer="null"
      :mask-closable="false"
      :closable="!state.busy.value"
      :keyboard="!state.busy.value"
      :width="520"
      @cancel="close"
      @after-close="focusTrigger"
    >
      <a-alert v-if="state.error.value" type="warning" show-icon :message="state.error.value" />
      <p v-if="state.notice.value" role="status">{{ state.notice.value }}</p>
      <a-form
        :model="state.form"
        layout="vertical"
        class="project-organization-form"
        @finish="state.save()"
      >
        <a-form-item :label="t('proto.projectGroup')">
          <project-label-select
            kind="group"
            create
            :value="state.form.groupName"
            :label="t('proto.projectGroup')"
            :disabled="blocked || state.locked.value"
            @change="state.form.groupName = String($event || '')"
          />
        </a-form-item>
        <a-form-item :label="t('proto.projectTags')">
          <project-label-select
            kind="tag"
            create
            :value="state.form.tags"
            :label="t('proto.projectTags')"
            :disabled="blocked || state.locked.value"
            @change="state.form.tags = Array.isArray($event) ? $event : []"
          />
        </a-form-item>
        <div class="organization-form-actions">
          <a-button @click="close">{{ t('common.cancel') }}</a-button>
          <a-button v-if="state.unknown.value" :loading="state.busy.value" @click="state.retry()">{{
            t('proto.retryOriginal')
          }}</a-button>
          <a-button
            v-if="state.unknown.value || state.conflict.value"
            :loading="state.busy.value"
            @click="state.refreshVersion()"
            >{{ t('proto.refreshProjectState') }}</a-button
          >
          <a-button
            type="primary"
            html-type="submit"
            :loading="state.busy.value"
            :disabled="blocked || state.locked.value || state.conflict.value"
            >{{ t('common.save') }}</a-button
          >
        </div>
      </a-form>
    </a-modal>
  </div>
</template>
<style scoped>
.project-organization-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1);
  flex: 0 0 auto;
}
.project-favorite,
.project-organization-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 40px;
  padding: 0;
  border-radius: var(--radius);
}
.project-favorite[aria-pressed='true'] {
  color: var(--color-primary);
}
.project-organization-menu-trigger {
  color: var(--color-text);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.project-organization-menu-trigger:hover {
  background: var(--color-background);
}
.project-organization-menu-trigger:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.project-organization-menu-items {
  width: max-content;
  max-width: min(260px, calc(100vw - 48px));
}
.project-organization-menu-items button {
  display: block;
  min-height: 40px;
  width: 100%;
  padding: var(--space-2);
  color: var(--color-text);
  text-align: start;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.project-organization-menu-items button:hover {
  background: var(--color-background);
}
.organization-feedback {
  flex-basis: 100%;
  max-width: 300px;
  font-size: var(--text-small);
}
.project-organization-form {
  margin-top: var(--space-4);
}
.organization-form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
