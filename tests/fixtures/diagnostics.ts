import type { DiagnosticSnapshot } from '../../src/modules/protohub-manager-ui/types/diagnostics'

export function fixtureDiagnostics(): DiagnosticSnapshot {
  return {
    schemaVersion: 1,
    collectedAt: Date.now(),
    complete: true,
    checks: {
      database: {
        status: 'ok',
        code: 'OK',
        data: { projects: { used: 2, limit: 5, remaining: 3, overLimit: false, canCreate: true } },
      },
      storage: {
        status: 'ok',
        code: 'OK',
        data: {
          writable: true,
          freeBytes: 9000000000,
          minimumFreeBytes: 10485760,
          scope: 'nearest_existing_parent',
        },
      },
      cleanup: {
        status: 'warning',
        code: 'CLEANUP_BACKLOG',
        data: { pending: 2, due: 1, retried: 1, unknown: 0 },
      },
      mail: {
        status: 'warning',
        code: 'MAIL_NOT_CONFIGURED',
        data: { configured: false, active: 0, queued: 0, completed: 0, rejected: 0 },
      },
      license: {
        status: 'ok',
        code: 'OK',
        data: {
          status: 'missing',
          trustConfigured: false,
          capacitySource: 'free',
          projectLimit: 5,
          versionLimit: 5,
          advancedModuleAvailable: false,
          advancedStatus: 'module_unavailable',
          enabledFeatureCount: 0,
        },
      },
    },
  }
}
