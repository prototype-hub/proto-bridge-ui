import { computed, reactive, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import {
  flattenPages,
  previewIdentity,
  stablePageId,
} from '@/modules/protohub-manager-ui/utils/preview-location'
import { runtimePageUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { copyText } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'
import type {
  ComparisonPage,
  PrototypePage,
  PreviewSession,
  RevisionComparison,
  WorkspaceContext,
  WorkspacePane,
} from '@/modules/protohub-manager-ui/types'

const sides: WorkspacePane[] = ['left', 'right']
interface PaneState {
  session?: PreviewSession
  loading: boolean
  error: string
  expired: boolean
}

/** Own an immutable pair, independent page locations, and two explicitly renewable short grants. */
export function useRevisionComparison() {
  const route = useRoute(),
    router = useRouter()
  const data = shallowRef<RevisionComparison>()
  const loading = ref(false),
    error = ref('')
  const includeUnchanged = ref(false)
  const paging = reactive({
    pagesPageIndex: 0,
    pagesPageSize: 50,
    filesPageIndex: 0,
    filesPageSize: 50,
  })
  const trees = shallowRef<Record<WorkspacePane, PrototypePage[]>>({ left: [], right: [] })
  const panes = reactive<Record<WorkspacePane, PaneState>>({
    left: { loading: false, error: '', expired: false },
    right: { loading: false, error: '', expired: false },
  })
  const controllers: Partial<Record<WorkspacePane, AbortController>> = {}
  const timers: Partial<Record<WorkspacePane, ReturnType<typeof setTimeout>>> = {}
  let comparisonRequest: AbortController | undefined
  let generation = 0
  let requestNumber = 0
  const selectedPath = ref('')
  const pair = computed(() => ({
    projectId: previewIdentity(route.params.projectId),
    versionId: previewIdentity(route.params.versionId),
    leftRevisionId: previewIdentity(route.query.leftRevisionId),
    rightRevisionId: previewIdentity(route.query.rightRevisionId),
  }))

  function clearPanes() {
    for (const side of sides) {
      controllers[side]?.abort()
      clearTimeout(timers[side])
      Object.assign(panes[side], { session: undefined, loading: false, error: '', expired: false })
    }
  }
  const selection = computed(() => {
    const output: Partial<Record<WorkspacePane, PrototypePage>> = {}
    let invalid = false
    for (const side of sides) {
      const raw = route.query[`${side}PageId`]
      const id = previewIdentity(raw)
      if (id === null) invalid = true
      if (id) {
        const matches = flattenPages(trees.value[side]).filter((page) => page.pageId === id)
        if (matches.length !== 1 || !matches[0]?.path || matches[0].folder) invalid = true
        else output[side] = matches[0]
      }
    }
    // Only a diff-row click pairs paths. Independent pane navigation never moves the other pane.
    for (const side of sides)
      if (!output[side] && route.query[`${side}PageId`] === undefined)
        output[side] = flattenPages(trees.value[side]).find(
          (page) =>
            page.folder !== true &&
            page.path === selectedPath.value &&
            !stablePageId(page, trees.value[side]),
        )
    return { pages: output, invalid }
  })
  const pageError = computed(() => (selection.value.invalid ? t('proto.compareInvalidPage') : ''))
  const contexts = computed(() => {
    const result: Partial<Record<WorkspacePane, WorkspaceContext>> = {}
    if (pageError.value || !data.value) return result
    for (const side of sides) {
      const page = selection.value.pages[side],
        session = panes[side].session
      if (!page || !stablePageId(page, trees.value[side]) || !session) continue
      result[side] = {
        revisionId: data.value[side].id,
        locationPath: route.path,
        title: t(side === 'left' ? 'proto.compareLeft' : 'proto.compareRight'),
        versionName: data.value[side].versionName,
        runtimeBaseUrl: session.runtimeBaseUrl,
        entryFile: page.path!,
        pages: trees.value[side],
      }
    }
    return result
  })

  function locationQuery(leftPageId?: string | null, rightPageId?: string | null) {
    return {
      leftRevisionId: pair.value.leftRevisionId!,
      rightRevisionId: pair.value.rightRevisionId!,
      ...(leftPageId ? { leftPageId } : {}),
      ...(rightPageId ? { rightPageId } : {}),
    }
  }
  /** A compared path selects each revision's own page identity; absent/legacy sides have no key. */
  function selectPage(row: ComparisonPage, replace = false) {
    selectedPath.value = row.path
    const query = locationQuery(row.left?.pageId, row.right?.pageId)
    void router[replace ? 'replace' : 'push']({ path: route.path, query })
  }
  async function copyLink() {
    const left = previewIdentity(route.query.leftPageId),
      right = previewIdentity(route.query.rightPageId)
    if (pageError.value || !data.value) return false
    const href = router.resolve({ path: route.path, query: locationQuery(left, right) }).href
    return copyText(new URL(href, window.location.origin).href)
  }

  /** Expiry removes the iframe; only a deliberate user action exchanges another grant. */
  async function authorize(side: WorkspacePane) {
    const revision = data.value?.[side],
      versionId = pair.value.versionId
    if (!revision || !versionId) return
    const epoch = generation
    controllers[side]?.abort()
    clearTimeout(timers[side])
    const request = new AbortController()
    controllers[side] = request
    Object.assign(panes[side], { session: undefined, loading: true, error: '', expired: false })
    try {
      const session = await versionsApi.revisionPreviewSession(versionId, revision.id, {
        signal: request.signal,
        silent: true,
      })
      if (epoch !== generation || request.signal.aborted) return
      if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now())
        throw new Error(t('proto.previewExpired'))
      runtimePageUrl(session.runtimeBaseUrl, revision.entryFile)
      panes[side].session = session
      timers[side] = setTimeout(() => {
        Object.assign(panes[side], {
          session: undefined,
          expired: true,
          error: t('proto.previewExpired'),
        })
      }, session.expiresAt - Date.now())
    } catch (cause) {
      if (epoch === generation && !request.signal.aborted)
        panes[side].error = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (epoch === generation && !request.signal.aborted) panes[side].loading = false
    }
  }

  async function load() {
    comparisonRequest?.abort()
    const request = new AbortController()
    comparisonRequest = request
    const current = ++requestNumber,
      epoch = generation,
      ids = pair.value
    loading.value = true
    error.value = ''
    try {
      if (!ids.projectId || !ids.versionId || !ids.leftRevisionId || !ids.rightRevisionId)
        throw new Error(t('proto.compareInvalidPair'))
      const result = await versionsApi.compare(
        ids.versionId,
        {
          leftRevisionId: ids.leftRevisionId,
          rightRevisionId: ids.rightRevisionId,
          ...paging,
          includeUnchanged: includeUnchanged.value,
        },
        { signal: request.signal, silent: true },
      )
      if (epoch !== generation || current !== requestNumber || request.signal.aborted) return
      if (
        result.versionId !== ids.versionId ||
        sides.some(
          (side) =>
            result[side].id !== ids[`${side}RevisionId`] ||
            result[side].versionId !== ids.versionId ||
            result[side].projectId !== ids.projectId,
        )
      )
        throw new Error(t('proto.compareInvalidPair'))
      if (!data.value) {
        const [left, right] = await Promise.all(
          sides.map((side) =>
            versionsApi.revisionPages(ids.versionId!, result[side].id, {
              signal: request.signal,
              silent: true,
            }),
          ),
        )
        if (epoch !== generation || current !== requestNumber || request.signal.aborted) return
        trees.value = { left: left!, right: right! }
        data.value = result
        if (route.query.leftPageId === undefined && route.query.rightPageId === undefined) {
          const first = result.pages.data[0]
          if (first) selectPage(first, true)
          else {
            const page = flattenPages(left!).find((item) => item.path && item.folder !== true)
            if (page) {
              const other = flattenPages(right!).find(
                (item) => item.path === page.path && item.folder !== true,
              )
              selectPage(
                {
                  path: page.path!,
                  status: 'unchanged',
                  left: {
                    name: page.name,
                    path: page.path!,
                    pageId: stablePageId(page, left!) || null,
                  },
                  right: other
                    ? {
                        name: other.name,
                        path: other.path!,
                        pageId: stablePageId(other, right!) || null,
                      }
                    : null,
                },
                true,
              )
            }
          }
        }
        for (const side of sides) void authorize(side)
      } else data.value = result
    } catch (cause) {
      if (epoch !== generation || current !== requestNumber || request.signal.aborted) return
      data.value = undefined
      trees.value = { left: [], right: [] }
      clearPanes()
      error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (epoch === generation && current === requestNumber) loading.value = false
    }
  }
  function changePage(kind: 'pages' | 'files', page: number, size: number) {
    paging[`${kind}PageIndex`] = page - 1
    paging[`${kind}PageSize`] = size
    void load()
  }
  function toggleUnchanged(checked: boolean) {
    includeUnchanged.value = checked
    paging.pagesPageIndex = paging.filesPageIndex = 0
    void load()
  }
  watch(
    () => JSON.stringify(pair.value),
    () => {
      generation++
      comparisonRequest?.abort()
      clearPanes()
      data.value = undefined
      trees.value = { left: [], right: [] }
      selectedPath.value = ''
      paging.pagesPageIndex = paging.filesPageIndex = 0
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    generation++
    comparisonRequest?.abort()
    clearPanes()
  })
  return {
    data,
    loading,
    error,
    pageError,
    panes,
    contexts,
    selection,
    paging,
    includeUnchanged,
    load,
    selectPage,
    authorize,
    copyLink,
    changePage,
    toggleUnchanged,
  }
}
