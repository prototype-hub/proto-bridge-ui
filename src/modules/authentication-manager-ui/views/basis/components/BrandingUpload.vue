<script setup lang="ts">
import { computed } from 'vue'
import { Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { systemService } from '@/modules/authentication-manager-ui/api/file/upload'
import {
  uploadedBrandingUrl,
  validateBrandingFile,
} from '@/modules/authentication-manager-ui/utils/branding'
import { useTask } from '@/shared/composables/useTask'
import { resolveBrandingImage } from '@/modules/authentication-manager-ui/assets/branding'
const model = defineModel<string>()
const props = defineProps<{ kind: 'logo' | 'ico' | 'background' }>()
const { t } = useI18n(),
  task = useTask()
const hint = computed(() => `configuration.${props.kind === 'ico' ? 'icon' : props.kind}Hint`)
const preview = computed(() => resolveBrandingImage(props.kind, model.value))
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (file)
    await task.run(async () => {
      await validateBrandingFile(file, props.kind)
      const result = await systemService.upload(file)
      model.value = uploadedBrandingUrl(result)
    })
  input.value = ''
}
</script>
<template>
  <div class="branding-upload" :class="kind">
    <label class="preview" :aria-label="t('configuration.changeImage')">
      <img :src="preview" :alt="t('configuration.preview')" />
      <input
        type="file"
        :disabled="task.busy.value"
        :accept="
          kind === 'ico'
            ? '.ico,image/x-icon,image/vnd.microsoft.icon'
            : '.jpg,.png,.jfif,.pjp,.pjpeg,.jpeg'
        "
        @change="upload"
      />
      <span class="mask"
        ><a-button :loading="task.busy.value" :disabled="task.busy.value">{{
          t('configuration.changeImage')
        }}</a-button></span
      >
    </label>
    <small>{{ t(hint) }}</small>
    <span v-if="task.error.value" role="alert">{{ task.error.value }}</span>
  </div>
</template>
<style scoped>
.branding-upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  width: 160px;
  height: 160px;
  overflow: hidden;
  border: 1px dashed #d9d9d9;
  background: #fafafa;
  cursor: pointer;
}
.preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preview input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}
.mask {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 35%);
}
.preview:hover .mask {
  display: flex;
}
.background .preview {
  width: 100%;
  height: 400px;
}
.background img {
  object-fit: cover;
}
small {
  color: #8c8c8c;
}
</style>
