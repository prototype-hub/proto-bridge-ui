import { computed, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { download } from '@/shared/api/client'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { flattenPages, selectablePage, stablePageId } from '../utils/preview-location'
import {
  deliverySelectionKey,
  deliveryWithinLimits,
  emptyDeliveryPage,
  moveDeliveryPage,
} from '../utils/delivery-document'
import { deliveryDocumentApi } from '../api/delivery-document'
import { functionalSpecApi } from '../api/functional-spec'
import { revisionMaterialsApi } from '../api/revision-material'
import { viewportCheckApi } from '../api/viewport-check'
import type { Project, Revision, WorkspaceContext } from '../types'
import type { DeliveryDocumentInput } from '../types/delivery-document'
import type { FunctionalSpec } from '../types/functional-spec'
import type { RevisionMaterial } from '../types/revision-material'
import type { ViewportCheck } from '../types/viewport-check'
import type { PageResult } from '@/shared/api/types'
export interface DeliveryScope {
  actorId: string
  project: Project
  revision: Revision
  context: WorkspaceContext
}
export function useDeliveryDocument(scope: Ref<DeliveryScope | undefined>, locale: Ref<string>) {
  const permissions = usePermissions()
  const authorized = computed(() => {
    const value = scope.value
    return value?.actorId &&
      value.project.id === value.revision.projectId &&
      value.context.revisionId === value.revision.id &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const pages = computed(() =>
    authorized.value
      ? flattenPages(authorized.value.context.pages).flatMap((page) => {
          const pageId = stablePageId(page, authorized.value!.context.pages)
          return pageId && selectablePage(page, authorized.value!.context.runtimeBaseUrl)
            ? [{ pageId, name: page.name, path: page.path! }]
            : []
        })
      : [],
  )
  const document = reactive<DeliveryDocumentInput>({
    locale: locale.value.startsWith('zh') ? 'zh' : 'en',
    title: t('proto.documentDefaultTitle'),
    introduction: '',
    pages: [],
  })
  const selectedId = ref(''),
    error = ref(''),
    conflict = ref(false),
    denied = ref(false),
    busy = ref(false),
    loading = ref(false)
  const assembled = ref(false),
    changed = ref(false)
  const active = computed(() => document.pages.find((page) => page.pageId === selectedId.value))
  const descriptions = ref<PageResult<FunctionalSpec>>(),
    materials = ref<PageResult<RevisionMaterial>>(),
    checks = ref<PageResult<ViewportCheck>>()
  const indexes = reactive({ descriptions: 0, materials: 0, checks: 0 })
  const labels = reactive<Record<string, string>>({}),
    imageUrls = reactive<Record<string, string>>({})
  const assemblyKeys = new Map<string, string>()
  const needsAssembly = computed(
    () =>
      !assembled.value ||
      document.locale !== (locale.value.startsWith('zh') ? 'zh' : 'en') ||
      document.pages.some((page) => assemblyKeys.get(page.pageId) !== deliverySelectionKey(page)),
  )
  const valid = computed(() => deliveryWithinLimits(document))
  const available = computed(() => !!authorized.value && !denied.value)
  let generation = 0,
    sourceSequence = 0
  const controllers = new Set<AbortController>()
  function options() {
    const controller = new AbortController()
    controllers.add(controller)
    return { controller, options: { signal: controller.signal, hiddenError: true } }
  }
  function revokeImages() {
    for (const [id, url] of Object.entries(imageUrls)) {
      URL.revokeObjectURL(url)
      delete imageUrls[id]
    }
  }
  function clear() {
    generation++
    sourceSequence++
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    revokeImages()
    document.pages = []
    document.introduction = ''
    document.title = t('proto.documentDefaultTitle')
    document.locale = locale.value.startsWith('zh') ? 'zh' : 'en'
    selectedId.value = ''
    descriptions.value = materials.value = checks.value = undefined
    indexes.descriptions = indexes.materials = indexes.checks = 0
    Object.keys(labels).forEach((id) => delete labels[id])
    assemblyKeys.clear()
    assembled.value =
      changed.value =
      conflict.value =
      denied.value =
      busy.value =
      loading.value =
        false
    error.value = ''
  }
  function failure(cause: unknown) {
    if (cause instanceof ApiError && cause.cancelled) return
    if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
      // Account, permission or immutable scope loss removes every private draft and object URL.
      clear()
      denied.value = true
      error.value = t('proto.documentUnavailable')
      return
    }
    conflict.value = cause instanceof ApiError && cause.status === 409
    error.value = t(
      conflict.value
        ? 'proto.documentConflict'
        : cause instanceof ApiError && cause.status === 413
          ? 'proto.documentLimits'
          : 'proto.documentFailed',
    )
  }
  function selectPage(pageId: string) {
    if (!available.value || busy.value) return
    if (!document.pages.some((page) => page.pageId === pageId)) {
      if (document.pages.length >= 50 || !pages.value.some((page) => page.pageId === pageId)) return
      document.pages.push(emptyDeliveryPage(pageId))
      changed.value = true
    }
    selectedId.value = pageId
  }
  function removePage(pageId: string) {
    if (busy.value) return
    document.pages = document.pages.filter((page) => page.pageId !== pageId)
    changed.value = true
    if (selectedId.value === pageId) selectedId.value = document.pages[0]?.pageId || ''
  }
  function move(pageId: string, offset: number) {
    if (!busy.value) {
      document.pages = moveDeliveryPage(document.pages, pageId, offset)
      changed.value = true
    }
  }
  function scoped(
    row: {
      projectId: string
      versionId: string
      revisionId: string
      id: string
      configVersion: number
    },
    pageId?: string,
    status = 404,
  ) {
    const value = authorized.value
    if (
      !value ||
      row.projectId !== value.project.id ||
      row.versionId !== value.revision.versionId ||
      row.revisionId !== value.revision.id ||
      !row.id ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < 0 ||
      (pageId && (row as FunctionalSpec).pageId !== pageId)
    )
      throw new ApiError('Scope unavailable', status)
  }
  async function sourceRecord<T>(result: Promise<T>): Promise<T> {
    try {
      return await result
    } catch (cause) {
      // A deleted source is a conflict; it does not revoke the immutable document scope.
      if (cause instanceof ApiError && cause.status === 404)
        throw new ApiError('Source changed', 409)
      throw cause
    }
  }
  async function loadSources() {
    const value = authorized.value,
      pageId = selectedId.value
    if (!value || !available.value || !pageId) return
    const epoch = generation,
      sequence = ++sourceSequence,
      request = options()
    loading.value = true
    error.value = ''
    try {
      const target = { versionId: value.revision.versionId, revisionId: value.revision.id, pageId }
      const results = await Promise.all([
        functionalSpecApi.query(
          target,
          { pageIndex: indexes.descriptions, pageSize: 20 },
          request.options,
        ),
        revisionMaterialsApi.query(
          target.versionId,
          target.revisionId,
          { pageIndex: indexes.materials, pageSize: 20 },
          request.options,
        ),
        viewportCheckApi.query(
          target,
          { pageIndex: indexes.checks, pageSize: 20 },
          request.options,
        ),
      ])
      if (epoch !== generation || sequence !== sourceSequence) return
      results.forEach((result, index) =>
        result.data.forEach((row) => scoped(row, index === 1 ? undefined : pageId)),
      )
      descriptions.value = results[0]
      materials.value = results[1]
      checks.value = results[2]
      results[0].data.forEach((row) => (labels[row.id] = row.title))
      results[1].data.forEach((row) => (labels[row.id] = row.fileName || row.sourceName || row.id))
      results[2].data.forEach((row) => (labels[row.id] = row.title))
    } catch (cause) {
      if (epoch === generation && sequence === sourceSequence) failure(cause)
    } finally {
      controllers.delete(request.controller)
      if (epoch === generation && sequence === sourceSequence) loading.value = false
    }
  }
  async function refreshReferences(requestOptions: ReturnType<typeof options>['options']) {
    const value = authorized.value!
    for (const page of document.pages) {
      const target = {
        versionId: value.revision.versionId,
        revisionId: value.revision.id,
        pageId: page.pageId,
      }
      for (const ref of page.descriptions) {
        const row = await sourceRecord(functionalSpecApi.get(target, ref.id, requestOptions))
        scoped(row, page.pageId, 409)
        ref.expectedVersion = row.configVersion
        labels[row.id] = row.title
      }
      for (const ref of [...page.materials, ...page.images]) {
        const row = await sourceRecord(
          revisionMaterialsApi.get(target.versionId, target.revisionId, ref.id, requestOptions),
        )
        scoped(row, undefined, 409)
        ref.expectedVersion = row.configVersion
        labels[row.id] = row.fileName || row.sourceName || row.id
      }
      if (page.checks.length) {
        let index = 0,
          total: number
        const found = new Map<string, ViewportCheck>()
        do {
          const result = await viewportCheckApi.query(
            target,
            { pageIndex: index++, pageSize: 100 },
            requestOptions,
          )
          total = result.total
          result.data.forEach((row) => {
            scoped(row, page.pageId)
            found.set(row.id, row)
          })
          if (!result.data.length) break
        } while (index * 100 < total)
        for (const ref of page.checks) {
          const row = found.get(ref.id)
          if (!row) throw new ApiError('Source changed', 409)
          ref.expectedVersion = row.configVersion
          labels[row.id] = row.title
        }
      }
    }
  }
  async function assemble(refresh = false) {
    const value = authorized.value
    if (!value || !available.value || busy.value || !valid.value) return
    const epoch = generation,
      request = options()
    busy.value = true
    error.value = ''
    try {
      if (refresh) await refreshReferences(request.options)
      if (epoch !== generation) return
      const input = JSON.parse(JSON.stringify(document)) as DeliveryDocumentInput
      input.locale = locale.value.startsWith('zh') ? 'zh' : 'en'
      const result = await deliveryDocumentApi.assemble(
        value.revision.versionId,
        value.revision.id,
        input,
        request.options,
      )
      if (epoch !== generation) return
      if (
        result.projectId !== value.project.id ||
        result.versionId !== value.revision.versionId ||
        result.revisionId !== value.revision.id ||
        result.pages.length !== input.pages.length ||
        result.pages.some(
          (page, index) =>
            page.pageId !== input.pages[index]?.pageId ||
            typeof page.body !== 'string' ||
            !/^[a-f0-9]{64}$/.test(page.sourceFingerprint),
        )
      )
        throw new ApiError('Scope unavailable', 404)
      Object.assign(document, result)
      assemblyKeys.clear()
      result.pages.forEach((page) => assemblyKeys.set(page.pageId, deliverySelectionKey(page)))
      assembled.value = true
      changed.value = true
      conflict.value = false
      revokeImages()
    } catch (cause) {
      if (epoch === generation) failure(cause)
    } finally {
      controllers.delete(request.controller)
      if (epoch === generation) busy.value = false
    }
  }
  async function exportDocument(format: 'markdown' | 'html') {
    const value = authorized.value
    if (
      !value ||
      !available.value ||
      busy.value ||
      needsAssembly.value ||
      !valid.value ||
      conflict.value
    )
      return
    const epoch = generation,
      request = options()
    busy.value = true
    error.value = ''
    try {
      const result = await deliveryDocumentApi.export(
        value.revision.versionId,
        value.revision.id,
        format,
        JSON.parse(JSON.stringify(document)),
        request.options,
      )
      if (epoch === generation) await download(result)
    } catch (cause) {
      if (epoch === generation) failure(cause)
    } finally {
      controllers.delete(request.controller)
      if (epoch === generation) busy.value = false
    }
  }
  async function loadImages() {
    const value = authorized.value
    if (!value || !available.value) return
    const epoch = generation,
      request = options()
    let bytes = 0
    try {
      for (const ref of document.pages.flatMap((page) => page.images)) {
        if (imageUrls[ref.id]) continue
        const result = await sourceRecord(
          revisionMaterialsApi.content(
            value.revision.versionId,
            value.revision.id,
            ref.id,
            request.options,
          ),
        )
        if (epoch !== generation) return
        // Another preview read may have completed while this request was in flight.
        if (imageUrls[ref.id]) continue
        bytes += result.blob.size
        if (
          !['image/png', 'image/jpeg'].includes(result.contentType.split(';')[0]!) ||
          bytes > 15728640
        )
          throw new ApiError('Image limit', 413)
        imageUrls[ref.id] = URL.createObjectURL(result.blob)
      }
    } catch (cause) {
      if (epoch === generation) failure(cause)
    } finally {
      controllers.delete(request.controller)
    }
  }
  watch(
    () =>
      JSON.stringify([
        authorized.value?.actorId,
        authorized.value?.project.id,
        authorized.value?.revision.id,
      ]),
    clear,
  )
  watch(selectedId, () => {
    indexes.descriptions = indexes.materials = indexes.checks = 0
    descriptions.value = materials.value = checks.value = undefined
    void loadSources()
  })
  onScopeDispose(clear)
  return {
    document,
    pages,
    active,
    selectedId,
    error,
    conflict,
    denied,
    busy,
    loading,
    available,
    assembled,
    changed,
    needsAssembly,
    valid,
    descriptions,
    materials,
    checks,
    indexes,
    labels,
    imageUrls,
    selectPage,
    removePage,
    move,
    loadSources,
    assemble,
    exportDocument,
    loadImages,
  }
}
