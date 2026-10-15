<script setup lang="ts">
defineOptions({ name: 'BasisView' })
import { computed } from 'vue'
import {
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Select as ASelect,
  Switch as ASwitch,
  Alert as AAlert,
  Row as ARow,
  Col as ACol,
  Collapse as ACollapse,
  CollapsePanel as ACollapsePanel,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { systemPermissions } from '@/modules/authentication-manager-ui/views/basis/permissions'
import { useBasicSettings } from '@/modules/authentication-manager-ui/views/basis/hooks/useBasicSettings'
import { displayValue, isRecord } from '@/modules/authentication-manager-ui/utils/model'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import BrandingUpload from '@/modules/authentication-manager-ui/views/basis/components/BrandingUpload.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'
import { assertBasePath } from '@/modules/authentication-manager-ui/utils/branding'
const { t } = useI18n(),
  state = useBasicSettings()
type FrontConfig = {
  title?: string
  headerTheme?: 'light' | 'dark'
  logo?: string
  ico?: string
  background?: string
  showRecordNumber?: boolean
  recordNumber?: string
  policeRecordNumber?: string
  copyright?: string
}
function scope<T extends Model>(key: string): T {
  const value = state.form.value[key]
  if (isRecord(value)) return value as T
  const result: Model = {}
  state.form.value[key] = result
  return result as T
}
const front = computed(() => scope<FrontConfig>('front')),
  paths = computed(() => scope<Record<string, string>>('paths'))
const required = () => [{ required: true, whitespace: true, message: t('common.required') }]
async function validatePath(_rule: unknown, value: unknown) {
  assertBasePath(value)
}
</script>
<template>
  <page-container :title="t('system.basis')"
    ><div class="panel">
      <load-state
        :loading="state.resource.loading.value"
        :error="state.resource.error.value"
        @retry="state.load"
      >
        <a-alert
          v-if="state.task.error.value"
          type="error"
          :message="state.task.error.value"
          show-icon
        />
        <a-form
          name="basic-settings"
          :model="state.form.value"
          layout="vertical"
          @finish="state.save"
        >
          <div class="basis-columns">
            <div>
              <a-form-item
                :label="t('system.title')"
                :name="['front', 'title']"
                :rules="[...required(), { max: 64, message: t('common.invalid') }]"
                ><a-input v-model:value="front.title" :maxlength="64"
              /></a-form-item>
              <a-form-item
                :label="t('system.headerTheme')"
                :name="['front', 'headerTheme']"
                :rules="required()"
                ><a-select
                  v-model:value="front.headerTheme"
                  :options="[
                    { value: 'light', label: t('system.light') },
                    { value: 'dark', label: t('system.dark') },
                  ]"
              /></a-form-item>
              <a-form-item
                :label="t('system.basePath')"
                :name="['paths', 'base-path']"
                :rules="[...required(), { validator: validatePath }]"
                ><a-input v-model:value="paths['base-path']"
              /></a-form-item>
              <a-form-item
                :label="t('system.showRecordNumber')"
                :name="['front', 'showRecordNumber']"
                ><a-switch v-model:checked="front.showRecordNumber"
              /></a-form-item>
              <a-form-item
                v-if="front.showRecordNumber"
                :label="t('system.recordNumber')"
                :name="['front', 'recordNumber']"
                :rules="[
                  { required: true, whitespace: true, message: t('configuration.recordRequired') },
                ]"
                ><a-input v-model:value="front.recordNumber"
              /></a-form-item>
              <a-form-item
                v-if="front.showRecordNumber"
                :label="t('system.policeRecordNumber')"
                :name="['front', 'policeRecordNumber']"
                ><a-input v-model:value="front.policeRecordNumber"
              /></a-form-item>
              <a-form-item :label="t('system.copyright')" :name="['front', 'copyright']"
                ><a-input v-model:value="front.copyright"
              /></a-form-item>
              <a-row :gutter="24"
                ><a-col :xs="24" :sm="12"
                  ><a-form-item :label="t('system.logo')"
                    ><branding-upload
                      v-model="front.logo as string"
                      kind="logo" /></a-form-item></a-col
                ><a-col :xs="24" :sm="12"
                  ><a-form-item :label="t('system.ico')"
                    ><branding-upload
                      v-model="front.ico as string"
                      kind="ico" /></a-form-item></a-col
              ></a-row>
            </div>
            <a-form-item :label="t('system.background')" :name="['front', 'background']"
              ><branding-upload v-model="front.background as string" kind="background"
            /></a-form-item>
          </div>
          <permission-button
            :permission="systemPermissions.basis.update"
            type="primary"
            html-type="submit"
            :loading="state.task.busy.value"
            >{{ t('common.save') }}</permission-button
          >
        </a-form>
        <a-collapse class="basis-version"
          ><a-collapse-panel key="version" :header="t('configuration.version')"
            ><a-descriptions :column="1" bordered
              ><a-descriptions-item
                v-for="(value, key) in state.version.value"
                :key="key"
                :label="String(key)"
                >{{ displayValue(value) }}</a-descriptions-item
              ></a-descriptions
            ></a-collapse-panel
          ></a-collapse
        >
      </load-state>
    </div></page-container
  >
</template>
<style scoped>
.basis-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 32px;
}
.basis-version {
  margin-top: 24px;
}
@media (width <= 900px) {
  .basis-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
