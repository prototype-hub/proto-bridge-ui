import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { QueryField, QueryOption } from '@/shared/api/types'
import { t } from '@/shared/i18n'

function optionValues(value: unknown): (string | number)[] {
  const values = Array.isArray(value) ? value : [value]
  return values.filter((item): item is string | number =>
    typeof item === 'number' ? Number.isFinite(item) : typeof item === 'string' && item !== '',
  )
}
function flatten(options: QueryOption[]): QueryOption[] {
  return options.flatMap((option) => [option, ...flatten(option.children || [])])
}
function merge(options: QueryOption[]): QueryOption[] {
  const merged = new Map<string, QueryOption>()
  for (const option of options) {
    const key = `${typeof option.value}:${option.value}`
    const previous = merged.get(key)
    merged.set(key, {
      ...previous,
      ...option,
      ...(previous?.children || option.children
        ? { children: merge([...(previous?.children || []), ...(option.children || [])]) }
        : {}),
    })
  }
  return [...merged.values()]
}
/** Each field/search/value change cancels both option loading and selected-label lookup. */
export function useQueryOptions(
  field: MaybeRefOrGetter<QueryField | undefined>,
  value: MaybeRefOrGetter<unknown>,
) {
  const search = ref(''),
    remote = ref<QueryOption[]>([]),
    resolved = ref<QueryOption[]>([]),
    loading = ref(false),
    error = ref('')
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let disposed = false
  const selected = computed(() => optionValues(toValue(value)))
  const options = computed(() => {
    const available = merge([...(toValue(field)?.options || []), ...remote.value])
    const known = new Set(
      flatten(available).map((option) => `${typeof option.value}:${option.value}`),
    )
    return [
      ...available,
      ...resolved.value.filter(
        (option) =>
          selected.value.includes(option.value) &&
          !known.has(`${typeof option.value}:${option.value}`),
      ),
    ]
  })
  function cancel() {
    generation += 1
    controller?.abort()
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  async function reload() {
    cancel()
    if (disposed) return
    const current = new AbortController(),
      revision = generation,
      configuration = toValue(field)
    controller = current
    error.value = ''
    loading.value = !!(configuration?.loadOptions || configuration?.resolveOptions)
    const active = () => !disposed && revision === generation && !current.signal.aborted
    try {
      const loaded = configuration?.loadOptions
        ? await configuration.loadOptions({
            search: search.value,
            selected: [...selected.value],
            signal: current.signal,
          })
        : []
      if (!active()) return
      remote.value = loaded
      const available = flatten([...(configuration?.options || []), ...loaded, ...resolved.value])
      const missing = selected.value.filter(
        (id) => !available.some((option) => option.value === id),
      )
      const labels =
        missing.length && configuration?.resolveOptions
          ? await configuration.resolveOptions(missing, current.signal)
          : []
      if (!active()) return
      resolved.value = merge([...resolved.value, ...flatten(loaded), ...flatten(labels)])
    } catch (cause) {
      if (active()) error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (active()) loading.value = false
    }
  }
  watch(
    () => toValue(field),
    (next, previous) => {
      cancel()
      if (
        next?.key !== previous?.key ||
        next?.loadOptions !== previous?.loadOptions ||
        next?.resolveOptions !== previous?.resolveOptions
      ) {
        remote.value = []
        resolved.value = []
        search.value = ''
      }
      void reload()
    },
    { immediate: true },
  )
  watch(
    () => JSON.stringify(selected.value),
    () => void reload(),
  )
  watch(
    search,
    () => {
      cancel()
      if (!toValue(field)?.loadOptions) {
        loading.value = false
        return
      }
      loading.value = true
      timer = setTimeout(() => {
        timer = undefined
        void reload()
      }, 150)
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    cancel()
  })
  return { options, loading, error, search, reload }
}
