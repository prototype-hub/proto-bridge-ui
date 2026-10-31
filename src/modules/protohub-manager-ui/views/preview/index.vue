<script setup lang="ts">
defineOptions({ name: 'PreviewView' })
import LoadState from '@/shared/components/LoadState.vue'
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import {
  useReviewThreads,
  type ReviewThreadScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreads'
import type { ReviewPage, ReviewAnchor, ReviewThread } from '@/modules/protohub-manager-ui/types'
import ReviewThreadsDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsDrawer.vue'
import ReviewThreadsOverviewDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsOverviewDrawer.vue'
import {
  useReviewThreadsOverview,
  type ReviewOverviewScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreadsOverview'
import { Alert as AAlert, Button as AButton, Drawer as ADrawer } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
import { useReviewThreadLocation } from '@/modules/protohub-manager-ui/hooks/useReviewThreadLocation'
const { data, project, revision, loading, error, expired, load } = usePreview()
const RevisionAssetsPanel = defineAsyncComponent(
  () => import('../../components/RevisionAssetsPanel.vue'),
)
const { t } = useI18n()
const route = useRoute(),
  session = useSession(),
  permissions = usePermissions()
const feedbackOpen = ref(false),
  overviewOpen = ref(false),
  selectedPage = ref<ReviewPage>()
const assetsOpen = ref(false)
const assetsTrigger = ref<{ $el: HTMLElement }>()
const assetsAllowed = computed(
  () =>
    !!data.value &&
    !!revision.value &&
    projectAllows(project.value, 'read') &&
    permissions.can(p.version.query),
)
watch(assetsAllowed, (allowed) => {
  if (!allowed) assetsOpen.value = false
})
function closeAssets() {
  assetsOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
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
const threadLocation = useReviewThreadLocation(
  selectedPage,
  feedbackOpen,
  computed(
    () => !!data.value && projectAllows(project.value, 'edit') && permissions.can(p.version.query),
  ),
)
const feedback = useReviewThreads(feedbackScope, feedbackOpen, undefined, threadLocation)
const overviewScope = computed<ReviewOverviewScope | undefined>(() =>
  data.value?.revisionId && project.value
    ? {
        kind: 'member',
        revisionId: data.value.revisionId,
        versionId: String(route.params.versionId),
        project: project.value,
        actorId: session.user?.id || '',
      }
    : undefined,
)
const overview = useReviewThreadsOverview(overviewScope, overviewOpen)
const navigationBlocked = computed(() => feedback.busy.value || feedback.assignment.busy.value)
const navigationGuarded = computed(
  () =>
    !!feedback.text.value ||
    !!feedback.imageFile.value ||
    !!feedback.anchor.value ||
    feedback.hasPendingRequest.value ||
    feedback.assignment.editing.value ||
    feedback.assignment.unknown.value,
)
async function viewOverview(thread: ReviewThread) {
  if (navigationBlocked.value || !overview.readable.value || !data.value) return
  if (await threadLocation.view(thread, data.value)) overviewOpen.value = false
  else overview.error.value = t('proto.feedbackInvalidTarget')
}
const workspace = ref<InstanceType<typeof PrototypeWorkspace>>()
function locateAnchor(anchor: ReviewAnchor) {
  if (
    !feedback.readable.value ||
    !feedback.selected.value ||
    feedback.selected.value.anchor !== anchor
  )
    return
  feedbackOpen.value = false
  workspace.value?.locateAnchor(anchor)
}
</script>
<template>
  <div class="fullscreen">
    <a-alert
      v-if="threadLocation.invalid.value"
      type="error"
      show-icon
      :message="t('proto.feedbackInvalidTarget')"
    />
    <a-alert
      v-else-if="data && threadLocation.unavailable.value"
      type="warning"
      show-icon
      :message="t('proto.feedbackUnavailable')"
    />
    <a-alert v-if="expired" type="warning" :message="error" show-icon>
      <template #action
        ><a-button @click="load">{{ t('proto.reauthorizePreview') }}</a-button></template
      >
    </a-alert>
    <load-state v-else :loading="loading" :error="error" @retry="load"
      ><prototype-workspace
        v-if="data"
        ref="workspace"
        :context="data"
        :anchor-epoch="feedback.anchorEpoch.value"
        @page-change="selectedPage = $event"
      >
        <template #actions
          ><a-button v-if="assetsAllowed" ref="assetsTrigger" @click="assetsOpen = true">{{
            t('proto.originalAssets')
          }}</a-button
          ><a-button
            v-if="projectAllows(project, 'edit') && permissions.can(p.version.query)"
            type="primary"
            :disabled="!selectedPage"
            @click="feedbackOpen = true"
            >{{ t('proto.feedback') }}</a-button
          ><a-button
            v-if="projectAllows(project, 'edit') && permissions.can(p.version.query)"
            @click="overviewOpen = true"
            >{{ t('proto.feedbackOverview') }}</a-button
          ></template
        >
      </prototype-workspace></load-state
    >
  </div>
  <a-drawer
    :open="assetsOpen && assetsAllowed"
    :title="t('proto.originalAssets')"
    width="min(960px, 100vw)"
    root-class-name="revision-assets-drawer"
    @close="closeAssets"
  >
    <revision-assets-panel
      v-if="assetsOpen && assetsAllowed && revision"
      :revision="revision"
      :project-name="project?.name || revision.projectId"
      :allowed="assetsAllowed"
      @close="closeAssets"
    />
  </a-drawer>
  <review-threads-drawer
    :open="
      feedbackOpen &&
      !overviewOpen &&
      !!data &&
      projectAllows(project, 'edit') &&
      permissions.can(p.version.query)
    "
    :page="selectedPage"
    :state="feedback"
    @close="threadLocation.close"
    @locate-anchor="locateAnchor"
    @copy-thread="threadLocation.copy(feedback.selected.value, $event)"
    @overview="overviewOpen = true"
  />
  <review-threads-overview-drawer
    :open="
      overviewOpen && !!data && projectAllows(project, 'edit') && permissions.can(p.version.query)
    "
    :state="overview"
    :blocked="navigationBlocked"
    :guarded="navigationGuarded"
    :current-thread-id="feedback.selectedId.value"
    @close="overviewOpen = false"
    @view="viewOverview"
  />
</template>
