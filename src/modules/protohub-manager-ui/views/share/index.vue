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
import { computed, ref, watch, defineAsyncComponent } from 'vue'
import { usePublicShare } from '@/modules/protohub-manager-ui/views/share/hooks/usePublicShare'
import { useShareInvitation } from './hooks/useShareInvitation'
import { useReviewIdentity } from './hooks/useReviewIdentity'
import { useShareVisit } from './hooks/useShareVisit'
import { useReviewThreadLocation } from '@/modules/protohub-manager-ui/hooks/useReviewThreadLocation'
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
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import LoadState from '@/shared/components/LoadState.vue'
const { t } = useI18n()
// Capture and clean before workspace setup can canonicalize its page link and drop the fragment.
const invitation = useShareInvitation()
const { resource, task, password, verify } = usePublicShare()
const ReviewIdentityDrawer = defineAsyncComponent(
  () => import('./components/ReviewIdentityDrawer.vue'),
)
const identityOpen = ref(false),
  feedbackOpen = ref(false),
  overviewOpen = ref(false),
  returnToOverview = ref(false),
  returnToFeedback = ref(false),
  drawing = ref(false)
const selectedPage = ref<ReviewPage>()
const share = computed(() => resource.data.value.share)
const visit = useShareVisit(share)
const identity = useReviewIdentity(
  share,
  computed(() => identityOpen.value || feedbackOpen.value || overviewOpen.value || drawing.value),
  invitation.invitation,
)
const feedbackScope = computed<ReviewThreadScope | undefined>(() =>
  share.value &&
  selectedPage.value &&
  selectedPage.value.revisionId === share.value.revisionId &&
  share.value.revisionMode === 'fixed'
    ? {
        kind: 'public',
        share: share.value,
        page: selectedPage.value,
        pendingInvitation: invitation.invitation.value !== undefined,
      }
    : undefined,
)
const threadLocation = useReviewThreadLocation(
  selectedPage,
  feedbackOpen,
  computed(
    () =>
      !!resource.data.value.context &&
      !!share.value?.accessKey &&
      share.value.reviewEnabled === true &&
      share.value.revisionMode === 'fixed',
  ),
)
const feedback = useReviewThreads(feedbackScope, feedbackOpen, identity.context, threadLocation)
const overviewScope = computed<ReviewOverviewScope | undefined>(() =>
  resource.data.value.context && share.value?.revisionId && share.value.revisionMode === 'fixed'
    ? {
        kind: 'public',
        share: share.value,
        revisionId: share.value.revisionId,
        pendingInvitation: invitation.invitation.value !== undefined,
      }
    : undefined,
)
const overview = useReviewThreadsOverview(overviewScope, overviewOpen, identity.context)
const navigationBlocked = computed(
  () => feedback.busy.value || feedback.assignment.busy.value || drawing.value,
)
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
  if (navigationBlocked.value || !overview.readable.value || !resource.data.value.context) return
  if (await threadLocation.view(thread, resource.data.value.context)) overviewOpen.value = false
  else overview.error.value = t('proto.feedbackInvalidTarget')
}
const workspace = ref<InstanceType<typeof PrototypeWorkspace>>()
function captureAnchor(shape: ReviewAnchor['shape']) {
  if (!feedback.isPublic.value || feedback.selectedId.value || feedback.busy.value) return
  drawing.value = true
  feedbackOpen.value = false
  workspace.value?.captureAnchor(shape)
}
function capturedAnchor(anchor?: ReviewAnchor) {
  if (anchor) feedback.selectAnchor(anchor)
  feedbackOpen.value = true
  drawing.value = false
}
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
// A page/actor/grant reset cancels drawing without carrying a late shape into the new draft.
watch(feedback.anchorEpoch, () => {
  drawing.value = false
})
function authenticate(fromOverview = false) {
  identityOpen.value = true
  if (!fromOverview) feedbackOpen.value = false
  returnToOverview.value = fromOverview
  returnToFeedback.value = true
  void identity.load()
}
function returnFeedback() {
  if (!returnToOverview.value) feedbackOpen.value = true
  identityOpen.value = false
  returnToFeedback.value = false
}
function openIdentity() {
  returnToFeedback.value = false
  returnToOverview.value = false
  identityOpen.value = true
}

