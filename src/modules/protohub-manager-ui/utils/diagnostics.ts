import type { DiagnosticCheck, DiagnosticSnapshot } from '../types/diagnostics'

function invalid(): never {
  throw new Error('DIAGNOSTIC_SCHEMA_INVALID')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function count(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) return invalid()
  return value
}
function flag(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid()
}
function choice<const T extends string>(value: unknown, values: readonly T[]): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : invalid()
}
function check<T>(value: unknown, read: (data: Record<string, unknown>) => T): DiagnosticCheck<T> {
  const item = object(value)
  return {
    status: choice(item.status, ['ok', 'warning', 'error', 'timeout']),
    code: choice(item.code, [
      'OK',
      'CAPACITY_EXCEEDED',
      'STORAGE_UNAVAILABLE',
      'CLEANUP_BACKLOG',
      'MAIL_NOT_CONFIGURED',
      'SMTP_BUSY',
      'UNAVAILABLE',
      'TIMEOUT',
    ]),
    data: item.data === null ? null : read(object(item.data)),
  }
}

/** Project the supported schema before display/export so added server fields cannot enter a support file. */
export function diagnosticSnapshot(value: unknown): DiagnosticSnapshot {
  const source = object(value)
  if (source.schemaVersion !== 1) return invalid()
  const checks = object(source.checks)
  const result: DiagnosticSnapshot = {
    schemaVersion: 1,
    collectedAt: count(source.collectedAt, 1),
    complete: flag(source.complete),
    checks: {
      database: check(checks.database, (data) => {
        const projects = object(data.projects)
        return {
          projects: {
            used: count(projects.used),
            limit: count(projects.limit, -1),
            remaining: count(projects.remaining, -1),
            overLimit: flag(projects.overLimit),
            canCreate: flag(projects.canCreate),
          },
        }
      }),
      storage: check(checks.storage, (data) => ({
        writable: flag(data.writable),
        freeBytes: count(data.freeBytes),
        minimumFreeBytes: count(data.minimumFreeBytes),
        scope: choice(data.scope, ['nearest_existing_parent']),
      })),
      cleanup: check(checks.cleanup, (data) => ({
        pending: count(data.pending),
        due: count(data.due),
        retried: count(data.retried),
        unknown: count(data.unknown),
      })),
      mail: check(checks.mail, (data) => ({
        configured: flag(data.configured),
        active: count(data.active),
        queued: count(data.queued),
        completed: count(data.completed),
        rejected: count(data.rejected),
      })),
      license: check(checks.license, (data) => ({
        status: choice(data.status, [
          'missing',
          'valid',
          'untrusted',
          'invalid',
          'not_yet_valid',
          'unsupported',
          'unknown',
        ]),
        trustConfigured: flag(data.trustConfigured),
        capacitySource: choice(data.capacitySource, ['deployment', 'free', 'license']),
        projectLimit: count(data.projectLimit, -1),
        versionLimit: count(data.versionLimit, -1),
        advancedModuleAvailable: flag(data.advancedModuleAvailable),
        advancedStatus: choice(data.advancedStatus, [
          'module_unavailable',
          'not_licensed',
          'permanent',
          'trial',
          'expired',
          'legacy_trial',
          'not_started',
          'unknown',
        ]),
        enabledFeatureCount: count(data.enabledFeatureCount),
      })),
    },
  }
  if (result.complete !== Object.values(result.checks).every((item) => item.data !== null))
    return invalid()
  return result
}
