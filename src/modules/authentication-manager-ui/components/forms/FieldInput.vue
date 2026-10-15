<script setup lang="ts">
import type { PropType } from 'vue'
import {
  Input as AInput,
  InputPassword as AInputPassword,
  Textarea as ATextarea,
  InputNumber as AInputNumber,
  Switch as ASwitch,
  Select as ASelect,
  TreeSelect as ATreeSelect,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Field, FormContext } from '@/modules/authentication-manager-ui/types/forms'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import {
  getValue,
  setValue,
  stringValue,
  numberValue,
  arrayValue,
  jsonValue,
} from '@/modules/authentication-manager-ui/utils/model'
import { systemService } from '@/modules/authentication-manager-ui/api/file/upload'
import { uploadedBrandingUrl } from '@/modules/authentication-manager-ui/utils/branding'
import { useTask } from '@/shared/composables/useTask'
const props = defineProps({
  field: { type: Object as PropType<Field>, required: true },
  model: { type: Object as PropType<Model>, required: true },
  context: { type: Object as PropType<FormContext>, default: () => ({}) },
})
const { t } = useI18n()
const task = useTask()
const value = () => getValue(props.model, props.field.key)
const update = (value: unknown) => setValue(props.model, props.field.key, value)
const options = () => props.field.options || props.context[props.field.source || ''] || []
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file)
    await task.run(async () => {
      const result = await systemService.upload(file)
      update(uploadedBrandingUrl(result))
    })
}
</script>
<template>
  <a-switch v-if="field.kind === 'switch'" :checked="!!value()" @update:checked="update" />
  <a-input-number
    v-else-if="field.kind === 'number'"
    :value="numberValue(value())"
    :style="{ width: '100%' }"
    @update:value="update"
  />
  <a-input-password
    v-else-if="field.kind === 'password'"
    :value="stringValue(value())"
    autocomplete="new-password"
    @update:value="update"
  />
  <a-select
    v-else-if="field.kind === 'select' || field.kind === 'multiple'"
    :value="
      field.kind === 'multiple'
        ? arrayValue(value())
        : typeof value() === 'number'
          ? numberValue(value())
          : stringValue(value())
    "
    :disabled="field.immutable && model.__editing === true"
    :mode="field.kind === 'multiple' ? 'multiple' : undefined"
    :options="options()"
    show-search
    option-filter-prop="label"
    allow-clear
    @update:value="update"
  />
  <a-tree-select
    v-else-if="field.kind === 'tree'"
    :value="stringValue(value())"
    :disabled="field.immutable && model.__editing === true"
    :tree-data="options()"
    :field-names="{ label: 'label', value: 'value', children: 'children' }"
    show-search
    tree-node-filter-prop="label"
    allow-clear
    @update:value="update"
  />
  <a-textarea
    v-else-if="field.kind === 'textarea' || field.kind === 'json'"
    :value="field.kind === 'json' ? jsonValue(value()) : stringValue(value())"
    :rows="field.kind === 'json' ? 6 : 3"
    :maxlength="field.max"
    @update:value="update"
  />
  <div v-else-if="field.kind === 'file'" class="stack">
    <a-input :value="stringValue(value())" @update:value="update" /><label class="upload-label"
      ><a-button :loading="task.busy.value">{{ t('system.upload') }}</a-button
      ><input type="file" :aria-label="t(field.label)" @change="upload" /></label
    ><span v-if="task.error.value" role="alert">{{ task.error.value }}</span>
  </div>
  <input
    v-else-if="field.kind === 'color'"
    type="color"
    :value="stringValue(value()) || '#1677ff'"
    :aria-label="t(field.label)"
    @input="update(($event.target as HTMLInputElement).value)"
  />
  <a-input
    v-else
    :value="stringValue(value())"
    :maxlength="field.max"
    :disabled="field.immutable && model.__editing === true"
    @update:value="update"
  />
</template>
<style scoped>
.upload-label {
  position: relative;
  width: fit-content;
}
.upload-label input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
