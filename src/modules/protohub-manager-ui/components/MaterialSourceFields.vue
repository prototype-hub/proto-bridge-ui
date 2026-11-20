<script setup lang="ts">
import { Input as AInput, Textarea as ATextarea, theme } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { MaterialSource } from '../types/revision-material'
defineProps<{
  model: MaterialSource
  disabled?: boolean
  prefix: string
  link?: boolean
  errors?: Partial<Record<keyof MaterialSource, string>>
}>()
const emit = defineEmits<{ change: [key: keyof MaterialSource, value: string] }>()
const { t } = useI18n()
const { token } = theme.useToken()
</script>
<template>
  <div class="material-source-fields">
    <div class="source-short-fields">
      <label v-if="!link" :for="`${prefix}-tool`"
        >{{ t('proto.materialTool') }}
        <a-input
          :id="`${prefix}-tool`"
          :value="model.sourceTool ?? undefined"
          name="sourceTool"
          :maxlength="80"
          :disabled="disabled"
          autocomplete="off"
          @update:value="emit('change', 'sourceTool', String($event))"
        />
      </label>
      <label :for="`${prefix}-name`">
        <span :id="`${prefix}-name-label`">{{
          t(link ? 'proto.materialLinkTitle' : 'proto.materialName')
        }}</span>
        <a-input
          :id="`${prefix}-name`"
          :value="model.sourceName ?? undefined"
          name="sourceName"
          :maxlength="200"
          :disabled="disabled"
          :aria-required="link || undefined"
          :aria-invalid="!!errors?.sourceName"
          :aria-labelledby="`${prefix}-name-label`"
          :aria-describedby="errors?.sourceName ? `${prefix}-name-error` : undefined"
          autocomplete="off"
          @update:value="emit('change', 'sourceName', String($event))"
        />
        <span
          v-if="errors?.sourceName"
          :id="`${prefix}-name-error`"
          class="field-error"
          role="alert"
          >{{ errors.sourceName }}</span
        >
      </label>
    </div>
    <label :for="`${prefix}-url`">
      <span :id="`${prefix}-url-label`">{{
        t(link ? 'proto.materialLinkUrl' : 'proto.materialUrl')
      }}</span>
      <a-input
        :id="`${prefix}-url`"
        :value="model.sourceUrl ?? undefined"
        name="sourceUrl"
        type="url"
        :maxlength="2048"
        :disabled="disabled"
        :aria-required="link || undefined"
        :aria-invalid="!!errors?.sourceUrl"
        :aria-labelledby="`${prefix}-url-label`"
        :aria-describedby="errors?.sourceUrl ? `${prefix}-url-error` : undefined"
        autocomplete="off"
        :spellcheck="false"
        @update:value="emit('change', 'sourceUrl', String($event))"
      />
      <span v-if="errors?.sourceUrl" :id="`${prefix}-url-error`" class="field-error" role="alert">{{
        errors.sourceUrl
      }}</span>
    </label>
    <label :for="`${prefix}-notes`"
      >{{ t('proto.materialNotes') }}
      <a-textarea
        :id="`${prefix}-notes`"
        :value="model.sourceNotes ?? undefined"
        name="sourceNotes"
        :rows="3"
        :maxlength="2000"
        :disabled="disabled"
        @update:value="emit('change', 'sourceNotes', String($event))"
      />
    </label>
  </div>
</template>
<style scoped>
.material-source-fields,
.material-source-fields label {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.material-source-fields {
  gap: var(--space-3);
}
.source-short-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.field-error {
  color: v-bind('token.colorErrorTextActive');
  font-size: 12px;
}
.source-short-fields:has(> label:only-child) {
  grid-template-columns: 1fr;
}
@media (max-width: 600px) {
  .source-short-fields {
    grid-template-columns: 1fr;
  }
}
</style>
