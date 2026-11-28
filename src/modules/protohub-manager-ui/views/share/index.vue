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
import { computed, ref, shallowRef, watch, defineAsyncComponent, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { demoTarget } from '../../utils/demo-script'
import type { DemoScriptScope } from '../../types/demo-script'
import type { StudyScope } from '../../types/usability-study'
import { usePublicShare } from '@/modules/protohub-manager-ui/views/share/hooks/usePublicShare'
import { useShareInvitation } from './hooks/useShareInvitation'
import { useReviewIdentity } from './hooks/useReviewIdentity'
import { useShareVisit } from './hooks/useShareVisit'
import { useReviewThreadLocation } from '@/modules/protohub-manager-ui/hooks/useReviewThreadLocation'
import {
  useReviewThreads,
  type ReviewThreadScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreads'
import type {
  ReviewPage,
  ReviewAnchor,
  ReviewElementTarget,
  ReviewThread,
} from '@/modules/protohub-manager-ui/types'
import ReviewThreadsDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsDrawer.vue'
import ReviewThreadsOverviewDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsOverviewDrawer.vue'
import {
  useReviewThreadsOverview,
  type ReviewOverviewScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreadsOverview'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import LoadState from '@/shared/components/LoadState.vue'
import { extensions, type ReviewThreadToolContext } from '@/app/modules/extensions'
const { t } = useI18n()
// Capture and clean before workspace setup can canonicalize its page link and drop the fragment.
const invitation = useShareInvitation()
const { resource, task, password, verify } = usePublicShare()
const route = useRoute(),
  router = useRouter()
const UsabilityStudiesWorkspace = defineAsyncComponent(
  () => import('../../components/UsabilityStudiesWorkspace.vue'),
)
const studiesOpen = ref(false),
  studyScope = shallowRef<StudyScope>(),
  studyTrigger = ref<{ $el: HTMLElement }>(),
  studyWorkspace = ref<{ focusHeading: () => Promise<void> }>()
function openStudies() {
  const { share, context } = resource.data.value
  if (!share?.reviewEnabled || !share.accessKey || !context) return
  studyScope.value = { kind: 'public', share, context }
  studiesOpen.value = true
}
function closeStudies() {
  studiesOpen.value = false
  studyScope.value = undefined
  void nextTick(() => studyTrigger.value?.$el.focus())
}
watch(
  () => [String(route.params.token), route.query.revisionId] as const,
  ([token, revision]) => {
    const fixed = studyScope.value
    if (
      fixed?.kind === 'public' &&
      (token !== fixed.share.token ||
        (revision !== undefined && revision !== fixed.share.revisionId))
    )
      closeStudies()
  },
  { flush: 'sync' },
)
watch(
  () => resource.data.value,
  ({ share, context }) => {
    const fixed = studyScope.value
    if (fixed?.kind !== 'public' || !share) return
    if (
      !share.reviewEnabled ||
      share.token !== fixed.share.token ||
      share.accessKey !== fixed.share.accessKey ||
      share.revisionId !== fixed.share.revisionId
    )
      closeStudies()
    else studyScope.value = { kind: 'public', share, context: context || fixed.context }
  },
  { flush: 'sync' },
)
async function closeIdentity() {
  identityOpen.value = false
  if (studiesOpen.value) {
    await nextTick()
    await studyWorkspace.value?.focusHeading()
  }
}
const DemoScriptsWorkspace = defineAsyncComponent(
  () => import('../../components/DemoScriptsWorkspace.vue'),
)
const demoOpen = ref(false),
  demoTrigger = ref<{ $el: HTMLElement }>()
const demoLocation = computed(() => demoTarget(route.query))
const demoScope = computed<DemoScriptScope | undefined>(() =>
  resource.data.value.share?.accessKey && resource.data.value.context
    ? { kind: 'public', share: resource.data.value.share, context: resource.data.value.context }
    : undefined,
)
watch(
  [demoLocation, demoScope],
  ([target, scope]) => {
    if (!scope) demoOpen.value = false
    else if (target && target.revisionId === scope.context.revisionId) demoOpen.value = true
  },
  { immediate: true },
)
async function closeDemo() {
  demoOpen.value = false
  if (
    route.query.tool === 'demo' ||
    route.query.scriptId !== undefined ||
    route.query.stepId !== undefined
  ) {
    const { tool: _tool, scriptId: _scriptId, stepId: _stepId, ...query } = route.query
    await router.replace({ path: route.path, query })
  }
  await nextTick()
  demoTrigger.value?.$el.focus()
}
const ReviewIdentityDrawer = defineAsyncComponent(
  () => import('./components/ReviewIdentityDrawer.vue'),
)
const PublicApprovalDrawer = defineAsyncComponent(
  () => import('../../components/PublicApprovalDrawer.vue'),
)
const approvalOpen = ref(false),
  approvalTrigger = ref<{ $el: HTMLElement }>()
function closeApproval() {
  approvalOpen.value = false
  void nextTick(() => approvalTrigger.value?.$el.focus())
}
const identityOpen = ref(false),
  feedbackOpen = ref(false),
  overviewOpen = ref(false),
  returnToOverview = ref(false),
  returnToFeedback = ref(false),
  drawing = ref(false)
const selectedPage = ref<ReviewPage>()
const reviewToolBlocked = ref(false)
const share = computed(() => resource.data.value.share)
watch(
  () => [share.value?.token, share.value?.revisionId, share.value?.accessKey],
  () => {
    approvalOpen.value = false
    demoOpen.value = !!(demoLocation.value && demoScope.value)
  },
)
const visit = useShareVisit(share)
const identity = useReviewIdentity(
  computed(
    () =>
      share.value ||
      (studiesOpen.value && studyScope.value?.kind === 'public'
        ? studyScope.value.share
        : undefined),
  ),
  computed(
    () =>
      studiesOpen.value ||
      identityOpen.value ||
      feedbackOpen.value ||
      overviewOpen.value ||
      drawing.value,
  ),
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
  () =>
    feedback.busy.value ||
    feedback.assignment.busy.value ||
    drawing.value ||
    reviewToolBlocked.value,
)
const navigationGuarded = computed(
  () =>
    !!feedback.text.value ||
    !!feedback.imageFile.value ||
    !!feedback.anchor.value ||
    !!feedback.elementTarget.value ||
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
function captureElement() {
  if (!feedback.isPublic.value || feedback.selectedId.value || feedback.busy.value) return
  drawing.value = true
  feedbackOpen.value = false
  workspace.value?.captureElement()
}
function capturedElement(target?: ReviewElementTarget) {
  if (target) feedback.selectElementTarget(target)
  feedbackOpen.value = true
  drawing.value = false
}
function locateElement(target: ReviewElementTarget) {
  if (!feedback.readable.value || feedback.selected.value?.elementTarget !== target) return
  feedbackOpen.value = false
  workspace.value?.locateElement(target)
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
function reviewThreadToolContext(
  thread: ReviewThread,
  disabled: boolean,
): ReviewThreadToolContext | undefined {
  const current = share.value,
    reviewContext = identity.context.value
  if (
    !current?.accessKey ||
    !current.revisionId ||
    !reviewContext ||
    thread.revisionId !== current.revisionId
  )
    return
  return {
    grant: { token: current.token, revisionId: current.revisionId, accessKey: current.accessKey },
    reviewContext,
    threadId: thread.id,
    accessMode: thread.accessMode,
    disabled,
  }
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
    reviewToolBlocked.value = false
  },
)
</script>
<template>
  <div class="fullscreen">
    <a-alert
      v-if="demoLocation === null"
      type="error"
      show-icon
      :message="t('proto.demoInvalidTarget')"
    />
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
        class="share-workspace"
        :context="resource.data.value.context"
        :anchor-epoch="feedback.anchorEpoch.value"
        @runtime-ready="visit.opened"
        @anchor-capture="capturedAnchor"
        @element-capture="capturedElement"
        @page-change="selectedPage = $event"
        ><template #actions>
          <a-button
            v-if="share?.reviewEnabled && share.accessKey && resource.data.value.context"
            ref="studyTrigger"
            @click="openStudies"
            >{{ t('proto.studies') }}</a-button
          >
          <a-button v-if="demoScope" ref="demoTrigger" @click="demoOpen = true">{{
            t('proto.demoScripts')
          }}</a-button>
          <a-button
            v-if="share?.accessKey && share.revisionId"
            ref="approvalTrigger"
            @click="approvalOpen = true"
            >{{ t('proto.approvalTitle') }}</a-button
          >
          <a-button
            v-if="share?.reviewEnabled && share.revisionMode === 'fixed'"
            type="primary"
            :disabled="!selectedPage"
            @click="feedbackOpen = true"
            >{{
              t(feedback.unknown.value ? 'proto.feedbackCheckResult' : 'proto.feedback')
            }}</a-button
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
      <main v-else-if="resource.data.value.share" class="public-shell share-password-shell">
        <section class="panel public-card share-password-card">
          <h1>{{ resource.data.value.share.projectName }}</h1>
          <p class="share-public-version">{{ resource.data.value.share.versionName }}</p>
          <h2>{{ t('proto.sharePasswordProtected') }}</h2>
          <p class="muted">{{ t('proto.sharePublicPasswordHint') }}</p>
          <a-alert
            v-if="invitation.invitation.value !== undefined"
            type="info"
            show-icon
            :message="t('proto.reviewInvitationAccessHint')"
          />
          <a-alert
            v-if="task.error.value"
            class="share-public-error"
            role="alert"
            :message="task.error.value"
            type="error"
            show-icon
          /><a-form layout="vertical" :model="{ password }" @finish="verify"
            ><a-form-item
              name="password"
              :label="t('proto.password')"
              :rules="[{ required: true, message: t('proto.passwordRequired') }]"
              ><a-input-password v-model:value="password" autocomplete="off" /></a-form-item
            ><a-button type="primary" html-type="submit" block :loading="task.busy.value">{{
              t('proto.open')
            }}</a-button></a-form
          >
        </section>
      </main></load-state
    >
  </div>
  <usability-studies-workspace
    v-if="studiesOpen && studyScope"
    ref="studyWorkspace"
    :scope="studyScope"
    :identity="identity.context.value"
    :suspended="identityOpen"
    @close="closeStudies"
    @authenticate="openIdentity"
  />
  <demo-scripts-workspace
    v-if="demoOpen && demoScope"
    :scope="demoScope"
    :initial-target="demoLocation || undefined"
    @close="closeDemo"
  />
  <public-approval-drawer
    v-if="approvalOpen && share?.accessKey"
    :share="share"
    @close="closeApproval"
  />
  <review-identity-drawer
    v-if="identityOpen"
    :state="identity"
    :z-index="studiesOpen ? 1300 : undefined"
    :return-to-feedback="returnToFeedback"
    :return-to-overview="returnToOverview"
    :open="identityOpen"
    :invitation="invitation.invitation.value"
    @close="closeIdentity"
    @feedback="returnFeedback"
    @invitation-used="invitation.abandon"
    @abandon-invitation="invitation.abandon"
  />
  <review-threads-drawer
    :open="feedbackOpen && !overviewOpen && !identityOpen"
    :page="selectedPage"
    :state="feedback"
    :identity-loading="identity.loading.value"
    :external-blocked="reviewToolBlocked"
    @close="threadLocation.close"
    @authenticate="authenticate()"
    @capture-anchor="captureAnchor"
    @capture-element="captureElement"
    @locate-element="locateElement"
    @locate-anchor="locateAnchor"
    @copy-thread="threadLocation.copy(feedback.selected.value, $event)"
    @overview="overviewOpen = true"
  >
    <template #thread-tools="{ thread, disabled }">
      <component
        :is="tool"
        v-for="(tool, index) in extensions.reviewThreadTools"
        :key="index"
        :context="reviewThreadToolContext(thread, disabled)"
        @blocked="reviewToolBlocked = $event"
      />
    </template>
  </review-threads-drawer>
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

<style scoped>
@container prototype-workspace (min-width: 1101px) {
  .share-workspace :deep(.workspace-header) {
    grid-template-columns: minmax(280px, 1fr) auto minmax(0, auto);
  }
  .share-workspace :deep(.workspace-actions) {
    flex-wrap: wrap;
  }
}
.share-password-shell {
  max-height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.share-password-card {
  width: min(30rem, 100%);
  overflow-wrap: anywhere;
}
.share-password-card h1 {
  margin: 0;
  font-size: var(--text-title);
  text-wrap: balance;
}
.share-public-version {
  margin: var(--space-2) 0 var(--space-6);
  color: var(--color-muted);
}
.share-password-card h2 {
  font-size: var(--text-body);
  margin: 0 0 var(--space-2);
}
.share-password-card .muted {
  line-height: 1.6;
  margin: 0 0 var(--space-4);
}
.share-public-error {
  margin-bottom: var(--space-4);
}
</style>
