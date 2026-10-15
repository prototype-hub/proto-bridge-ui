<script setup lang="ts">
import {
  FormItem as AFormItem,
  Input as AInput,
  InputNumber as AInputNumber,
  Textarea as ATextarea,
  Select as ASelect,
  Switch as ASwitch,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { computed, useId } from 'vue'
import type { ServerMenu } from '@/shared/auth/types'
import MenuIconSelector from '@/modules/authentication-manager-ui/views/menu/components/MenuIconSelector.vue'
const model = defineModel<ServerMenu>({ required: true })
defineProps<{ parents: { value: string; label: string }[] }>()
const { t } = useI18n()
const englishFieldId = `menu-english-${useId()}`
const required = [{ required: true, whitespace: true, message: t('common.required') }]
const englishName = computed({
  get: () => model.value.i18nMessages?.name?.en_US || model.value.i18nMessages?.name?.en || '',
  set: (value: string) => {
    const names = { ...model.value.i18nMessages?.name }
    const english = value
    if (english) {
      names.en_US = english
      names.en = english
    } else {
      delete names.en_US
      delete names.en
    }
    model.value.i18nMessages = { ...model.value.i18nMessages, name: names }
  },
})
</script>
<template>
  <div class="menu-basic">
    <div class="menu-core">
      <a-form-item name="icon" :label="t('configuration.icon')" :rules="required"
        ><menu-icon-selector v-model="model.icon"
      /></a-form-item>
      <div class="menu-grid">
        <a-form-item
          name="name"
          :label="t('common.name')"
          :rules="[...required, { max: 64, message: t('common.invalid') }]"
          ><a-input v-model:value="model.name" :maxlength="64" /></a-form-item
        ><a-form-item :html-for="englishFieldId" :label="t('slimming.englishName')">
          <a-input :id="englishFieldId" v-model:value="englishName" :maxlength="64" /> </a-form-item
        ><a-form-item
          name="code"
          :label="t('common.code')"
          :rules="[...required, { max: 64, message: t('common.invalid') }]"
          ><a-input v-model:value="model.code" :maxlength="64"
        /></a-form-item>
        <a-form-item
          name="url"
          :label="t('configuration.pageUrl')"
          :extra="t('configuration.pageUrlHint')"
          :rules="[
            { required: true, pattern: /^\/.{0,127}$/, message: t('configuration.pathRequired') },
          ]"
          ><a-input v-model:value="model.url" :maxlength="128" /></a-form-item
        ><a-form-item
          name="sortIndex"
          :label="t('configuration.sort')"
          :rules="[
            {
              validator: async (_rule: unknown, value: unknown) => {
                if (value !== undefined && (!Number.isInteger(value) || Number(value) <= 0))
                  throw new Error(t('configuration.positiveSort'))
              },
            },
          ]"
          ><a-input-number
            v-model:value="model.sortIndex"
            :min="1"
            :precision="0"
            style="width: 100%"
        /></a-form-item>
        <a-form-item :label="t('auth.parent')" name="parentId"
          ><a-select
            v-model:value="model.parentId"
            :options="parents"
            show-search
            option-filter-prop="label"
            allow-clear
        /></a-form-item>
      </div>
    </div>
    <a-form-item name="describe" :label="t('configuration.description')"
      ><a-textarea
        v-model:value="model.describe"
        :maxlength="200"
        show-count
        :rows="3" /></a-form-item
    ><a-form-item :label="t('system.show')"
      ><a-switch
        :checked="model.options?.show !== false"
        @update:checked="model.options = { ...model.options, show: !!$event }"
    /></a-form-item>
  </div>
</template>
<style scoped>
.menu-core {
  display: grid;
  grid-template-columns: 186px minmax(0, 1fr);
}
.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
@media (width <= 700px) {
  .menu-core {
    grid-template-columns: minmax(0, 1fr);
  }
  .menu-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
