<script setup lang="ts">
defineOptions({ name: 'DictionaryView' })
import { ref } from 'vue'
import { Empty as AEmpty } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import PageContainer from '@/shared/components/PageContainer.vue'
import DictionaryList from '@/modules/authentication-manager-ui/views/dictionary/components/DictionaryList.vue'
import DictionaryItems from '@/modules/authentication-manager-ui/views/dictionary/components/DictionaryItems.vue'
const { t } = useI18n()
const selected = ref<SystemRecord>()
</script>
<template>
  <page-container :title="t('system.dictionary')"
    ><div class="dictionary-workspace panel">
      <aside><dictionary-list @select="selected = $event" /></aside>
      <section>
        <template v-if="selected"
          ><div class="dictionary-summary">
            <div>{{ t('organization.dictionaryId') }}：{{ selected.id }}</div>
            <div>{{ t('system.describe') }}：{{ selected.describe || '--' }}</div>
            <div>
              {{ t('system.createTime') }}：{{
                selected.createTime
                  ? dayjs(Number(selected.createTime)).format('YYYY-MM-DD HH:mm:ss')
                  : '--'
              }}
            </div>
          </div>
          <dictionary-items :key="selected.id" :dictionary="selected" /></template
        ><a-empty v-else />
      </section></div
  ></page-container>
</template>
<style scoped>
.dictionary-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 24px;
}
.dictionary-workspace aside {
  border-right: 1px solid var(--border-color, #f0f0f0);
  padding-right: 16px;
}
.dictionary-workspace section {
  min-width: 0;
}
.dictionary-summary {
  padding: 12px 20px;
  background: #f2f2f2;
  color: #595959;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}
@media (width <= 900px) {
  .dictionary-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .dictionary-workspace aside {
    padding-right: 0;
    border-right: 0;
  }
}
</style>
