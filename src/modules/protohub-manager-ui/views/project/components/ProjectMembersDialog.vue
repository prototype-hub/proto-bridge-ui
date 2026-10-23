<script setup lang="ts">
import { computed, toRef } from 'vue'
import {
  Modal as AModal,
  Form as AForm,
  FormItem as AFormItem,
  Select as ASelect,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  Space as ASpace,
} from 'ant-design-vue'
import { DeleteOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Project, ProjectMember } from '@/modules/protohub-manager-ui/types'
import { useProjectMembers } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectMembers'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { usePermissions } from '@/shared/auth/provider'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'
import ActionButton from '@/shared/components/ActionButton.vue'

const props = defineProps<{ open: boolean; project?: Project }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { t } = useI18n()
const permissions = usePermissions()
const editable = computed(
  () => projectAllows(props.project, 'manageMembers') && permissions.can(p.project.save),
)
const state = useProjectMembers(
  toRef(props, 'project'),
  computed(() => props.open && editable.value),
  () => emit('changed'),
)
const options = computed(() =>
  state.candidates.value.map((user) => ({
    value: user.userId,
    label: `${user.name} (${user.username})`,
  })),
)
const rows = computed(() => state.members.value.map((member) => ({ ...member, id: member.userId })))
const roles = computed(() =>
  ['viewer', 'editor'].map((role) => ({ value: role, label: t(`proto.memberRoles.${role}`) })),
)
const columns = computed(() => [
  { title: t('proto.memberName'), dataIndex: 'name' },
  { title: t('proto.memberUsername'), dataIndex: 'username' },
  { title: t('proto.memberRole'), key: 'role', width: 160 },
  { title: t('common.actions'), key: 'actions', width: 64 },
])
function roleChanged(member: ProjectMember, value: unknown) {
  if (value === 'editor' || value === 'viewer') void state.save(member.userId, value)
}
function submit() {
  if (!editable.value) return
  if (props.project?.claimRequired) void state.claim()
  else void state.save()
}
</script>
<template>
  <a-modal
    :open="open && editable"
    :title="t('proto.members')"
    :footer="null"
    :width="850"
    :destroy-on-close="true"
    @cancel="emit('close')"
  >
    <a-alert :message="t('proto.memberAccessHint')" type="info" show-icon />
    <a-alert
      v-if="project?.claimRequired"
      :message="t('proto.claimRequired')"
      type="warning"
      show-icon
    />
    <a-alert v-if="state.error.value" :message="state.error.value" type="error" show-icon />
    <a-form
      class="member-form"
      layout="vertical"
      :model="{ userId: state.userId.value, role: state.role.value }"
      @finish="submit"
    >
      <a-form-item
        name="userId"
        :label="project?.claimRequired ? t('proto.claimOwner') : t('proto.memberUser')"
        :rules="[{ required: true, message: t('proto.selectMember') }]"
      >
        <a-select
          v-model:value="state.userId.value"
          :options="options"
          :loading="state.searching.value"
          :filter-option="false"
          :disabled="state.busy.value"
          show-search
          allow-clear
          :placeholder="t('proto.memberSearch')"
          @search="state.search"
        />
        <a-alert v-if="state.searchError.value" :message="state.searchError.value" type="error" />
      </a-form-item>
      <a-form-item v-if="!project?.claimRequired" name="role" :label="t('proto.memberRole')">
        <a-select v-model:value="state.role.value" :options="roles" :disabled="state.busy.value" />
      </a-form-item>
      <a-button
        type="primary"
        html-type="submit"
        :loading="state.busy.value"
        :disabled="!state.userId.value || state.busy.value"
        >{{ t(project?.claimRequired ? 'proto.assignOwner' : 'proto.saveMember') }}</a-button
      >
    </a-form>
    <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load">
      <data-table :rows="rows" :columns="columns">
        <template #cell="{ column, record }">
          <template v-if="column.key === 'role'">
            <a-tag v-if="record.role === 'owner'">{{ t('proto.memberRoles.owner') }}</a-tag>
            <a-select
              v-else
              :aria-label="`${record.name} ${t('proto.memberRole')}`"
              :value="record.role"
              :options="roles"
              :disabled="state.busy.value"
              @change="roleChanged(record, $event)"
            />
          </template>
          <a-space v-else-if="column.key === 'actions'">
            <action-button
              v-if="record.role !== 'owner'"
              :label="t('proto.removeMember')"
              :icon="DeleteOutlined"
              :permission="p.project.save"
              :disabled="state.busy.value"
              danger
              :confirm="t('proto.removeMemberConfirm')"
              @action="state.remove(record)"
            />
          </a-space>
          <template v-else>{{ record[column.dataIndex as keyof ProjectMember] }}</template>
        </template>
      </data-table>
    </load-state>
  </a-modal>
</template>
<style scoped>
.member-form {
  margin-top: var(--space-4);
  margin-bottom: var(--space-4);
}
.member-form :deep(.ant-select) {
  width: 100%;
}
</style>
