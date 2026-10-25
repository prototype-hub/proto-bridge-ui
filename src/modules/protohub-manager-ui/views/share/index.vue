<script setup lang="ts">
defineOptions({ name: 'ShareView' })
import {
  InputPassword as AInputPassword,
  Form as AForm,
  FormItem as AFormItem,
  Button as AButton,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { ref, watch, defineAsyncComponent } from 'vue'
import { usePublicShare } from '@/modules/protohub-manager-ui/views/share/hooks/usePublicShare'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import LoadState from '@/shared/components/LoadState.vue'
const { t } = useI18n()
const { resource, task, password, verify } = usePublicShare()
const ReviewIdentityDrawer = defineAsyncComponent(
  () => import('./components/ReviewIdentityDrawer.vue'),
)
const identityOpen = ref(false)
watch(
  () => [
    resource.data.value.share?.token,
    resource.data.value.share?.revisionId,
    resource.data.value.share?.accessKey,
    resource.data.value.share?.reviewEnabled,
    resource.data.value.share?.reviewUnverifiedAllowed,
  ],
  () => {
    identityOpen.value = false
  },
)
</script>
<template>
  <div class="fullscreen">
    <load-state
      :loading="resource.loading.value"
      :error="resource.error.value"
      @retry="resource.load"
      ><prototype-workspace
        v-if="resource.data.value.context"
        :context="resource.data.value.context"
        ><template #actions>
          <a-button
            v-if="resource.data.value.share?.reviewEnabled"
            :title="
              resource.data.value.share.reviewAvailable ||
              resource.data.value.share.reviewUnverifiedAllowed
                ? t('proto.reviewIdentity')
                : t('proto.reviewMailUnavailable')
            "
            @click="identityOpen = true"
            >{{ t('proto.reviewIdentity') }}</a-button
          >
        </template></prototype-workspace
      >
      <main v-else-if="resource.data.value.share" class="public-shell">
        <section class="panel public-card">
          <h1>{{ resource.data.value.share.projectName }}</h1>
          <p>{{ resource.data.value.share.versionName }}</p>
          <a-alert v-if="task.error.value" :message="task.error.value" type="error" /><a-form
            layout="vertical"
            :model="{ password }"
            @finish="verify"
            ><a-form-item
              name="password"
              :label="t('proto.password')"
              :rules="[{ required: true, message: t('proto.passwordRequired') }]"
              ><a-input-password
                v-model:value="password"
                autofocus
                autocomplete="off" /></a-form-item
            ><a-button type="primary" html-type="submit" block :loading="task.busy.value">{{
              t('proto.open')
            }}</a-button></a-form
          >
        </section>
      </main></load-state
    >
  </div>
  <review-identity-drawer
    v-if="identityOpen"
    :share="resource.data.value.share"
    :open="identityOpen"
    @close="identityOpen = false"
  />
</template>
