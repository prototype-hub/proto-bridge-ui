<script setup lang="ts">
import { AutoComplete as AAutoComplete, Button as AButton, Space as ASpace } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { systemService } from '@/modules/authentication-manager-ui/api/file/upload'
import { uploadedBrandingUrl } from '@/modules/authentication-manager-ui/utils/branding'
import { useTask } from '@/shared/composables/useTask'
import { menuIcons } from '@/shared/utils/menu-icons'
import MenuIcon from '@/shared/components/MenuIcon.vue'
const model = defineModel<string>(),
  { t } = useI18n(),
  task = useTask()
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file)
    await task.run(async () => {
      const result = await systemService.upload(file)
      model.value = uploadedBrandingUrl(result)
    })
  input.value = ''
}
</script>
<template>
  <a-space wrap>
    <menu-icon :name="model" />
    <a-auto-complete
      v-model:value="model"
      :options="Object.keys(menuIcons).map((value) => ({ value }))"
      style="min-width: 240px"
    />
    <label class="icon-upload"
      ><a-button :loading="task.busy.value">{{ t('system.upload') }}</a-button
      ><input type="file" accept="image/*" :aria-label="t('system.icon')" @change="upload"
    /></label>
    <span v-if="task.error.value" role="alert">{{ task.error.value }}</span>
  </a-space>
</template>
<style scoped>
.icon-upload {
  position: relative;
}
.icon-upload input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
