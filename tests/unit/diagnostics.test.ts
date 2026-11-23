import { expect, it } from 'vitest'
import { diagnosticSnapshot } from '@/modules/protohub-manager-ui/utils/diagnostics'
import { fixtureDiagnostics } from '../fixtures/diagnostics'

it('projects only allowlisted fields including nested check data for export', () => {
  const input = fixtureDiagnostics()
  const value = {
    ...input,
    token: 'never-export-token',
    checks: {
      ...input.checks,
      database: {
        ...input.checks.database,
        data: { ...input.checks.database.data, installationId: 'private-installation' },
      },
      mail: {
        ...input.checks.mail,
        data: { ...input.checks.mail.data, recipient: 'private@example.invalid' },
      },
      license: {
        ...input.checks.license,
        data: { ...input.checks.license.data, rawClaims: 'private-customer' },
      },
    },
  }
  expect(diagnosticSnapshot(value)).toEqual(input)
  expect(JSON.stringify(diagnosticSnapshot(value))).not.toMatch(/never-export|private-/)
})
it('rejects unknown schema, malformed fields and inconsistent completeness', () => {
  const snapshot = fixtureDiagnostics()
  expect(() => diagnosticSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow(
    'DIAGNOSTIC_SCHEMA_INVALID',
  )
  expect(() => diagnosticSnapshot({ ...snapshot, collectedAt: NaN })).toThrow(
    'DIAGNOSTIC_SCHEMA_INVALID',
  )
  expect(() => diagnosticSnapshot({ ...snapshot, complete: false })).toThrow(
    'DIAGNOSTIC_SCHEMA_INVALID',
  )
  expect(() =>
    diagnosticSnapshot({
      ...snapshot,
      checks: {
        ...snapshot.checks,
        mail: { status: 'ok', code: 'OK', data: { configured: 'true' } },
      },
    }),
  ).toThrow('DIAGNOSTIC_SCHEMA_INVALID')
})
it('keeps partial failures and fixed unknown license states without accepting arbitrary strings', () => {
  const snapshot = fixtureDiagnostics()
  snapshot.complete = false
  snapshot.checks.database = { status: 'timeout', code: 'TIMEOUT', data: null }
  snapshot.checks.license.data!.status = 'unknown'
  snapshot.checks.license.data!.advancedStatus = 'unknown'
  expect(diagnosticSnapshot(snapshot)).toEqual(snapshot)
  snapshot.checks.license.data!.advancedStatus = 'arbitrary-sensitive-status' as never
  expect(() => diagnosticSnapshot(snapshot)).toThrow('DIAGNOSTIC_SCHEMA_INVALID')
})
it('preserves unlimited counts instead of interpreting them as negative remaining capacity', () => {
  const snapshot = fixtureDiagnostics()
  snapshot.checks.database.data!.projects.limit = -1
  snapshot.checks.database.data!.projects.remaining = -1
  expect(diagnosticSnapshot(snapshot)).toEqual(snapshot)
})
