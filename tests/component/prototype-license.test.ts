import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { webcrypto } from 'node:crypto'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { licenseApi } from '@/modules/protohub-manager-ui/api/license'
import { useLicense } from '@/modules/protohub-manager-ui/views/license/hooks/useLicense'
import { licenseFingerprint } from '@/modules/protohub-manager-ui/utils/license'
import { hookHarness } from '../fixtures/hook-harness'
import { fixtureLicense, fixtureAcceptedLicense, fixtureLicenseDocument } from '../fixtures/license'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'

vi.mock('@/modules/protohub-manager-ui/api/license', () => ({
  licenseApi: { get: vi.fn(), import: vi.fn() },
}))
const harnesses: VueWrapper[] = []
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('crypto', webcrypto)
  setActivePinia(createPinia())
  i18n.global.setLocaleMessage('zh', { ...i18n.global.messages.value.zh, proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  const session = useSession()
  session.user = { id: 'admin', username: 'admin', name: 'Admin' }
  session.permissions = new Set(['prototype-hub-license:query', 'prototype-hub-license:save'])
  vi.mocked(licenseApi.get).mockResolvedValue(fixtureLicense())
})
afterEach(() => {
  harnesses.splice(0).forEach((h) => h.unmount())
  vi.unstubAllGlobals()
})
async function state() {
  let result!: ReturnType<typeof useLicense>
  harnesses.push(
    mount(
      hookHarness(() => {
        result = useLicense()
      }),
    ),
  )
  await flushPromises()
  return result
}
it('fingerprints sorted Unicode JSON without treating it as signature verification', async () => {
  expect(await licenseFingerprint('{"z":1,"a":{"中":"文","b":2}}')).toBe(
    await licenseFingerprint('{"a":{"b":2,"中":"文"},"z":1}'),
  )
  expect(await licenseFingerprint('{"a":[1,2]}')).not.toBe(await licenseFingerprint('{"a":[2,1]}'))
})
it('does not load or submit installation data without the independent action', async () => {
  useSession().permissions.clear()
  const s = await state()
  expect(licenseApi.get).not.toHaveBeenCalled()
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  expect(await s.submit()).toBe(false)
  expect(licenseApi.import).not.toHaveBeenCalled()
})
it('retains invalid contents and prevents empty or oversized input from reaching the server', async () => {
  const s = await state()
  expect(await s.submit()).toBe(false)
  s.document.value = '中'.repeat(22000)
  expect(await s.submit()).toBe(false)
  expect(licenseApi.import).not.toHaveBeenCalled()
  s.document.value = '{broken'
  expect(await s.submit()).toBe(false)
  expect(s.document.value).toBe('{broken')
})
it('imports the original document once and keeps verified claims separate from enforced limits', async () => {
  const s = await state()
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  const fingerprint = await licenseFingerprint(s.document.value)
  vi.mocked(licenseApi.import).mockResolvedValue({
    result: 'imported',
    status: fixtureAcceptedLicense(fingerprint!),
  })
  expect(await s.submit()).toBe(true)
  expect(licenseApi.import).toHaveBeenCalledTimes(1)
  expect(s.data.value?.verifiedEntitlements?.maxProjects).toBe(10)
  expect(s.data.value?.enforcedCapacity.projectLimit).toBe(5)
  expect(s.document.value).toBe('')
})
it('discards a refresh started before import and does not load a stale record during submission', async () => {
  const s = await state()
  let resolveLoad!: (result: ReturnType<typeof fixtureLicense>) => void
  vi.mocked(licenseApi.get).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLoad = resolve
    }),
  )
  const refresh = s.load()
  let resolveImport!: (result: {
    result: 'imported'
    status: ReturnType<typeof fixtureAcceptedLicense>
  }) => void
  vi.mocked(licenseApi.import).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveImport = resolve
    }),
  )
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  const importing = s.submit()
  await flushPromises()
  await s.load()
  expect(licenseApi.get).toHaveBeenCalledTimes(2)
  const accepted = fixtureAcceptedLicense('accepted-fingerprint')
  resolveImport({ result: 'imported', status: accepted })
  expect(await importing).toBe(true)
  resolveLoad(fixtureLicense())
  await refresh
  expect(s.data.value?.acceptedCredential?.fingerprint).toBe('accepted-fingerprint')
  expect(s.loading.value).toBe(false)
})
it('keeps the same document for an unknown POST, checks first, then permits an explicit same-document retry', async () => {
  const s = await state(),
    original = JSON.stringify(fixtureLicenseDocument)
  s.document.value = original
  vi.mocked(licenseApi.import).mockRejectedValue(new ApiError('Network failure', 0))
  await s.submit()
  expect(s.unknown.value).toBe(true)
  expect(s.document.value).toBe(original)
  await s.submit()
  expect(licenseApi.import).toHaveBeenCalledTimes(1)
  await s.load()
  expect(s.checked.value).toBe(true)
  expect(s.unknown.value).toBe(true)
  expect(s.document.value).toBe(original)
  await s.submit()
  expect(licenseApi.import).toHaveBeenNthCalledWith(2, original, { silent: true })
})
it('reconciles matching accepted contents after an unknown response without auto-resubmission', async () => {
  const s = await state()
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  const fingerprint = await licenseFingerprint(s.document.value)
  vi.mocked(licenseApi.import).mockRejectedValue(new ApiError('Network failure', 0))
  await s.submit()
  vi.mocked(licenseApi.get).mockResolvedValue(fixtureAcceptedLicense(fingerprint!))
  await s.load()
  expect(s.success.value).toBe('licenseConfirmed')
  expect(s.unknown.value).toBe(false)
  expect(licenseApi.import).toHaveBeenCalledTimes(1)
})
it('does not mark a definite verification failure as an unknown result', async () => {
  const s = await state()
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  vi.mocked(licenseApi.import).mockRejectedValue(new ApiError('Signature invalid', 400))
  await s.submit()
  expect(s.inputError.value).toBe('Signature invalid')
  expect(s.unknown.value).toBe(false)
  expect(s.document.value).not.toBe('')
})
it('allows server verification without WebCrypto on plain HTTP and does not falsely reconcile an unknown result', async () => {
  vi.stubGlobal('crypto', {})
  const s = await state()
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  vi.mocked(licenseApi.import).mockResolvedValueOnce({
    result: 'imported',
    status: fixtureAcceptedLicense('server-digest'),
  })
  expect(await s.submit()).toBe(true)
  s.document.value = JSON.stringify(fixtureLicenseDocument)
  vi.mocked(licenseApi.import).mockRejectedValueOnce(new ApiError('Network failure', 0))
  await s.submit()
  vi.mocked(licenseApi.get).mockResolvedValue(fixtureAcceptedLicense('server-digest'))
  await s.load()
  expect(s.unknown.value).toBe(true)
  expect(s.checked.value).toBe(true)
  expect(s.document.value).not.toBe('')
})
it('clears sensitive data on authorization failure and ignores an old identity response', async () => {
  const s = await state()
  let resolve!: (result: ReturnType<typeof fixtureLicense>) => void
  vi.mocked(licenseApi.get).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const flight = s.load()
  s.document.value = 'private draft'
  useSession().permissions = new Set()
  await flushPromises()
  resolve(fixtureLicense())
  await flight
  expect(s.data.value).toBeUndefined()
  expect(s.document.value).toBe('')
})
