<script setup lang="ts">
defineOptions({ name: 'PreviewView' })
import LoadState from '@/shared/components/LoadState.vue'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import {
  useReviewThreads,
  type ReviewThreadScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreads'
import type { ReviewPage } from '@/modules/protohub-manager-ui/types'
import ReviewThreadsDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsDrawer.vue'
import { Alert as AAlert, Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
const { data, project, loading, error, expired, load } = usePreview()
const { t } = useI18n()
const route = useRoute(),
  session = useSession(),
  permissions = usePermissions()
const feedbackOpen = ref(false),
  selectedPage = ref<ReviewPage>()
const feedbackScope = computed<ReviewThreadScope | undefined>(() =>
  data.value &&
  project.value &&
  selectedPage.value &&
  selectedPage.value.revisionId === data.value.revisionId
    ? {
        kind: 'member',
        page: selectedPage.value,
        versionId: String(route.params.versionId),
        project: project.value,
        actorId: session.user?.id || '',
      }
    : undefined,
)
const feedback = useReviewThreads(feedbackScope, feedbackOpen)
</script>
<template>
  <div class="fullscreen">
    <a-alert v-if="expired" type="warning" :message="error" show-icon>
      <template #action
        ><a-button @click="load">{{ t('proto.reauthorizePreview') }}</a-button></template
      >
    </a-alert>
    <load-state v-else :loading="loading" :error="error" @retry="load"
      ><prototype-workspace v-if="data" :context="data" @page-change="selectedPage = $event">
        <template #actions
          ><a-button
            v-if="projectAllows(project, 'edit') && permissions.can(p.version.query)"
            :disabled="!selectedPage"
            @click="feedbackOpen = true"
            >{{ t('proto.feedback') }}</a-button
          ></template
        >
      </prototype-workspace></load-state
    >
  </div>
  <review-threads-drawer
    :open="
      feedbackOpen && !!data && projectAllows(project, 'edit') && permissions.can(p.version.query)
    "
    :page="selectedPage"
    :state="feedback"
    @close="feedbackOpen = false"
  />
</template>
