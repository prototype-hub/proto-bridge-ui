<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import {
  Tabs as ATabs,
  TabPane as ATabPane,
  Form as AForm,
  Alert as AAlert,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import type { FormContext } from '@/modules/authentication-manager-ui/types/forms'
import {
  savePosition,
  positionDetail,
} from '@/modules/authentication-manager-ui/views/position/definition'
import { formOptions } from '@/modules/authentication-manager-ui/hooks/form-options'
import { roleIdentityApi } from '@/modules/authentication-manager-ui/api/role/role-options'
import { isRecord, stringValue, resultOf } from '@/modules/authentication-manager-ui/utils/model'
import { finishRelatedSave } from '@/modules/authentication-manager-ui/utils/related-record'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
import PositionBasicFields from '@/modules/authentication-manager-ui/views/position/components/PositionBasicFields.vue'
import { useRelatedRecord } from '@/modules/authentication-manager-ui/hooks/useRelatedRecord'
import UserBinding from '@/modules/authentication-manager-ui/components/membership/UserBinding.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
const props = defineProps({
  record: { type: Object as PropType<SystemRecord | Model>, required: true },
})
const emit = defineEmits<{ saved: [record: Model] }>()
const { t } = useI18n()
const route = useRoute()
const active = ref('basic'),
  draft = ref<Model>({}),
  context = ref<FormContext>({}),
  task = useTask()
const editing = computed(() => !!draft.value.id)
async function loadOptions() {
  const [options, grouped] = await Promise.all([
    formOptions(['organizations', 'roles', 'positions']),
    roleIdentityApi.roleOptions().catch(() => []),
  ])
  context.value = { ...options, roleGroups: grouped }
  context.value.positions = context.value.positions.filter(
    (option) => option.value !== props.record.id,
  )
}
const related = useRelatedRecord(
  loadOptions,
  (kind, id) => {
    if (kind === 'org') draft.value.orgId = id
    else
      draft.value.roles = [
        ...new Set([...(Array.isArray(draft.value.roles) ? draft.value.roles : []), id]),
      ]
  },
  () => props.record,
)
async function initialize() {
  await task.run(async () => {
    await loadOptions()
    draft.value = {
      ...props.record,
      __editing: !!props.record.id,
      roles: Array.isArray(props.record.roles)
        ? props.record.roles.map((item) => (isRecord(item) ? item.id : item))
        : [],
    }
    active.value = 'basic'
  })
}
async function save() {
  await task.run(async () => {
    const response = resultOf(await savePosition(draft.value, editing.value))
    const record = positionDetail(response)
    const id = record?.id || stringValue(draft.value.id)
    if (id && finishRelatedSave(route.query.sourceId, id)) return
    if (id) draft.value = { ...draft.value, id, __editing: true }
    saved()
    emit('saved', { ...draft.value })
  })
}
watch(() => props.record, initialize, { immediate: true })
</script>
<template>
  <a-alert v-if="task.error.value" :message="task.error.value" type="error" />
  <a-alert v-if="related.relatedError.value" :message="related.relatedError.value" type="error"
    ><template #action
      ><a-button @click="related.retryRelated">{{ t('common.retry') }}</a-button></template
    ></a-alert
  >
  <a-tabs v-model:active-key="active" type="card"
    ><a-tab-pane key="basic" :tab="t('organization.basic')">
      <a-form layout="vertical" :model="draft" @finish="save"
        ><position-basic-fields
          :model="draft"
          :context="context"
          @related="related.openRelated"
        /><permission-button
          :permission="`system/Positions:${editing ? 'update' : 'add'}`"
          type="primary"
          html-type="submit"
          :loading="task.busy.value"
          >{{ t('common.save') }}</permission-button
        ></a-form
      > </a-tab-pane
    ><a-tab-pane key="members" :tab="t('organization.usersTab')" :disabled="!editing"
      ><user-binding
        v-if="draft.id"
        :scope="{
          type: 'position',
          id: stringValue(draft.id),
          orgId: stringValue(draft.orgId),
          permission: 'system/Positions',
        }" /></a-tab-pane
  ></a-tabs>
</template>
