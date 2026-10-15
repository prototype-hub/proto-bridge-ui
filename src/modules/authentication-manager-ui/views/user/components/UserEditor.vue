<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import {
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputPassword as AInputPassword,
  Select as ASelect,
  TreeSelect as ATreeSelect,
  Button as AButton,
  Alert as AAlert,
  Row as ARow,
  Col as ACol,
  Divider as ADivider,
  Tag as ATag,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { UserInput } from '@/modules/authentication-manager-ui/types/user'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import type { FormContext } from '@/modules/authentication-manager-ui/types/forms'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { idsOf } from '@/modules/authentication-manager-ui/utils/identity'
import {
  validPassword,
  validEmail,
  userFieldLimits,
} from '@/modules/authentication-manager-ui/utils/user'
import { PlusOutlined } from '@ant-design/icons-vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import { authPermissions } from '@/modules/authentication-manager-ui/views/role/permissions'
import { systemPermissions } from '@/modules/authentication-manager-ui/views/department/permissions'
import { identityPermissions } from '@/modules/authentication-manager-ui/views/position/permissions'
const model = defineModel<UserInput>('model', { required: true })
const props = defineProps({
  roles: { type: Array as PropType<Role[]>, required: true },
  context: { type: Object as PropType<FormContext>, required: true },
  positions: { type: Array as PropType<SystemRecord[]>, default: () => [] },
  busy: Boolean,
  error: { type: String, default: '' },
})
const emit = defineEmits<{ save: []; related: [kind: 'role' | 'org' | 'position'] }>()
const { t } = useI18n()
const inheritedRoles = ref<string[]>([]),
  inheritedOrgs = ref<string[]>([])
const administrator = computed(() => model.value.username === 'admin')
function inheritance(ids: string[]) {
  const rows = props.positions.filter((row) => ids.includes(row.id))
  const roleIds = [...new Set(rows.flatMap((row) => idsOf(row.roles)))],
    orgIds = [...new Set(rows.map((row) => String(row.orgId || '')).filter(Boolean))]
  model.value.roleIdList = [
    ...new Set([
      ...model.value.roleIdList.filter((id) => !inheritedRoles.value.includes(id)),
      ...roleIds,
    ]),
  ]
  model.value.orgIdList = [
    ...new Set([
      ...(model.value.orgIdList || []).filter((id) => !inheritedOrgs.value.includes(id)),
      ...orgIds,
    ]),
  ]
  inheritedRoles.value = roleIds
  inheritedOrgs.value = orgIds
}
const positionIds = computed({
  get: () => idsOf(model.value.positions),
  set: (ids: string[]) => {
    model.value.positions = ids.map((id) => ({ id }))
    inheritance(ids)
  },
})
watch(
  () => model.value,
  () => {
    inheritedRoles.value = []
    inheritedOrgs.value = []
    inheritance(positionIds.value)
  },
  { immediate: true },
)
const roleTree = computed(() => {
  function nodes(
    rows: FormContext[string],
  ): (FormContext[string][number] & { disabled?: boolean })[] {
    return rows.map((row) => ({
      ...row,
      disabled:
        inheritedRoles.value.includes(String(row.value)) ||
        !!props.roles.find((role) => role.id === row.value)?.unavailable,
      children: row.children ? nodes(row.children) : undefined,
    }))
  }
  const grouped = props.context.roleGroups || []
  const listed = new Set(
    grouped.flatMap((group) => group.children?.map((role) => String(role.value)) || []),
  )
  return nodes([
    ...grouped,
    ...props.roles
      .filter((role) => !listed.has(role.id))
      .map((role) => ({ value: role.id, label: role.name })),
  ])
})
const required = (field: string) => ({
  required: true,
  whitespace: true,
  message: t('identity.requiredField', { field }),
})
const passwordRule = {
  validator: (_rule: unknown, value: string) =>
    validPassword(value || '')
      ? Promise.resolve()
      : Promise.reject(new Error(t('identity.passwordRule'))),
}
const emailRule = {
  validator: async (_rule: unknown, value?: string) => {
    if (!validEmail(value || '')) throw new Error(t('identity.emailRule'))
  },
}
const confirmationRule = {
  validator: async (_rule: unknown, value: string) => {
    if (value !== model.value.password) throw new Error(t('system.passwordMismatch'))
  },
}
const strength = computed(
  () =>
    [
      model.value.password?.length && model.value.password.length >= userFieldLimits.passwordMin,
      /[a-z]/.test(model.value.password || ''),
      /[A-Z]/.test(model.value.password || ''),
      /\d/.test(model.value.password || ''),
      /[^a-zA-Z0-9]/.test(model.value.password || ''),
    ].filter(Boolean).length,
)
function disabledOrganizations(
  rows = props.context.organizations || [],
): (FormContext[string][number] & { disabled: boolean })[] {
  return rows.map((row) => ({
    ...row,
    disabled:
      inheritedOrgs.value.includes(String(row.value)) || ('disabled' in row && !!row.disabled),
    children: row.children ? disabledOrganizations(row.children) : undefined,
  }))
}
</script>
<template>
  <a-alert v-if="error" type="error" :message="error" />
  <a-form layout="vertical" :model="model" @finish="emit('save')">
    <a-divider orientation="left">{{ t('identity.basicInfo') }}</a-divider>
    <a-form-item
      name="name"
      :label="t('identity.realName')"
      :rules="[
        required(t('identity.realName')),
        {
          max: userFieldLimits.name,
          message: t('identity.fieldMaxLength', {
            field: t('identity.realName'),
            max: userFieldLimits.name,
          }),
        },
      ]"
      ><a-input v-model:value="model.name" :maxlength="userFieldLimits.name"
    /></a-form-item>
    <a-row :gutter="24"
      ><a-col :xs="24" :sm="12"
        ><a-form-item
          name="telephone"
          :label="t('system.telephone')"
          :rules="[
            {
              max: userFieldLimits.telephone,
              message: t('identity.fieldMaxLength', {
                field: t('system.telephone'),
                max: userFieldLimits.telephone,
              }),
            },
          ]"
          ><a-input
            v-model:value="model.telephone"
            :maxlength="userFieldLimits.telephone" /></a-form-item></a-col
      ><a-col :xs="24" :sm="12"
        ><a-form-item
          name="email"
          :label="t('system.email')"
          :rules="[
            {
              max: userFieldLimits.email,
              message: t('identity.fieldMaxLength', {
                field: t('system.email'),
                max: userFieldLimits.email,
              }),
            },
            emailRule,
          ]"
          ><a-input
            v-model:value="model.email"
            :maxlength="userFieldLimits.email" /></a-form-item></a-col
    ></a-row>
    <a-row :gutter="24"
      ><a-col :xs="24" :sm="12"
        ><a-form-item
          name="roleIdList"
          :label="t('identity.rolesLabel')"
          :rules="[
            {
              required: !administrator,
              type: 'array',
              min: administrator ? 0 : 1,
              message: t('identity.selectRole'),
            },
          ]"
          ><div class="relation-control">
            <a-tree-select
              v-model:value="model.roleIdList"
              multiple
              show-search
              tree-node-filter-prop="label"
              :disabled="administrator"
              :tree-data="roleTree"
              :field-names="{ label: 'label', value: 'value', children: 'children' }"
              ><template #tagRender="{ value, label, onClose }"
                ><a-tag
                  :closable="
                    !administrator &&
                    !inheritedRoles.includes(String(value)) &&
                    !roles.find((row) => row.id === String(value))?.unavailable
                  "
                  :color="inheritedRoles.includes(String(value)) ? 'blue' : undefined"
                  @close="onClose"
                  >{{ label }}</a-tag
                ></template
              ></a-tree-select
            ><permission-button
              v-if="!administrator"
              :permission="authPermissions.roles.add"
              :aria-label="t('common.add') + t('auth.roles')"
              @click="emit('related', 'role')"
              ><plus-outlined
            /></permission-button></div></a-form-item></a-col
      ><a-col :xs="24" :sm="12"
        ><a-form-item :label="t('identity.organizationsLabel')"
          ><div class="relation-control">
            <a-tree-select
              v-model:value="model.orgIdList"
              multiple
              :tree-data="disabledOrganizations()"
              :field-names="{
                label: 'label',
                value: 'value',
                children: 'children',
              }"
              ><template #tagRender="{ value, label, onClose }"
                ><a-tag
                  :closable="
                    !inheritedOrgs.includes(String(value)) &&
                    !disabledOrganizations().find((row) => row.value === value)?.disabled
                  "
                  :color="inheritedOrgs.includes(String(value)) ? 'blue' : undefined"
                  @close="onClose"
                  >{{ label }}</a-tag
                ></template
              ></a-tree-select
            ><permission-button
              :permission="systemPermissions.department.add"
              :aria-label="t('common.add') + t('identity.organizationsLabel')"
              @click="emit('related', 'org')"
              ><plus-outlined
            /></permission-button></div></a-form-item></a-col
    ></a-row>
    <a-form-item :label="t('identity.positionsLabel')"
      ><div class="relation-control">
        <a-select
          v-model:value="positionIds"
          mode="multiple"
          :disabled="administrator"
          :options="
            positions.map((row) => ({
              value: row.id,
              label: row.name,
              disabled: !!row.unavailable,
            }))
          "
        /><permission-button
          v-if="!administrator"
          :permission="identityPermissions.positionAdd"
          :aria-label="t('common.add') + t('identity.positionsLabel')"
          @click="emit('related', 'position')"
          ><plus-outlined
        /></permission-button>
      </div>
      <small>{{ t('identity.inherited') }}</small></a-form-item
    >
    <a-divider orientation="left">{{ t('identity.loginInfo') }}</a-divider>
    <a-form-item
      name="username"
      :label="t('common.username')"
      :rules="[
        required(t('common.username')),
        { max: userFieldLimits.username, message: t('identity.usernameRule') },
      ]"
      ><a-input
        v-model:value="model.username"
        :disabled="!!model.id"
        :maxlength="userFieldLimits.username"
    /></a-form-item>
    <template v-if="!model.id"
      ><a-form-item name="password" :label="t('common.password')" :rules="[passwordRule]"
        ><a-input-password v-model:value="model.password" autocomplete="new-password" /><small>{{
          t('identity.passwordRule')
        }}</small
        ><small>{{ t('system.passwordStrength') }} {{ strength }} / 5</small></a-form-item
      ><a-form-item
        name="confirmPassword"
        :label="t('system.confirmPassword')"
        :rules="[required(t('system.confirmPassword')), confirmationRule]"
        ><a-input-password
          v-model:value="model.confirmPassword"
          autocomplete="new-password" /></a-form-item
    ></template>
    <a-button html-type="submit" type="primary" :loading="busy">{{ t('common.save') }}</a-button>
  </a-form>
</template>
<style scoped>
.relation-control {
  display: flex;
  gap: 8px;
}
.relation-control :deep(.ant-select) {
  flex: 1;
  min-width: 0;
}
</style>
