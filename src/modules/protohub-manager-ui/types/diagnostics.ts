import type { Capacity } from './index'
import type { PrototypeLicenseStatus } from './license'

export type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'timeout'
export type DiagnosticCode =
  | 'OK'
  | 'CAPACITY_EXCEEDED'
  | 'STORAGE_UNAVAILABLE'
  | 'CLEANUP_BACKLOG'
  | 'MAIL_NOT_CONFIGURED'
  | 'SMTP_BUSY'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
export interface DiagnosticCheck<T> {
  status: DiagnosticStatus
  code: DiagnosticCode
  data: T | null
}
export interface DiagnosticSnapshot {
  schemaVersion: 1
  collectedAt: number
  complete: boolean
  checks: {
    database: DiagnosticCheck<{ projects: Capacity }>
    storage: DiagnosticCheck<{
      writable: boolean
      freeBytes: number
      minimumFreeBytes: number
      scope: 'nearest_existing_parent'
    }>
    cleanup: DiagnosticCheck<{ pending: number; due: number; retried: number; unknown: number }>
    mail: DiagnosticCheck<{
      configured: boolean
      active: number
      queued: number
      completed: number
      rejected: number
    }>
    license: DiagnosticCheck<{
      status: PrototypeLicenseStatus['status'] | 'unknown'
      trustConfigured: boolean
      capacitySource: PrototypeLicenseStatus['enforcedCapacity']['source']
      projectLimit: number
      versionLimit: number
      advancedModuleAvailable: boolean
      advancedStatus: PrototypeLicenseStatus['advancedEntitlements']['status'] | 'unknown'
      enabledFeatureCount: number
    }>
  }
}
export type DiagnosticCheckName = keyof DiagnosticSnapshot['checks']