watch(
  () => [
    resource.data.value.share?.token,
    resource.data.value.share?.revisionId,
    resource.data.value.share?.accessKey,
    resource.data.value.share?.reviewEnabled,
    resource.data.value.share?.reviewUnverifiedAllowed,
  ],
  () => {
    identityOpen.value = feedbackOpen.value = overviewOpen.value = drawing.value = false
    selectedPage.value = undefined
  },
)
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
      v-else-if="resource.data.value.context && threadLocation.unavailable.value"
      type="warning"
      show-icon
      :message="t('proto.feedbackUnavailable')"
    />
    <load-state
      :loading="resource.loading.value || !invitation.ready.value"
      :error="resource.error.value || invitation.error.value"
      @retry="invitation.ready.value ? resource.load() : invitation.clean()"
      ><prototype-workspace
        v-if="invitation.ready.value && resource.data.value.context"
        ref="workspace"
        :context="resource.data.value.context"
        :anchor-epoch="feedback.anchorEpoch.value"
        @runtime-ready="visit.opened"
        @anchor-capture="capturedAnchor"
        @page-change="selectedPage = $event"
        ><template #actions>
          <a-button
            v-if="share?.reviewEnabled && share.revisionMode === 'fixed'"
            type="primary"
            :disabled="!selectedPage"
            @click="feedbackOpen = true"
            >{{ t('proto.feedback') }}</a-button
          >
          <a-button
            v-if="share?.reviewEnabled && share.revisionMode === 'fixed'"
            :disabled="drawing"
            @click="overviewOpen = true"
            >{{ t('proto.feedbackOverview') }}</a-button
          >
          <a-button
            v-if="resource.data.value.share?.reviewEnabled"
            type="text"
            :title="
              resource.data.value.share.reviewAvailable ||
              resource.data.value.share.reviewUnverifiedAllowed
                ? t('proto.reviewIdentity')
                : t('proto.reviewMailUnavailable')
            "
            @click="openIdentity"
            >{{
              t(
                invitation.invitation.value !== undefined
                  ? 'proto.reviewInvitationUse'
                  : 'proto.reviewIdentity',
              )
            }}</a-button
          >
        </template></prototype-workspace
      >
      <main v-else-if="resource.data.value.share" class="public-shell">
        <section class="panel public-card">
          <h1>{{ resource.data.value.share.projectName }}</h1>
          <p>{{ resource.data.value.share.versionName }}</p>
          <a-alert
            v-if="invitation.invitation.value !== undefined"
            type="info"
            show-icon
            :message="t('proto.reviewInvitationAccessHint')"
          />
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
    :state="identity"
    :return-to-feedback="returnToFeedback"
    :return-to-overview="returnToOverview"
    :open="identityOpen"
    :invitation="invitation.invitation.value"
    @close="identityOpen = false"
    @feedback="returnFeedback"
    @invitation-used="invitation.abandon"
    @abandon-invitation="invitation.abandon"
  />
  <review-threads-drawer
    :open="feedbackOpen && !overviewOpen && !identityOpen"
    :page="selectedPage"
    :state="feedback"
    :identity-loading="identity.loading.value"
    @close="threadLocation.close"
    @authenticate="authenticate()"
    @capture-anchor="captureAnchor"
    @locate-anchor="locateAnchor"
    @copy-thread="threadLocation.copy(feedback.selected.value, $event)"
    @overview="overviewOpen = true"
  />
  <review-threads-overview-drawer
    :open="overviewOpen && !identityOpen"
    :state="overview"
    :identity-loading="identity.loading.value"
    :blocked="navigationBlocked"
    :guarded="navigationGuarded"
    :current-thread-id="feedback.selectedId.value"
    @close="overviewOpen = false"
    @authenticate="authenticate(true)"
    @view="viewOverview"
  />
</template>
