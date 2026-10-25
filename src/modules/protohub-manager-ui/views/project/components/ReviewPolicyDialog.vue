<script setup lang="ts">
import { ref, shallowRef, watch, onScopeDispose } from 'vue'
import {
  Switch as ASwitch,
  FormItem as AFormItem,
  Alert as AAlert,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import FormModal from '@/shared/components/FormModal.vue'
import LoadState from '@/shared/components/LoadState.vue'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { ApiError } from '@/shared/api/errors'
import type { Share, ReviewPolicy } from '@/modules/protohub-manager-ui/types'

const props = defineProps<{ share: Share }>()
const emit = defineEmits<{ close: []; saved: [policy: ReviewPolicy] }>()
const { t } = useI18n()
const policy = shallowRef<ReviewPolicy>()
const enabled = ref(false),
  allowUnverified = ref(false),
  allowComment = ref(false),
  loading = ref(false),
  busy = ref(false),
  error = ref('')
let controller: AbortController | undefined
let generation = 0
async function load() {
  const epoch = ++generation,
    selected = props.share.id
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  policy.value = undefined
  try {
    const result = await sharesApi.reviewPolicy(selected, {
      signal: controller.signal,
      silent: true,
    })
    if (epoch !== generation) return
    policy.value = result
    enabled.value = result.enabled
    allowUnverified.value = result.allowUnverified === true
    allowComment.value = result.allowComment === true
  } catch {
    if (epoch === generation) error.value = t('proto.reviewPolicyUnavailable')
  } finally {
    if (epoch === generation) loading.value = false
  }
}
async function save() {
  if (!policy.value || busy.value || props.share.revoked) return
  const selected = props.share.id,
    epoch = generation
  busy.value = true
  error.value = ''
  try {
    const changed = await sharesApi.setReviewPolicy(
      selected,
      enabled.value,
      policy.value.configVersion,
      allowUnverified.value,
      enabled.value && allowComment.value,
      { signal: controller?.signal, silent: true },
    )
    if (epoch !== generation) return
    policy.value = changed
    emit('saved', changed)
  } catch (cause) {
    if (epoch === generation) {
      if (cause instanceof ApiError && cause.status === 409) {
        await load()
        if (generation === epoch + 1) error.value = t('proto.shareConflict')
      } else error.value = t('proto.reviewPolicyUnavailable')
    }
  } finally {
    if (epoch === generation || generation === epoch + 1) busy.value = false
  }
}
watch(
  () => props.share.id,
  () => {
    busy.value = false
    void load()
  },
  { immediate: true },
)
onScopeDispose(() => {
  generation++
  controller?.abort()
})
</script>
<template>
  <form-modal
    :open="true"
    :title="t('proto.reviewSettings')"
    :model="{ enabled, allowUnverified, allowComment }"
    :busy="busy || loading"
    :error="error"
    width="min(520px, calc(100vw - 32px))"
    @cancel="emit('close')"
    @submit="save"
  >
    <load-state :loading="loading" :empty="!policy" @retry="load">
      <a-alert type="warning" show-icon :message="t('proto.reviewPolicyHint')" />
      <a-alert
        v-if="policy && !policy.mailAvailable"
        type="warning"
        show-icon
        :message="t('proto.reviewMailUnavailable')"
      />
      <a-form-item name="enabled" :label="t('proto.reviewEnable')">
        <a-switch
          v-model:checked="enabled"
          :aria-label="t('proto.reviewEnable')"
          :disabled="busy || !policy"
        />
      </a-form-item>
      <a-form-item name="allowUnverified" :label="t('proto.reviewAllowUnverified')">
        <a-switch
          v-model:checked="allowUnverified"
          :aria-label="t('proto.reviewAllowUnverified')"
          :disabled="busy || !policy || !enabled"
        />
      </a-form-item>
      <a-alert type="warning" show-icon :message="t('proto.reviewUnverifiedHint')" />
      <a-form-item name="allowComment" :label="t('proto.feedbackAllow')">
        <a-switch
          v-model:checked="allowComment"
          :aria-label="t('proto.feedbackAllow')"
          :disabled="busy || !policy || !enabled || share.revisionMode !== 'fixed'"
        />
      </a-form-item>
      <a-alert type="info" show-icon :message="t('proto.feedbackPolicyHint')" />
    </load-state>
    <a-button v-if="!loading && !policy" @click="load">{{ t('common.retry') }}</a-button>
  </form-modal>
</template>
