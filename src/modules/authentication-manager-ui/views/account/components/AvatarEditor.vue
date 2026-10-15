<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  Button as AButton,
  Modal as AModal,
  Slider as ASlider,
  Select as ASelect,
  Alert as AAlert,
} from 'ant-design-vue'
import { UserOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { uploadMeAvatar_api } from '@/modules/authentication-manager-ui/api/account/center'
import { uploadedBrandingUrl } from '@/modules/authentication-manager-ui/utils/branding'
import {
  avatarPngFile,
  drawAvatar,
} from '@/modules/authentication-manager-ui/views/account/utils/avatar-crop'
const model = defineModel<string>({ default: '' })
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const { t } = useI18n()
const input = ref<HTMLInputElement>(),
  canvas = ref<HTMLCanvasElement>()
const image = shallowRef<HTMLImageElement>()
const imageFailed = ref(false)
watch(model, () => {
  imageFailed.value = false
})
const open = ref(false),
  reading = ref(false),
  uploading = ref(false),
  error = ref('')
const zoom = ref(1),
  horizontal = ref(50),
  vertical = ref(50),
  outputSize = ref(256)
let epoch = 0,
  objectUrl: string | undefined,
  fetchController: AbortController | undefined
const busy = computed(() => reading.value || uploading.value)
const crop = computed(() => ({
  zoom: zoom.value,
  horizontal: horizontal.value,
  vertical: vertical.value,
}))
watch(
  () => busy.value || open.value,
  (value) => emit('busy', value),
  { immediate: true },
)
function release() {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = undefined
  image.value = undefined
  fetchController?.abort()
  fetchController = undefined
}
function cancel() {
  epoch++
  release()
  open.value = false
  reading.value = false
  uploading.value = false
}
function report(value: unknown) {
  error.value = value instanceof Error ? value.message : t('slimming.avatarFailed')
}
async function load(blob: Blob, generation: number) {
  if (blob.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(blob.type))
    throw new Error(t('slimming.invalidAvatar'))
  const url = URL.createObjectURL(blob)
  const decoded = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      decoded.onload = () => resolve()
      decoded.onerror = () => reject(new Error(t('slimming.unreadableAvatar')))
      decoded.src = url
    })
    if (generation !== epoch) {
      URL.revokeObjectURL(url)
      return
    }
    if (
      !decoded.naturalWidth ||
      !decoded.naturalHeight ||
      Math.max(decoded.naturalWidth, decoded.naturalHeight) > 8192 ||
      decoded.naturalWidth * decoded.naturalHeight > 32 * 1024 * 1024
    )
      throw new Error(t('slimming.invalidAvatar'))
    release()
    objectUrl = url
    image.value = decoded
    zoom.value = 1
    horizontal.value = vertical.value = 50
    open.value = true
    await nextTick()
    preview()
  } catch (value) {
    URL.revokeObjectURL(url)
    throw value
  }
}
async function choose(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file || props.disabled || busy.value) return
  const generation = ++epoch
  error.value = ''
  reading.value = true
  try {
    if (!/\.(png|jpe?g)$/i.test(file.name)) throw new Error(t('slimming.invalidAvatar'))
    await load(file, generation)
  } catch (value) {
    if (generation === epoch) report(value)
  } finally {
    if (generation === epoch) reading.value = false
  }
}
async function adjust() {
  if (!model.value || props.disabled || busy.value) return
  const generation = ++epoch
  error.value = ''
  reading.value = true
  fetchController = new AbortController()
  try {
    const response = await fetch(model.value, { signal: fetchController.signal })
    if (!response.ok) throw new Error(t('slimming.unreadableAvatar'))
    await load(await response.blob(), generation)
  } catch (value) {
    if (generation === epoch) report(value)
  } finally {
    if (generation === epoch) reading.value = false
  }
}
function preview() {
  if (!canvas.value || !image.value) return
  try {
    drawAvatar(canvas.value, image.value, crop.value, outputSize.value)
  } catch {
    error.value = t('slimming.unreadableAvatar')
  }
}
watch([crop, outputSize, canvas], preview, { flush: 'post' })
async function upload() {
  if (!image.value || busy.value || props.disabled) return
  const generation = epoch
  const source = image.value
  uploading.value = true
  error.value = ''
  try {
    const file = await avatarPngFile(source, crop.value, outputSize.value)
    if (generation !== epoch) return
    const url = uploadedBrandingUrl(await uploadMeAvatar_api(file))
    if (generation !== epoch) return
    model.value = url
    cancel()
  } catch (value) {
    if (generation === epoch) report(value)
  } finally {
    if (generation === epoch) uploading.value = false
  }
}
onBeforeUnmount(() => {
  epoch++
  release()
})
</script>
<template>
  <div class="avatar-editor">
    <div class="avatar-current">
      <img
        v-if="model && !imageFailed"
        :src="model"
        :alt="t('slimming.avatarPreview')"
        @error="imageFailed = true"
      /><user-outlined v-else :aria-label="t('slimming.avatarPreview')" />
    </div>
    <div class="avatar-actions">
      <input
        ref="input"
        class="avatar-file"
        type="file"
        accept="image/png,image/jpeg"
        :disabled="disabled || busy"
        :aria-label="t('slimming.chooseAvatar')"
        @change="choose"
      />
      <a-button :disabled="disabled || busy" :loading="reading" @click="input?.click()">{{
        t('slimming.chooseAvatar')
      }}</a-button>
      <a-button v-if="model" :disabled="disabled || busy" @click="adjust">{{
        t('slimming.adjustAvatar')
      }}</a-button>
      <span class="muted">{{ t('slimming.avatarHint') }}</span>
      <a-alert v-if="error && !open" type="error" :message="error" show-icon />
    </div>
    <a-modal
      :open="open"
      :title="t('slimming.adjustAvatar')"
      :width="500"
      :footer="null"
      :mask-closable="false"
      :destroy-on-close="true"
      @cancel="cancel"
    >
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <canvas
        ref="canvas"
        class="avatar-crop-preview"
        role="img"
        :aria-label="t('slimming.avatarPreview')"
      />
      <label :for="'avatar-zoom'">{{ t('slimming.zoom') }}</label
      ><a-slider
        id="avatar-zoom"
        v-model:value="zoom"
        :min="1"
        :max="4"
        :step="0.1"
        :disabled="uploading"
        :aria-label-for-handle="t('slimming.zoom')"
      />
      <label for="avatar-horizontal">{{ t('slimming.horizontal') }}</label
      ><a-slider
        id="avatar-horizontal"
        v-model:value="horizontal"
        :min="0"
        :max="100"
        :disabled="uploading"
        :aria-label-for-handle="t('slimming.horizontal')"
      />
      <label for="avatar-vertical">{{ t('slimming.vertical') }}</label
      ><a-slider
        id="avatar-vertical"
        v-model:value="vertical"
        :min="0"
        :max="100"
        :disabled="uploading"
        :aria-label-for-handle="t('slimming.vertical')"
      />
      <div class="avatar-size">
        <span>{{ t('slimming.outputSize') }}</span
        ><a-select
          v-model:value="outputSize"
          :aria-label="t('slimming.outputSize')"
          :disabled="uploading"
          :options="[128, 256, 512].map((value) => ({ value, label: `${value} × ${value}` }))"
        />
      </div>
      <div class="avatar-footer">
        <a-button @click="cancel">{{ t('common.cancel') }}</a-button
        ><a-button type="primary" :loading="uploading" :disabled="busy" @click="upload">{{
          t('slimming.applyAvatar')
        }}</a-button>
      </div>
    </a-modal>
  </div>
</template>
<style scoped>
.avatar-editor {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.avatar-current {
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
  background: var(--color-bg-layout);
  border-radius: 50%;
  overflow: hidden;
  font-size: 48px;
}
.avatar-current img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  font-size: 14px;
}
.avatar-actions {
  display: flex;
  flex: 1;
  min-width: 180px;
  flex-wrap: wrap;
  gap: 8px;
}
.avatar-actions .muted,
.avatar-actions .ant-alert {
  flex-basis: 100%;
}
.avatar-actions > .avatar-file {
  display: none;
}
.avatar-crop-preview {
  display: block;
  width: 240px;
  height: 240px;
  max-width: 100%;
  margin: 16px auto;
  border-radius: 50%;
  background: var(--color-bg-layout);
}
.avatar-size {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.avatar-size .ant-select {
  flex: 0 1 160px;
  width: 160px;
  min-width: 128px;
}
.avatar-size > span {
  flex: none;
  white-space: nowrap;
}
.avatar-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
