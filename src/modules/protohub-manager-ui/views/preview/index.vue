<script setup lang="ts">
defineOptions({ name: 'PreviewView' })
import LoadState from '@/shared/components/LoadState.vue'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
const { data, loading, error, load } = usePreview()
</script>
<template>
  <div class="fullscreen">
    <load-state :loading="loading" :error="error" @retry="load"
      ><prototype-workspace v-if="data" :context="data"
    /></load-state>
  </div>
</template>
