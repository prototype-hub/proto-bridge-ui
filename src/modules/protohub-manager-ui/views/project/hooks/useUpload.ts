import { ref, reactive, watch, onScopeDispose, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import { t } from '@/shared/i18n'
import { useTask } from '@/shared/composables/useTask'
import { ApiError } from '@/shared/api/errors'
import type { UploadContext } from '@/modules/protohub-manager-ui/types'
export function validZip(file: File): boolean {
  return /\.zip$/i.test(file.name) && file.size > 0 && file.size <= 500 * 1024 * 1024
}
export function useUpload(
  open: Ref<boolean>,
  context: Ref<UploadContext>,
  done: () => void,
  close: () => void,
) {
  const task = useTask()
  const form = reactive({ versionName: '', description: '' })
  const file = ref<File>()
  const progress = ref(0)
  let controller: AbortController | undefined
  watch(open, (value) => {
    if (value) {
      form.versionName = context.value.version?.versionName || ''
      form.description = context.value.version?.description || ''
      file.value = undefined
      progress.value = 0
      task.error.value = ''
    } else controller?.abort()
  })
  function choose(selected: File) {
    if (task.busy.value) return
    if (!validZip(selected)) {
      void message.error(t('proto.zipInvalid'))
      return
    }
    file.value = selected
  }
  async function submit() {
    if (!file.value) {
      task.error.value = t('proto.zipInvalid')
      return
    }
    await task.run(async () => {
      controller = new AbortController()
      const options = {
        signal: controller.signal,
        silent: true,
        onUploadProgress: (event: { loaded: number; total?: number }) => {
          progress.value = event.total
            ? Math.min(100, Math.round((event.loaded / event.total) * 100))
            : 0
        },
      }
      const args: [string, string, File] = [
        form.versionName.trim(),
        form.description.trim(),
        file.value!,
      ]
      const current = context.value
      try {
        await (current.version
          ? versionsApi.update(current.version.id, ...args, options)
          : versionsApi.upload(current.projectId, ...args, options))
        void message.success(t('proto.uploadSuccess'))
        done()
        close()
      } catch (cause) {
        if (cause instanceof ApiError && cause.cancelled) return
        throw cause
      }
    })
  }
  function cancel() {
    controller?.abort()
    close()
  }
  onScopeDispose(() => controller?.abort())
  return { task, form, file, progress, choose, submit, cancel }
}
