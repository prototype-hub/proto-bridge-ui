<script setup lang="ts">
defineOptions({ name: 'PreviewView' })
import LoadState from '@/shared/components/LoadState.vue'
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { demoTarget } from '../../utils/demo-script'
import type { DemoScriptScope } from '../../types/demo-script'
import type { StudyScope } from '../../types/usability-study'
import type { DesignTokenScope } from '../../types/design-token-package'
import { previewIdentity } from '../../utils/preview-location'
import { searchTool } from '../../utils/search'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
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
import CopyInventoryDrawer from '@/modules/protohub-manager-ui/components/CopyInventoryDrawer.vue'
import FunctionalSpecsSidebar from '@/modules/protohub-manager-ui/components/FunctionalSpecsSidebar.vue'
import ViewportChecksDrawer from '@/modules/protohub-manager-ui/components/ViewportChecksDrawer.vue'
import { DownOutlined } from '@ant-design/icons-vue'
import ReviewAssociationsDrawer from '@/modules/protohub-manager-ui/components/ReviewAssociationsDrawer.vue'
import { useReviewAssociations } from '@/modules/protohub-manager-ui/hooks/useReviewAssociations'
import ReviewThreadsDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsDrawer.vue'
import ReviewThreadsOverviewDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsOverviewDrawer.vue'
import {
  useReviewThreadsOverview,
  type ReviewOverviewScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreadsOverview'
import {
  Alert as AAlert,
  Button as AButton,
  Drawer as ADrawer,
  Dropdown as ADropdown,
  Menu as AMenu,
  MenuItem as AMenuItem,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
import { useReviewThreadLocation } from '@/modules/protohub-manager-ui/hooks/useReviewThreadLocation'
const studiesOpen = ref(false)
const studyScope = shallowRef<StudyScope>()
function revokeStudies() {
  studiesOpen.value = false
  studyScope.value = undefined
}
const tokenPackagesOpen = ref(false)
const tokenPackageScope = shallowRef<DesignTokenScope>()
function revokeTokenPackages() {
  tokenPackagesOpen.value = false
  tokenPackageScope.value = undefined
}
const { data, project, revision, loading, error, expired, load } = usePreview(() => {
  revokeTokenPackages()
  revokeStudies()
})
const RevisionAssetsPanel = defineAsyncComponent(
  () => import('../../components/RevisionAssetsPanel.vue'),
)
const RevisionMaterialsPanel = defineAsyncComponent(
  () => import('../../components/RevisionMaterialsPanel.vue'),
)
const PageDeliveryDrawer = defineAsyncComponent(
  () => import('../project/components/PageDeliveryDrawer.vue'),
)
const DeliveryDocumentWorkspace = defineAsyncComponent(
  () => import('../../components/DeliveryDocumentWorkspace.vue'),
)
const RevisionApprovalPanel = defineAsyncComponent(
  () => import('../../components/RevisionApprovalPanel.vue'),
)
const PageTraceWorkspace = defineAsyncComponent(
  () => import('../../components/PageTraceWorkspace.vue'),
)
const CodeMappingsWorkspace = defineAsyncComponent(
  () => import('../../components/CodeMappingsWorkspace.vue'),
)
const DesignTokenPackagesWorkspace = defineAsyncComponent(
  () => import('../../components/DesignTokenPackagesWorkspace.vue'),
)
function openTokenPackages() {
  if (
    !assetsAllowed.value ||
    !project.value ||
    !revision.value ||
    !session.user?.id ||
    data.value?.revisionId !== revision.value.id
  )
    return
  tokenPackageScope.value = {
    actorId: session.user.id,
    project: project.value,
    revision: revision.value,
  }
  tokenPackagesOpen.value = true
}
function closeTokenPackages() {
  revokeTokenPackages()
  void nextTick(() => (assetsTrigger.value?.$el || reauthorizeTrigger.value?.$el)?.focus())
}
const codeMappingsOpen = ref(false)
const codeMappingLocation = ref<{ revisionId: string; pageId: string; anchor: ReviewAnchor }>()
function closeCodeMappings() {
  codeMappingsOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
/** Geometry remains local; only the existing fixed revision/page identities enter navigation. */
async function locateCodeMapping(value: { pageId: string; anchor: ReviewAnchor }) {
  if (!assetsAllowed.value || !data.value?.revisionId || !revision.value || !project.value) return
  codeMappingsOpen.value = false
  functionalOpen.value = false
  if (selectedPage.value?.pageId === value.pageId) {
    await nextTick()
    workspace.value?.locateAnchor(value.anchor)
    return
  }
  codeMappingLocation.value = { ...value, revisionId: data.value.revisionId }
  await router.replace({
    path: route.path,
    query: { revisionId: data.value.revisionId, pageId: value.pageId },
  })
}
function runtimeReady() {
  functionalPanel.value?.runtimeReady()
  const pending = codeMappingLocation.value
  if (!pending) return
  codeMappingLocation.value = undefined
  if (
    assetsAllowed.value &&
    pending.revisionId === data.value?.revisionId &&
    selectedPage.value?.pageId === pending.pageId
  )
    workspace.value?.locateAnchor(pending.anchor)
}
const traceOpen = ref(false)
function closeTrace() {
  traceOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const approvalOpen = ref(false)
const approvalPanel = ref<InstanceType<typeof RevisionApprovalPanel>>()
async function closeApproval() {
  if (approvalPanel.value && !(await approvalPanel.value.canLeave())) return
  finishApproval()
}
function finishApproval() {
  approvalOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const documentOpen = ref(false)
function closeDocument() {
  documentOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const deliveryPageId = ref<string>()
function openDelivery() {
  if (assetsAllowed.value && selectedPage.value) deliveryPageId.value = selectedPage.value.pageId
}
function closeDelivery() {
  deliveryPageId.value = undefined
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const materialsOpen = ref(false)
const materialsPanel = ref<InstanceType<typeof RevisionMaterialsPanel>>()
async function closeMaterials() {
  if (materialsPanel.value && !(await materialsPanel.value.canLeave())) return
  materialsOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const { t } = useI18n()
const route = useRoute(),
  router = useRouter(),
  session = useSession(),
  permissions = usePermissions()
const feedbackOpen = ref(false),
  overviewOpen = ref(false),
  selectedPage = ref<ReviewPage>()
const assetsOpen = ref(false),
  copyOpen = ref(false)
const functionalOpen = ref(false)
const functionalPanel = ref<InstanceType<typeof FunctionalSpecsSidebar>>()
function openFunctional() {
  if (assetsAllowed.value && selectedPage.value) functionalOpen.value = true
}
function closeFunctional() {
  functionalOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const viewportOpen = ref(false)
const viewportPage = ref<ReviewPage>()
function openViewport() {
  if (!assetsAllowed.value || !selectedPage.value) return
  viewportPage.value = selectedPage.value
  viewportOpen.value = true
}
function closeViewport() {
  viewportOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const copyPage = ref<ReviewPage>()
function openCopy() {
  if (!assetsAllowed.value || !selectedPage.value) return
  copyPage.value = selectedPage.value
  copyOpen.value = true
}
function closeCopy() {
  copyOpen.value = false
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
const assetsTrigger = ref<{ $el: HTMLElement }>()
const reauthorizeTrigger = ref<{ $el: HTMLElement }>()
const assetsAllowed = computed(
  () =>
    !!data.value &&
    !!revision.value &&
    projectAllows(project.value, 'read') &&
    permissions.can(p.version.query),
)
// Member metadata keeps its exact scope when only the untrusted runtime grant expires.
watch(
  () =>
    [
      session.user?.id,
      String(route.params.projectId),
      String(route.params.versionId),
      previewIdentity(route.query.revisionId),
      permissions.can(p.version.query),
      project.value,
      revision.value,
    ] as const,
  (
    [actorId, projectId, versionId, revisionId, canQuery, currentProject, currentRevision],
    previous,
  ) => {
    const fixed = tokenPackageScope.value
    if (!fixed) return
    if (
      actorId !== fixed.actorId ||
      projectId !== fixed.project.id ||
      versionId !== fixed.revision.versionId ||
      revisionId === null ||
      (revisionId !== undefined && revisionId !== fixed.revision.id) ||
      (revisionId === undefined && previous?.[3] !== undefined) ||
      !canQuery ||
      (currentProject &&
        (currentProject.id !== fixed.project.id || !projectAllows(currentProject, 'read'))) ||
      (currentRevision &&
        (currentRevision.id !== fixed.revision.id ||
          currentRevision.projectId !== fixed.project.id ||
          currentRevision.versionId !== fixed.revision.versionId))
    ) {
      revokeTokenPackages()
    } else if (currentProject || currentRevision) {
      tokenPackageScope.value = {
        actorId: fixed.actorId,
        project: currentProject || fixed.project,
        revision: currentRevision || fixed.revision,
      }
    }
  },
  { flush: 'sync' },
)
watch(assetsAllowed, (allowed) => {
  if (!allowed) {
    assetsOpen.value =
      copyOpen.value =
      viewportOpen.value =
      materialsOpen.value =
      functionalOpen.value =
        false
    traceOpen.value = false
    codeMappingsOpen.value = false
    codeMappingLocation.value = undefined
    approvalOpen.value = false
    documentOpen.value = false
    deliveryPageId.value = undefined
  }
})
const UsabilityStudiesWorkspace = defineAsyncComponent(
  () => import('../../components/UsabilityStudiesWorkspace.vue'),
)
function openStudies() {
  if (!assetsAllowed.value || !project.value || !revision.value || !data.value || !session.user?.id)
    return
  studyScope.value = {
    kind: 'member',
    actorId: session.user.id,
    project: project.value,
    revision: revision.value,
    context: data.value,
  }
  studiesOpen.value = true
}
function closeStudies() {
  revokeStudies()
  void nextTick(() => assetsTrigger.value?.$el.focus())
}
// Runtime grants can expire without invalidating the member's revision-scoped unsaved study.
watch(
  () =>
    [
      session.user?.id,
      String(route.params.projectId),
      String(route.params.versionId),
      previewIdentity(route.query.revisionId),
      permissions.can(p.version.query),
      project.value,
      revision.value,
      data.value,
    ] as const,
  (
    [actor, projectId, versionId, revisionId, canQuery, currentProject, currentRevision, context],
    previous,
  ) => {
    const fixed = studyScope.value
    if (fixed?.kind !== 'member') return
    if (
      actor !== fixed.actorId ||
      projectId !== fixed.project.id ||
      versionId !== fixed.revision.versionId ||
      revisionId === null ||
      (revisionId !== undefined && revisionId !== fixed.revision.id) ||
      (revisionId === undefined && previous?.[3] !== undefined) ||
      !canQuery ||
      (currentProject &&
        (currentProject.id !== fixed.project.id || !projectAllows(currentProject, 'read'))) ||
      (currentRevision &&
        (currentRevision.id !== fixed.revision.id ||
          currentRevision.projectId !== fixed.project.id ||
          currentRevision.versionId !== fixed.revision.versionId))
    )
      revokeStudies()
    else if (currentProject || currentRevision || context)
      studyScope.value = {
        ...fixed,
        project: currentProject || fixed.project,
        revision: currentRevision || fixed.revision,
        context: context?.revisionId === fixed.revision.id ? context : fixed.context,
      }
  },
  { flush: 'sync' },
)
const DemoScriptsWorkspace = defineAsyncComponent(
  () => import('../../components/DemoScriptsWorkspace.vue'),
)
const demoOpen = ref(false)
const demoScope = computed<DemoScriptScope | undefined>(() =>
  assetsAllowed.value && project.value && revision.value && data.value && session.user?.id
    ? {
        kind: 'member',
        actorId: session.user.id,
        project: project.value,
        revision: revision.value,
        context: data.value,
      }
    : undefined,
)
const demoLocation = computed(() => demoTarget(route.query))
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
  assetsTrigger.value?.$el.focus()
}
const requestedTool = computed(() => searchTool(route.query))
const initialTool = requestedTool.value,
  initialRevision = route.query.revisionId,
  initialPage = route.query.pageId,
  initialMaterial = route.query.materialId
const invalidSearchSource = computed(() => initialTool === null || requestedTool.value === null)
let openedSearchSource = false
watch([() => route.fullPath, data, selectedPage, assetsAllowed], () => {
  const tool = requestedTool.value
  if (
    !tool ||
    tool !== initialTool ||
    !assetsAllowed.value ||
    openedSearchSource ||
    route.query.revisionId !== initialRevision ||
    (tool === 'materials' && route.query.materialId !== initialMaterial) ||
    (tool === 'copy' && route.query.pageId !== initialPage)
  )
    return
  if (data.value?.revisionId !== route.query.revisionId) return
  if (tool === 'copy') {
    if (selectedPage.value?.pageId !== route.query.pageId) return
    openCopy()
  } else materialsOpen.value = true
  openedSearchSource = true
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
const feedbackTrigger = ref<{ $el: HTMLElement }>()
let restoreFeedbackTrigger = false
function closeFeedback() {
  restoreFeedbackTrigger = true
  threadLocation.close()
}
function afterFeedbackClose() {
  if (!restoreFeedbackTrigger || feedbackOpen.value) return
  restoreFeedbackTrigger = false
  feedbackTrigger.value?.$el.focus()
}
const associationOpen = ref(false),
  restoreAssociationFocus = ref(false)
const association = useReviewAssociations(
  project,
  feedback.selected,
  associationOpen,
  computed(() => session.user?.id || ''),
)
function openAssociation() {
  if (
    !association.readable.value ||
    feedback.busy.value ||
    feedback.assignment.busy.value ||
    feedback.assignment.unknown.value
  )
    return
  restoreAssociationFocus.value = false
  associationOpen.value = true
}
function closeAssociation() {
  if (association.busy.value || association.unknown.value) return
  restoreAssociationFocus.value = true
  associationOpen.value = false
}
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
const navigationBlocked = computed(
  () =>
    feedback.busy.value ||
    feedback.assignment.busy.value ||
    association.busy.value ||
    association.unknown.value,
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
  if (navigationBlocked.value || !overview.readable.value || !data.value) return
  if (await threadLocation.view(thread, data.value)) overviewOpen.value = false
  else overview.error.value = t('proto.feedbackInvalidTarget')
}
const workspace = ref<InstanceType<typeof PrototypeWorkspace>>()
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
      v-if="invalidSearchSource"
      type="error"
      show-icon
      :message="t('proto.searchInvalidTarget')"
    />
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
        ><a-button ref="reauthorizeTrigger" @click="load">{{
          t('proto.reauthorizePreview')
        }}</a-button></template
      >
    </a-alert>
    <load-state v-else :loading="loading" :error="error" @retry="load"
      ><div class="preview-functional-shell">
        <prototype-workspace
          v-if="data"
          ref="workspace"
          :context="data"
          :anchor-epoch="feedback.anchorEpoch.value"
          @page-change="selectedPage = $event"
          @anchor-capture="functionalPanel?.receiveAnchor($event)"
          @runtime-ready="runtimeReady"
        >
          <template #actions
            ><a-dropdown v-if="assetsAllowed" :trigger="['click']"
              ><a-button ref="assetsTrigger" class="page-resource-trigger"
                ><span class="page-resource-label">{{ t('proto.pageResources') }}</span
                ><down-outlined aria-hidden="true" /></a-button
              ><template #overlay
                ><a-menu
                  ><a-menu-item key="search"
                    ><router-link
                      :to="{
                        name: 'PrototypeHub-search',
                        query: {
                          projectId: project?.id,
                          versionId: String(route.params.versionId),
                          revisionId: data.revisionId,
                        },
                      }"
                      target="_blank"
                      rel="noopener"
                      :title="t('proto.searchNewWindow')"
                      >{{ t('proto.searchThisRevision') }}</router-link
                    ></a-menu-item
                  ><a-menu-item
                    key="code-mappings"
                    :disabled="!selectedPage"
                    @click="codeMappingsOpen = true"
                    >{{ t('proto.codeMappings') }}</a-menu-item
                  ><a-menu-item key="trace" @click="traceOpen = true">{{
                    t('proto.traceTitle')
                  }}</a-menu-item
                  ><a-menu-item key="approval" @click="approvalOpen = true">{{
                    t('proto.approvalTitle')
                  }}</a-menu-item
                  ><a-menu-item key="studies" @click="openStudies">{{
                    t('proto.studies')
                  }}</a-menu-item
                  ><a-menu-item key="demo" @click="demoOpen = true">{{
                    t('proto.demoScripts')
                  }}</a-menu-item
                  ><a-menu-item key="delivery-document" @click="documentOpen = true">{{
                    t('proto.deliveryDocument')
                  }}</a-menu-item
                  ><a-menu-item key="delivery" :disabled="!selectedPage" @click="openDelivery">{{
                    t('proto.pageDelivery')
                  }}</a-menu-item
                  ><a-menu-item key="materials" @click="materialsOpen = true">{{
                    t('proto.materials')
                  }}</a-menu-item
                  ><a-menu-item key="design-token-packages" @click="openTokenPackages">{{
                    t('proto.tokenPackages')
                  }}</a-menu-item
                  ><a-menu-item key="copy" :disabled="!selectedPage" @click="openCopy">{{
                    t('proto.copyInventory')
                  }}</a-menu-item
                  ><a-menu-item
                    key="functional"
                    :disabled="!selectedPage"
                    @click="openFunctional"
                    >{{ t('proto.functionalSpecs') }}</a-menu-item
                  ><a-menu-item key="viewport" :disabled="!selectedPage" @click="openViewport">{{
                    t('proto.viewportChecks')
                  }}</a-menu-item
                  ><a-menu-item key="assets" @click="assetsOpen = true">{{
                    t('proto.originalAssets')
                  }}</a-menu-item></a-menu
                ></template
              ></a-dropdown
            ><a-button
              v-if="projectAllows(project, 'edit') && permissions.can(p.version.query)"
              ref="feedbackTrigger"
              type="primary"
              :disabled="!selectedPage"
              @click="feedbackOpen = true"
              >{{
                t(feedback.unknown.value ? 'proto.feedbackCheckResult' : 'proto.feedback')
              }}</a-button
            ><a-button
              v-if="projectAllows(project, 'edit') && permissions.can(p.version.query)"
              @click="overviewOpen = true"
              >{{ t('proto.feedbackOverview') }}</a-button
            ></template
          >
        </prototype-workspace>
        <functional-specs-sidebar
          v-if="functionalOpen && assetsAllowed && project && revision && data && selectedPage"
          ref="functionalPanel"
          :project="project"
          :revision="revision"
          :context="data"
          :page="selectedPage"
          @close="closeFunctional"
          @capture="workspace?.captureAnchor($event)"
          @locate="workspace?.locateAnchor($event)"
          @clear="workspace?.clearAnchor()"
        /></div
    ></load-state>
  </div>
  <design-token-packages-workspace
    v-if="tokenPackagesOpen && tokenPackageScope"
    :scope="tokenPackageScope"
    @close="closeTokenPackages"
  />
  <code-mappings-workspace
    v-if="codeMappingsOpen && assetsAllowed && project && revision && data && session.user?.id"
    :scope="{
      actorId: session.user.id,
      project,
      revision,
      context: data,
      initialPage: selectedPage,
    }"
    @close="closeCodeMappings"
    @locate="locateCodeMapping"
  />
  <page-trace-workspace
    v-if="traceOpen && assetsAllowed && project && revision && data && session.user?.id"
    :scope="{
      actorId: session.user.id,
      project,
      revision,
      context: data,
      initialPage: selectedPage,
    }"
    @close="closeTrace"
  />
  <usability-studies-workspace
    v-if="studiesOpen && studyScope"
    :scope="studyScope"
    @close="closeStudies"
  />
  <demo-scripts-workspace
    v-if="demoOpen && demoScope"
    :scope="demoScope"
    :initial-target="demoLocation || undefined"
    @close="closeDemo"
  />
  <a-drawer
    :open="materialsOpen && assetsAllowed"
    :title="t('proto.materials')"
    width="min(1100px, 100vw)"
    :mask-closable="false"
    root-class-name="revision-materials-drawer"
    @close="closeMaterials"
  >
    <revision-materials-panel
      v-if="materialsOpen && assetsAllowed && revision"
      ref="materialsPanel"
      :revision="revision"
      :project="project"
      :allowed="assetsAllowed"
      :material-id="
        initialTool === 'materials' && typeof initialMaterial === 'string'
          ? initialMaterial
          : undefined
      "
      @close="closeMaterials"
    />
  </a-drawer>
  <a-drawer
    :open="approvalOpen && assetsAllowed"
    :title="t('proto.approvalTitle')"
    width="min(800px, 100vw)"
    :closable="false"
    :keyboard="!approvalPanel?.blocked"
    :mask-closable="!approvalPanel?.blocked"
    @close="closeApproval"
  >
    <revision-approval-panel
      v-if="approvalOpen && assetsAllowed"
      ref="approvalPanel"
      :project="project"
      :revision="revision"
      @close="finishApproval"
    />
  </a-drawer>
  <delivery-document-workspace
    v-if="documentOpen && assetsAllowed && project && revision && data"
    :project="project"
    :revision="revision"
    :context="data"
    @close="closeDocument"
  />
  <viewport-checks-drawer
    v-if="viewportOpen && assetsAllowed && project && revision && data"
    :project="project"
    :revision="revision"
    :context="data"
    :initial-page="viewportPage"
    @close="closeViewport"
  />
  <page-delivery-drawer
    v-if="deliveryPageId && assetsAllowed"
    :project="project"
    :revision="revision"
    :page-id="deliveryPageId"
    @close="closeDelivery"
  />
  <copy-inventory-drawer
    v-if="copyOpen && assetsAllowed"
    :project="project"
    :revision="revision"
    :initial-page="copyPage"
    @close="closeCopy"
  />
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
      !associationOpen &&
      !overviewOpen &&
      !!data &&
      projectAllows(project, 'edit') &&
      permissions.can(p.version.query)
    "
    :page="selectedPage"
    :state="feedback"
    :can-associate="association.readable.value"
    :restore-association-focus="restoreAssociationFocus"
    @associate="openAssociation"
    @association-focus-restored="restoreAssociationFocus = false"
    @close="closeFeedback"
    @after-close="afterFeedbackClose"
    @locate-anchor="locateAnchor"
    @locate-element="locateElement"
    @copy-thread="threadLocation.copy(feedback.selected.value, $event)"
    @overview="overviewOpen = true"
  />
  <review-associations-drawer
    :open="associationOpen"
    :state="association"
    :project-name="project?.name || ''"
    :version-name="data?.versionName || ''"
    @close="closeAssociation"
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
<style scoped>
.page-resource-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}
.page-resource-label {
  min-width: 0;
}
.page-resource-trigger > .anticon {
  flex: none;
  margin-inline-start: 0;
}
</style>

<style scoped>
.preview-functional-shell {
  display: flex;
  min-width: 0;
  height: 100dvh;
}
.preview-functional-shell > :first-child {
  flex: 1;
  min-width: 0;
}
</style>
