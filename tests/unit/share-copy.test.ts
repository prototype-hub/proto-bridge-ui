import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import {
  useShareCopy,
  type ShareCopyContext,
} from '@/modules/protohub-manager-ui/views/project/hooks/useShareCopy'
import { useShares } from '@/modules/protohub-manager-ui/views/project/hooks/useShares'
import { shareCopyContent } from '@/modules/protohub-manager-ui/utils/share'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { i18n } from '@/shared/i18n'
import { copyText } from '@/shared/utils/feedback'
import type { Project, Share, Version } from '@/modules/protohub-manager-ui/types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: (path: string) => ({ href: `/tools${path}` }) }),
}))
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  sharesApi: { list: vi.fn(), create: vi.fn(), remove: vi.fn(), verifyPassword: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ copyText: vi.fn(), saved: vi.fn(), deleted: vi.fn() }))
const initialContext: ShareCopyContext = {
  projectId: 'p1',
  projectName: '项目名称',
  versionId: 'v1',
  versionName: 'V1.0',
}
const initialShare: Share = {
  id: 's1',
  projectId: 'p1',
  versionId: 'v1',
  token: 'token-one',
  passwordRequired: false,
  enabled: true,
  createdAt: 1,
  sharePath: '/share/token-one',
}
const locked = { ...initialShare, passwordRequired: true }
let scope: EffectScope
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function setup() {
  const context = ref<ShareCopyContext | undefined>({ ...initialContext })
  const state = scope.run(() =>
    useShareCopy(context, (share) => `http://example.test/tools/#/share/${share.token}`),
  )!
  return { context, state }
}
beforeEach(() => {
  scope = effectScope()
  vi.mocked(copyText).mockReset().mockResolvedValue(true)
  vi.mocked(sharesApi.verifyPassword).mockReset().mockResolvedValue(true)
  vi.mocked(sharesApi.create).mockReset()
  vi.mocked(sharesApi.list).mockReset().mockResolvedValue([])
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => {
  scope.stop()
  document.body.innerHTML = ''
})

it('formats no-password shares as one line and preserves raw password whitespace on a true second line', () => {
  expect(shareCopyContent('项目', 'V1', 'http://host/base/#/share/id', '密码')).toBe(
    '项目-V1：http://host/base/#/share/id',
  )
  expect(shareCopyContent('项目', 'V1', 'http://host/base/#/share/id', '密码', ' p a ')).toBe(
    '项目-V1：http://host/base/#/share/id\n密码： p a ',
  )
})
it('copies a public share immediately with its exact project-version prefix and modal button', async () => {
  const { state } = setup()
  const button = document.createElement('button')
  document.body.append(button)
  button.addEventListener('click', (event) => {
    void state.copy(initialShare, event)
  })
  button.click()
  expect(copyText).toHaveBeenCalledWith(
    '项目名称-V1.0：http://example.test/tools/#/share/token-one',
    button,
  )
  expect(sharesApi.verifyPassword).not.toHaveBeenCalled()
  expect(state.target.value).toBeUndefined()
})
it('binds remembered passwords to both share id and token, never to another share or a public link', async () => {
  const { state } = setup()
  state.remember(locked, ' first ')
  state.remember({ ...locked, id: 's2', token: 'two' }, 'second')
  await state.copy(locked)
  expect(copyText).toHaveBeenLastCalledWith(
    '项目名称-V1.0：http://example.test/tools/#/share/token-one\n密码： first ',
    undefined,
  )
  await state.copy({ ...locked, id: 's2', token: 'two' })
  expect(copyText).toHaveBeenLastCalledWith(
    '项目名称-V1.0：http://example.test/tools/#/share/two\n密码：second',
    undefined,
  )
  await state.copy(initialShare)
  expect(copyText).toHaveBeenLastCalledWith(
    '项目名称-V1.0：http://example.test/tools/#/share/token-one',
    undefined,
  )
  const count = vi.mocked(copyText).mock.calls.length
  await state.copy({ ...locked, token: 'replaced-token' })
  expect(copyText).toHaveBeenCalledTimes(count)
  expect(state.verified.value).toBe(false)
})
it('requires true password verification and a second user copy action, including disabled or expired shares', async () => {
  const { state } = setup()
  await state.copy({ ...locked, enabled: false, expiresAt: 1 })
  state.enteredPassword.value = 'wrong'
  vi.mocked(sharesApi.verifyPassword).mockResolvedValueOnce(false)
  await state.verify()
  expect(state.error.value).toBe(protoLocales.zh.sharePasswordInvalid)
  expect(state.verified.value).toBe(false)
  await state.copyVerified()
  expect(copyText).not.toHaveBeenCalled()
  state.enteredPassword.value = ' secret '
  await state.verify()
  expect(sharesApi.verifyPassword).toHaveBeenLastCalledWith(
    's1',
    ' secret ',
    expect.objectContaining({ signal: expect.any(AbortSignal), silent: true }),
  )
  expect(copyText).not.toHaveBeenCalled()
  expect(state.content.value).toBe(
    '项目名称-V1.0：http://example.test/tools/#/share/token-one\n密码： secret ',
  )
  await state.copyVerified()
  expect(copyText).toHaveBeenCalledOnce()
  state.cancel()
  await state.copy(locked)
  expect(copyText).toHaveBeenCalledTimes(2)
})
it('offers selectable complete text when browser copying fails, including remembered passwords', async () => {
  const { state } = setup()
  state.remember(locked, 'secret')
  vi.mocked(copyText).mockResolvedValue(false)
  await state.copy(locked)
  expect(state.verified.value).toBe(true)
  expect(state.content.value).toBe(
    '项目名称-V1.0：http://example.test/tools/#/share/token-one\n密码：secret',
  )
  expect(sharesApi.verifyPassword).not.toHaveBeenCalled()
})
it('does not reopen an older failed copy after a newer share selection', async () => {
  const { state } = setup()
  const previous = deferred<boolean>()
  vi.mocked(copyText).mockReturnValueOnce(previous.promise)
  const copying = state.copy(initialShare)
  await state.copy({ ...locked, id: 's2', token: 'another-share' })
  previous.resolve(false)
  await copying
  expect(state.target.value?.id).toBe('s2')
  expect(state.verified.value).toBe(false)
  expect(state.content.value).toBe('')
})
it('invalidates changed drafts and cancelled proofs without allowing stale success/error to release a newer request', async () => {
  const { state } = setup()
  await state.copy(locked)
  state.enteredPassword.value = 'old'
  const previous = deferred<boolean>()
  vi.mocked(sharesApi.verifyPassword).mockReturnValueOnce(previous.promise)
  const oldProof = state.verify()
  const oldSignal = vi.mocked(sharesApi.verifyPassword).mock.calls[0]![2]!.signal!
  state.enteredPassword.value = 'new'
  expect(oldSignal.aborted).toBe(true)
  const next = deferred<boolean>()
  vi.mocked(sharesApi.verifyPassword).mockReturnValueOnce(next.promise)
  const newProof = state.verify()
  previous.reject(new Error('old error'))
  await oldProof
  expect(state.busy.value).toBe(true)
  expect(state.error.value).toBe('')
  next.resolve(true)
  await newProof
  expect(state.content.value).toContain('\n密码：new')
  state.enteredPassword.value = 'changed'
  expect(state.verified.value).toBe(false)
  expect(state.content.value).toBe('')
  const cancelled = deferred<boolean>()
  vi.mocked(sharesApi.verifyPassword).mockReturnValueOnce(cancelled.promise)
  const closing = state.verify()
  state.cancel()
  cancelled.resolve(true)
  await closing
  expect(state.target.value).toBeUndefined()
  expect(state.enteredPassword.value).toBe('')
  expect(state.verified.value).toBe(false)
})
it('clears passwords on main close, version change, disposal and share deletion, and ignores late proofs', async () => {
  const { context, state } = setup()
  state.remember(locked, 'secret')
  state.forget('s1')
  await state.copy(locked)
  expect(copyText).not.toHaveBeenCalled()
  state.remember(locked, 'secret')
  context.value = undefined
  context.value = { ...initialContext }
  await state.copy(locked)
  expect(copyText).not.toHaveBeenCalled()
  state.enteredPassword.value = 'secret'
  const pending = deferred<boolean>()
  vi.mocked(sharesApi.verifyPassword).mockReturnValueOnce(pending.promise)
  const checking = state.verify()
  context.value = { ...initialContext, versionId: 'v2' }
  pending.resolve(true)
  await checking
  expect(state.content.value).toBe('')
  context.value = { ...initialContext }
  state.remember(locked, 'secret')
  scope.stop()
  await state.copy(locked)
  expect(copyText).not.toHaveBeenCalled()
})
it('submits and clears a trimmed description while remembering only the created share password', async () => {
  const project: Project = {
    id: 'p1',
    name: '项目名称',
    createdBy: 'ai',
    createdAt: 1,
    updatedAt: 1,
  }
  const version: Version = {
    id: 'v1',
    projectId: 'p1',
    versionName: 'V1.0',
    status: 'ready',
    createdBy: 'ai',
    createdAt: 1,
    entryFile: 'index.html',
    runtimeBaseUrl: '',
    previewUrl: '',
  }
  const state = scope.run(() => useShares(ref<Version | undefined>(version), ref(project)))!
  state.description.value = '  评审说明  '
  state.password.value = ' created '
  vi.mocked(sharesApi.create).mockResolvedValueOnce(locked)
  await state.create()
  expect(sharesApi.create).toHaveBeenCalledWith('v1', {
    description: '评审说明',
    password: ' created ',
    expiresAt: undefined,
  })
  expect(state.description.value).toBe('')
  expect(state.password.value).toBe('')
  state.password.value = 'unrelated form value'
  await state.copy(locked)
  expect(copyText).toHaveBeenLastCalledWith(
    `项目名称-V1.0：${window.location.origin}/tools/share/token-one\n密码： created `,
    undefined,
  )
  const count = vi.mocked(copyText).mock.calls.length
  await state.copy({ ...locked, id: 's2', token: 'history' })
  expect(copyText).toHaveBeenCalledTimes(count)
  expect(state.shareCopy.enteredPassword.value).toBe('')
})
it('does not recover creation plaintext from a late response after main close and reopen', async () => {
  const version: Version = {
    id: 'v1',
    projectId: 'p1',
    versionName: 'V1.0',
    status: 'ready',
    createdBy: 'ai',
    createdAt: 1,
    entryFile: 'index.html',
    runtimeBaseUrl: '',
    previewUrl: '',
  }
  const project: Project = {
    id: 'p1',
    name: '项目名称',
    createdBy: 'ai',
    createdAt: 1,
    updatedAt: 1,
  }
  const selected = ref<Version | undefined>(version)
  const state = scope.run(() => useShares(selected, ref(project)))!
  state.description.value = 'late description'
  state.password.value = 'secret'
  const pending = deferred<Share>()
  vi.mocked(sharesApi.create).mockReturnValueOnce(pending.promise)
  const creating = state.create()
  selected.value = undefined
  await nextTick()
  expect(state.description.value).toBe('')
  selected.value = version
  await nextTick()
  pending.resolve(locked)
  await creating
  await state.copy(locked)
  expect(copyText).not.toHaveBeenCalled()
})
