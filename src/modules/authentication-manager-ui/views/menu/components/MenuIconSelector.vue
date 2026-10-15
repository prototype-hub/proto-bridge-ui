<script setup lang="ts">
import { ref, computed } from 'vue'
import { Modal as AModal, Button as AButton, Input as AInput } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { menuIcons } from '@/shared/utils/menu-icons'
import MenuIcon from '@/shared/components/MenuIcon.vue'
import MenuIconEditor from '@/modules/authentication-manager-ui/views/menu/components/MenuIconEditor.vue'
const model = defineModel<string>(),
  { t } = useI18n(),
  open = ref(false),
  search = ref('')
const icons = computed(() =>
  Object.keys(menuIcons).filter((name) => name.toLowerCase().includes(search.value.toLowerCase())),
)
function selectIcon(name: string) {
  model.value = name
  open.value = false
}
</script>
<template>
  <button
    type="button"
    class="icon-preview"
    :aria-label="t('configuration.chooseIcon')"
    @click="open = true"
  >
    <menu-icon v-if="model" :name="model" /><span v-else>＋</span
    ><small>{{ t('configuration.chooseIcon') }}</small>
  </button>
  <a-modal v-model:open="open" :title="t('configuration.chooseIcon')" :footer="null" :width="720"
    ><a-input v-model:value="search" :placeholder="t('system.keyword')" allow-clear />
    <div class="icon-grid">
      <a-button
        v-for="name in icons"
        :key="name"
        :title="name"
        :aria-label="name"
        @click="selectIcon(name)"
        ><menu-icon :name="name"
      /></a-button>
    </div>
    <menu-icon-editor v-model="model" /><a-button
      class="icon-confirm"
      type="primary"
      @click="open = false"
      >{{ t('common.save') }}</a-button
    ></a-modal
  >
</template>
<style scoped>
.icon-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 160px;
  height: 150px;
  border: 1px dashed #d9d9d9;
  background: #fafafa;
  cursor: pointer;
  color: #595959;
}
.icon-preview:hover {
  border-color: #1677ff;
}
.icon-preview :deep(svg) {
  width: 72px;
  height: 72px;
}
.icon-preview :deep(img) {
  width: 72px;
  height: 72px;
}
.icon-preview > span {
  font-size: 32px;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 12px;
  margin: 16px 0;
  max-height: 350px;
  overflow: auto;
}
.icon-grid :deep(svg) {
  font-size: 24px;
}
.icon-grid :deep(.ant-btn) {
  height: 56px;
}
.icon-confirm {
  display: block;
  margin-top: 16px;
}
</style>
