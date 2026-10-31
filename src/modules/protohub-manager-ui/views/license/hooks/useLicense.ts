import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { licenseApi } from '../../../api/license'
import { protoPermissions as p } from '../../../routes/permissions'
import type { PrototypeLicenseStatus } from '../../../types/license'
import { licenseFingerprint } from '../../../utils/license'

const maxBytes = 65536

/** Keep an uncertain import tied to its original document and discard responses from a replaced identity. */
export function useLicense() {
  const session = useSession()
  const data = shallowRef<PrototypeLicenseStatus>()
  const document = ref(''),
    filename = ref('')
  const loading = ref(false),
    busy = ref(false),
    denied = ref(false)
  const loadError = ref(''),
    inputError = ref(''),
    success = ref('')
  const unknown = ref(false),
    checked = ref(false)
  const canQuery = computed(() => session.can(p.license.query))
  const canImport = computed(() => session.can(p.license.save))
  let generation = 0,
    readGeneration = 0
  let controller: AbortController | undefined
  let candidateFingerprint = ''

  function clearSensitive() {
    data.value = undefined
    document.value = ''
    filename.value = ''
    candidateFingerprint = ''
    unknown.value = checked.value = false
    inputError.value = success.value = ''
  }
  async function load() {
    if (!canQuery.value || busy.value) return
    controller?.abort()
    const current = new AbortController(),
      epoch = generation
    controller = current
    loading.value = true
    loadError.value = ''
    try {
      const result = await licenseApi.get({ signal: current.signal, silent: true })
      if (current.signal.aborted || epoch !== generation) return
      data.value = result
      denied.value = false
      if (unknown.value) {
        checked.value = true
        if (
          candidateFingerprint &&
          result.acceptedCredential?.fingerprint === candidateFingerprint
        ) {
          unknown.value = false
          document.value = filename.value = ''
          success.value = 'licenseConfirmed'
        }
      }
    } catch (cause) {
      if (current.signal.aborted || epoch !== generation) return
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        clearSensitive()
        denied.value = true
      } else loadError.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (controller === current) loading.value = false
    }
  }

  async function readFile(file: File) {
    const epoch = generation,
      read = ++readGeneration
    if (busy.value || unknown.value) return false
    success.value = inputError.value = ''
    if (file.size > maxBytes) {
      inputError.value = t('proto.licenseTooLarge')
      return false
    }
    try {
      const value = await file.text()
      if (epoch !== generation || read !== readGeneration || unknown.value || busy.value)
        return false
      document.value = value
      filename.value = file.name
    } catch {
      if (epoch === generation && read === readGeneration)
        inputError.value = t('proto.licenseFileError')
    }
    return false
  }

  async function submit() {
    if (busy.value || !canImport.value || denied.value || !data.value?.trustConfigured) return false
    if (unknown.value && !checked.value) return false
    inputError.value = success.value = ''
    const value = document.value
    if (!value.trim()) {
      inputError.value = t('proto.licenseRequired')
      return false
    }
    if (new TextEncoder().encode(value).byteLength > maxBytes) {
      inputError.value = t('proto.licenseTooLarge')
      return false
    }
    controller?.abort()
    const epoch = ++generation
    loading.value = false
    busy.value = true
    try {
      try {
        candidateFingerprint = (await licenseFingerprint(value)) || ''
      } catch {
        inputError.value = t('proto.licenseInvalidJson')
        return false
      }
      if (epoch !== generation) return false
      const result = await licenseApi.import(value, { silent: true })
      if (epoch !== generation) return false
      data.value = result.status
      document.value = filename.value = ''
      unknown.value = checked.value = false
      success.value = result.result === 'unchanged' ? 'licenseUnchanged' : 'licenseImported'
      return true
    } catch (cause) {
      if (epoch !== generation) return false
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        clearSensitive()
        denied.value = true
      } else if (!(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500) {
        unknown.value = true
        checked.value = false
      } else inputError.value = cause.message || t('common.unknown')
      return false
    } finally {
      if (epoch === generation) busy.value = false
    }
  }

  function clearInput() {
    if (busy.value || unknown.value) return
    ++readGeneration
    document.value = filename.value = inputError.value = success.value = ''
  }
  function editDocument(value: string) {
    ++readGeneration
    document.value = value
    success.value = inputError.value = ''
  }
  watch(
    [() => session.user?.id, () => [...session.permissions].sort().join(',')],
    () => {
      ++generation
      ++readGeneration
      controller?.abort()
      clearSensitive()
      busy.value = loading.value = denied.value = false
      loadError.value = ''
      if (canQuery.value) void load()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    ++generation
    controller?.abort()
    clearSensitive()
  })
  return {
    data,
    document,
    filename,
    loading,
    busy,
    denied,
    loadError,
    inputError,
    success,
    unknown,
    checked,
    canQuery,
    canImport,
    load,
    readFile,
    submit,
    clearInput,
    editDocument,
  }
}
