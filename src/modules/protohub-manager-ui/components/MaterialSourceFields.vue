<script setup lang="ts">
import { Input as AInput, Textarea as ATextarea } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { MaterialSource } from '../types/revision-material'
defineProps<{ model: MaterialSource; disabled?: boolean; prefix: string }>()
const emit = defineEmits<{ change: [key: keyof MaterialSource, value: string] }>()
const { t } = useI18n()
</script>
<template>
  <div class="material-source-fields">
    <div class="source-short-fields">
      <label :for="`${prefix}-tool`"
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
      <label :for="`${prefix}-name`"
        >{{ t('proto.materialName') }}
        <a-input
          :id="`${prefix}-name`"
          :value="model.sourceName ?? undefined"
          name="sourceName"
          :maxlength="200"
          :disabled="disabled"
          autocomplete="off"
          @update:value="emit('change', 'sourceName', String($event))"
        />
      </label>
    </div>
    <label :for="`${prefix}-url`"
      >{{ t('proto.materialUrl') }}
      <a-input
        :id="`${prefix}-url`"
        :value="model.sourceUrl ?? undefined"
        name="sourceUrl"
        type="url"
        :maxlength="2048"
        :disabled="disabled"
        autocomplete="off"
        :spellcheck="false"
        @update:value="emit('change', 'sourceUrl', String($event))"
      />
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
@media (max-width: 600px) {
  .source-short-fields {
    grid-template-columns: 1fr;
  }
}
</style>
