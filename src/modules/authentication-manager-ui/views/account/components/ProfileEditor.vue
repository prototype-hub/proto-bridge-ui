<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FormItem as AFormItem, FormItemRest as AFormItemRest } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { field } from '@/modules/authentication-manager-ui/utils/form-schema'
import { stringValue } from '@/modules/authentication-manager-ui/utils/model'
import FormModal from '@/shared/components/FormModal.vue'
import SchemaFields from '@/modules/authentication-manager-ui/components/forms/SchemaFields.vue'
import AvatarEditor from '@/modules/authentication-manager-ui/views/account/components/AvatarEditor.vue'
const props = defineProps<{ modelValue?: Model; busy: boolean; error: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: undefined]; save: [value: Model] }>()
const { t } = useI18n()
const draft = ref<Model>({}),
  avatarBusy = ref(false),
  session = ref(0)
watch(
  () => props.modelValue,
  (value) => {
    draft.value = value ? { ...value } : {}
    avatarBusy.value = false
    session.value++
  },
  { immediate: true },
)
const avatar = computed({
  get: () => stringValue(draft.value.avatar),
  set: (value: string) => {
    draft.value.avatar = value
  },
})
const fields = computed(() => [
  field('name', 'text', true, { max: 64 }),
  field('telephone'),
  field('email'),
])
function save() {
  if (!avatarBusy.value && !props.busy) emit('save', { ...draft.value })
}
</script>
<template>
  <form-modal
    :open="!!modelValue"
    :title="t('common.edit')"
    :model="draft"
    :busy="busy || avatarBusy"
    :error="error"
    form-name="account-profile"
    @cancel="emit('update:modelValue', undefined)"
    @submit="save"
  >
    <a-form-item :label="t('system.avatar')">
      <a-form-item-rest
        ><avatar-editor
          v-if="modelValue"
          :key="session"
          v-model="avatar"
          :disabled="busy"
          @busy="avatarBusy = $event"
      /></a-form-item-rest>
    </a-form-item>
    <schema-fields :fields="fields" :model="draft" />
  </form-modal>
</template>
