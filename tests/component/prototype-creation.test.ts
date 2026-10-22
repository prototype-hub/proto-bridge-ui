import { ownerProjectAccess } from '../fixtures/project-access'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, toRef, type PropType } from 'vue'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { UploadContext, Version } from '@/modules/protohub-manager-ui/types'
import { useProjects } from '@/modules/protohub-manager-ui/views/project/hooks/useProjects'
import { useUpload } from '@/modules/protohub-manager-ui/views/project/hooks/useUpload'
import { createCreationIntent } from '@/modules/protohub-manager-ui/utils/creation-intent'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
vi.mock('ant-design-vue', () => ({ message: { error: vi.fn(), success: vi.fn() } }))
const mounted: VueWrapper[] = []
const response = <T>(result: T) => ({ success: true, status: 200, result })
function creationKey(index: number) {
  const headers = vi.mocked(request.post).mock.calls[index]?.[2]?.headers as
    | Record<string, string>
    | undefined
  expect(headers?.['Idempotency-Key']).toEqual(expect.any(String))
  return headers!['Idempotency-Key']
}
async function renderProjects() {
  let state!: ReturnType<typeof useProjects>
  mounted.push(
    mount(
      defineComponent({
        setup() {
          state = useProjects()
          return () => h('div')
        },
      }),
    ),
  )
  await flushPromises()
  return state
}
async function renderUpload(version?: Version) {
  const open = ref(false)
  const context = ref<UploadContext>({ projectId: 'p1', version })
  const done = vi.fn()
  let state!: ReturnType<typeof useUpload>
  mounted.push(
    mount(
      defineComponent({
        setup() {
          state = useUpload(open, context, done, () => {
            open.value = false
          })
          return () => h('div')
        },
      }),
    ),
  )
  open.value = true
  await nextTick()
  state.form.versionName = 'V2'
  state.choose(new File(['zip'], 'prototype.zip'))
  return { state, open, context, done }
}
beforeEach(() => {
  vi.mocked(request.get).mockReset().mockResolvedValue(response([]))
  vi.mocked(request.post).mockReset().mockRejectedValue(new ApiError('网络连接中断，请重试'))
  vi.mocked(request.put)
    .mockReset()
    .mockResolvedValue(response({ id: 'v1' }))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it('reuses a project creation key after a network failure, renews it for changed metadata or a new dialog', async () => {
  const state = await renderProjects()
  state.edit()
  await state.save({ name: ' Project ', description: ' Notes ' })
  const first = creationKey(0)
  expect(state.task.error.value).toBe('网络连接中断，请重试')
  expect(state.open.value).toBe(true)
  expect(request.post).toHaveBeenCalledTimes(1)
  await state.save({ name: 'Project', description: 'Notes' })
  expect(creationKey(1)).toBe(first)
  await state.save({ name: 'Changed', description: 'Notes' })
  const changed = creationKey(2)
  expect(changed).not.toBe(first)
  state.open.value = false
  state.edit()
  await state.save({ name: 'Changed', description: 'Notes' })
  expect(creationKey(3)).not.toBe(changed)
})

it('does not attach a creation key to editing an existing project', async () => {
  const state = await renderProjects()
  const editable = {
    id: 'p1',
    name: 'Existing',
    createdBy: 'admin',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  }
  state.resource.data.value = [editable]
  state.edit(editable)
  await state.save({ name: 'Renamed' })
  expect(request.post).not.toHaveBeenCalled()
  expect(request.put).toHaveBeenCalledWith('/prototype-hub/projects/p1', {
    name: 'Renamed',
    description: undefined,
  })
})

it('keeps an upload key for manual retry and renews it when metadata, ZIP or dialog changes', async () => {
  const { state, open } = await renderUpload()
  await state.submit()
  const first = creationKey(0)
  expect(state.task.error.value).toBe('网络连接中断，请重试')
  expect(state.file.value?.name).toBe('prototype.zip')
  expect(request.post).toHaveBeenCalledTimes(1)
  await state.submit()
  expect(creationKey(1)).toBe(first)
  state.form.description = 'Changed notes'
  await state.submit()
  const changed = creationKey(2)
  expect(changed).not.toBe(first)
  state.choose(new File(['different zip'], 'prototype.zip'))
  await state.submit()
  const replaced = creationKey(3)
  expect(replaced).not.toBe(changed)
  const previousFile = state.file.value!
  open.value = false
  await nextTick()
  open.value = true
  await nextTick()
  state.form.versionName = 'V2'
  state.form.description = 'Changed notes'
  state.choose(previousFile)
  await state.submit()
  expect(creationKey(4)).not.toBe(replaced)
})

it('starts a new key after a successful upload and invokes the usage refresh callback only on success', async () => {
  const { state, open, done } = await renderUpload()
  await state.submit()
  const first = creationKey(0)
  expect(done).not.toHaveBeenCalled()
  vi.mocked(request.post).mockResolvedValue(response({ id: 'v2' }))
  await state.submit()
  expect(creationKey(1)).toBe(first)
  expect(done).toHaveBeenCalledTimes(1)
  expect(open.value).toBe(false)
  open.value = true
  await nextTick()
  state.form.versionName = 'V2'
  state.choose(new File(['zip'], 'prototype.zip'))
  await state.submit()
  expect(creationKey(2)).not.toBe(first)
})

it('uploads a revision with the expected current identity and without a creation idempotency key', async () => {
  const version: Version = {
    currentRevisionId: 'r1',
    revisionId: 'r1',
    revisionCount: 1,
    migrationRequired: false,
    id: 'v1',
    projectId: 'p1',
    versionName: 'V1',
    entryFile: 'index.html',
    status: 'ready',
    createdBy: 'admin',
    createdAt: 1,
    runtimeBaseUrl: '/runtime',
    previewUrl: '/runtime/index.html',
  }
  const { state, done } = await renderUpload(version)
  await state.submit()
  expect(request.post).not.toHaveBeenCalled()
  expect(vi.mocked(request.put).mock.calls[0]?.[2]?.headers).toBeUndefined()
  expect((vi.mocked(request.put).mock.calls[0]?.[1] as FormData).get('expectedRevisionId')).toBe(
    'r1',
  )
  expect(done).toHaveBeenCalledOnce()
})

it('initializes the upload form from the new context when the parent changes context and open together', async () => {
  let state!: ReturnType<typeof useUpload>
  const version: Version = {
    currentRevisionId: 'r1',
    revisionId: 'r1',
    revisionCount: 1,
    migrationRequired: false,
    id: 'v2',
    projectId: 'p2',
    versionName: 'Another version',
    description: 'Another project',
    entryFile: 'index.html',
    status: 'ready',
    createdBy: 'admin',
    createdAt: 1,
    runtimeBaseUrl: '/runtime',
    previewUrl: '/runtime/index.html',
  }
  const wrapper = mount(
    defineComponent({
      props: {
        open: Boolean,
        context: { type: Object as PropType<UploadContext>, required: true },
      },
      setup(props) {
        state = useUpload(toRef(props, 'open'), toRef(props, 'context'), vi.fn(), vi.fn())
        return () => h('div')
      },
    }),
    { props: { open: false, context: { projectId: 'p1' } } },
  )
  mounted.push(wrapper)
  await wrapper.setProps({ open: true, context: { projectId: 'p2', version } })
  expect(state.form.versionName).toBe('Another version')
  expect(state.form.description).toBe('Another project')
})

it('creates a cryptographically random key on LAN HTTP browsers without randomUUID', () => {
  let sequence = 0
  const getRandomValues = vi.fn((array: Uint8Array) => {
    array.fill(++sequence)
    return array
  })
  vi.stubGlobal('crypto', { getRandomValues })
  const intent = createCreationIntent()
  const first = intent.key(['Project'])
  expect(first).toMatch(/^[0-9a-f]{32}$/)
  expect(intent.key(['Project'])).toBe(first)
  expect(getRandomValues).toHaveBeenCalledTimes(1)
  intent.reset()
  expect(intent.key(['Project'])).not.toBe(first)
})

it('surfaces concurrent revision conflicts without retrying or treating them as an unknown upload result', async () => {
  const version: Version = {
    id: 'v1',
    projectId: 'p1',
    versionName: 'V1',
    entryFile: 'index.html',
    status: 'ready',
    createdBy: 'admin',
    createdAt: 1,
    runtimeBaseUrl: null,
    previewUrl: null,
    currentRevisionId: 'r1',
    revisionId: 'r1',
    revisionCount: 1,
    migrationRequired: false,
  }
  vi.mocked(request.put).mockRejectedValue(
    new ApiError('Conflict', 409, 'PROTOTYPE_HUB_VERSION_CONFLICT'),
  )
  const { state, done, open } = await renderUpload(version)
  await state.submit()
  expect(request.put).toHaveBeenCalledOnce()
  expect(state.task.error.value).toBe(protoLocales.zh.revisionConflict)
  expect(state.outcomeUnknown.value).toBe(false)
  expect(open.value).toBe(true)
  expect(done).not.toHaveBeenCalled()
})
