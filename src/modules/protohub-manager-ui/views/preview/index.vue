<script setup lang="ts">
defineOptions({ name: 'PreviewView' })
import LoadState from '@/shared/components/LoadState.vue'
import { Alert as AAlert, Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
const { data, loading, error, expired, load } = usePreview()
const { t } = useI18n()
</script>
<template>
  <div class="fullscreen">
    <a-alert v-if="expired" type="warning" :message="error" show-icon>
      <template #action
        ><a-button @click="load">{{ t('proto.reauthorizePreview') }}</a-button></template
      >
    </a-alert>
    <load-state v-else :loading="loading" :error="error" @retry="load"
      ><prototype-workspace v-if="data" :context="data"
    /></load-state>
  </div>
</template>
