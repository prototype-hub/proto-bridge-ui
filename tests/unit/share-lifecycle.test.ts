import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { useShares } from '@/modules/protohub-manager-ui/views/project/hooks/useShares'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { ApiError } from '@/shared/api/errors'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { i18n } from '@/shared/i18n'
import type { Project, Share, Version } from '@/modules/protohub-manager-ui/types'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: (path: string) => ({ href: path }) }),
}))
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  sharesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    enabled: vi.fn(),
    revoke: vi.fn(),
    rotate: vi.fn(),
    remove: vi.fn(),
    verifyPassword: vi.fn(),
  },
}))
vi.mock('@/shared/utils/feedback', () => ({
  saved: vi.fn(),
  deleted: vi.fn(),
  copyText: vi.fn().mockResolvedValue(true),
}))
const original: Share = {
  id: 's1',
  projectId: 'p1',
  versionId: 'v1',
  token: 'old',
  revisionMode: 'fixed',
  revisionId: 'r1',
  configVersion: 1,
  revoked: false,
  passwordRequired: true,
  enabled: true,
  createdAt: 1,
  sharePath: '/share/old',
}
const version = { id: 'v1', projectId: 'p1', migrationRequired: false } as Version
const project = { id: 'p1', name: 'Project', ...ownerProjectAccess } as Project
let scope: EffectScope
const flush = async () => {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}
function setup() {
  const selected = ref<Version | undefined>(version)
  const parent = ref<Project | undefined>(project)
  const state = scope.run(() => useShares(selected, parent))!
  return { state, selected, parent }
}
beforeEach(() => {
  vi.clearAllMocks()
  scope = effectScope()
  vi.mocked(sharesApi.list).mockResolvedValue([original])
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => scope.stop())
it('edits the original fixed target with CAS and forgets a prior password proof, remembering only an explicitly replaced password', async () => {
  const { state } = setup()
  await flush()
  state.shareCopy.remember(original, 'old password')
  state.edit(original)
  const kept = { ...original, configVersion: 2, description: 'new description' }
  vi.mocked(sharesApi.update).mockResolvedValueOnce(kept)
  await state.update({
    expectedVersion: 1,
    description: 'new description',
    expiresAt: null,
    revisionMode: 'fixed',
    revisionId: 'r1',
    passwordAction: 'keep',
  })
  expect(sharesApi.update).toHaveBeenCalledWith(
    's1',
    expect.objectContaining({ expectedVersion: 1, revisionId: 'r1', passwordAction: 'keep' }),
    { silent: true },
  )
  expect(state.editTarget.value).toBeUndefined()
  await state.copy(kept)
  expect(state.shareCopy.target.value).toEqual(kept)
  state.edit(kept)
  const replaced = { ...kept, configVersion: 3 }
  vi.mocked(sharesApi.update).mockResolvedValueOnce(replaced)
  await state.update({
    expectedVersion: 2,
    revisionMode: 'fixed',
    revisionId: 'r1',
    passwordAction: 'replace',
    password: ' exact new password ',
  })
  await state.copy(replaced)
  expect(state.shareCopy.target.value).toBeUndefined()
})
it('uses separate enable, rotate and terminal revoke commands with the last server version', async () => {
  const { state } = setup()
  await flush()
  const paused = { ...original, enabled: false, configVersion: 2 }
  vi.mocked(sharesApi.enabled).mockResolvedValueOnce(paused)
  await state.setEnabled(original)
  expect(sharesApi.enabled).toHaveBeenCalledWith('s1', 1, false, { silent: true })
  const rotated = { ...paused, token: 'new', sharePath: '/share/new', configVersion: 3 }
  vi.mocked(sharesApi.rotate).mockResolvedValueOnce(rotated)
  await state.rotate(paused)
  expect(state.url(state.resource.data.value[0])).toContain('/share/new')
  const revoked = { ...rotated, revoked: true, configVersion: 4 }
  vi.mocked(sharesApi.revoke).mockResolvedValueOnce(revoked)
  await state.revoke(rotated)
  expect(sharesApi.revoke).toHaveBeenCalledWith('s1', 3, { silent: true })
  await state.setEnabled(revoked)
  await state.rotate(revoked)
  state.edit(revoked)
  expect(sharesApi.enabled).toHaveBeenCalledTimes(1)
  expect(sharesApi.rotate).toHaveBeenCalledTimes(1)
  expect(state.editTarget.value).toBeUndefined()
  expect(state.validity(revoked)).toBe('revoked')
})
it('refreshes on a stale CAS response without retrying the mutation or keeping stale password proofs', async () => {
  const { state } = setup()
  await flush()
  state.edit(original)
  state.shareCopy.remember(original, 'secret')
  vi.mocked(sharesApi.update).mockRejectedValueOnce(new ApiError('stale', 409))
  const authoritative = {
    ...original,
    configVersion: 3,
    revisionMode: 'latest' as const,
    revisionId: null,
  }
  vi.mocked(sharesApi.list).mockResolvedValueOnce([authoritative])
  await state.update({ expectedVersion: 1, revisionMode: 'fixed', passwordAction: 'keep' })
  expect(sharesApi.update).toHaveBeenCalledTimes(1)
  expect(state.resource.data.value).toEqual([authoritative])
  expect(state.task.error.value).toBe(protoLocales.zh.shareConflict)
  expect(state.editTarget.value).toBeUndefined()
  await state.copy(authoritative)
  expect(state.shareCopy.target.value).toEqual(authoritative)
})
it('does not restore rows or plaintext from a mutation response after the parent dialog changed', async () => {
  const { state, selected } = setup()
  await flush()
  let resolve!: (share: Share) => void
  vi.mocked(sharesApi.update).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  state.edit(original)
  const pending = state.update({
    expectedVersion: 1,
    revisionMode: 'fixed',
    passwordAction: 'replace',
    password: 'private',
  })
  selected.value = undefined
  await flush()
  resolve({ ...original, configVersion: 2 })
  await pending
  expect(state.resource.data.value).toEqual([])
  expect(state.editTarget.value).toBeUndefined()
  expect(state.shareCopy.target.value).toBeUndefined()
})
it('sends latest only when explicitly selected and keeps new shares fixed by default', async () => {
  const { state } = setup()
  await flush()
  vi.mocked(sharesApi.create).mockResolvedValue(original)
  await state.create()
  expect(sharesApi.create).toHaveBeenLastCalledWith(
    'v1',
    expect.objectContaining({ revisionMode: 'fixed' }),
  )
  state.revisionMode.value = 'latest'
  await state.create()
  expect(sharesApi.create).toHaveBeenLastCalledWith(
    'v1',
    expect.objectContaining({ revisionMode: 'latest' }),
  )
})
