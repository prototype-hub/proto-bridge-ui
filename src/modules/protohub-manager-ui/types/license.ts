/** Verified declarations are separate from the server-enforced capacity and advanced feature rights. */
export interface PrototypeLicenseStatus {
  schemaVersion: 1
  installationId: string
  status: 'missing' | 'valid' | 'untrusted' | 'invalid' | 'not_yet_valid' | 'unsupported'
  trustConfigured: boolean
  acceptedCredential: {
    licenseId: string
    sequence: number
    fingerprint: string
    acceptedAt: number
    keyId: string
  } | null
  verifiedEntitlements: {
    schemaVersion: 2 | 3
    customer: string
    edition: string
    features: string[]
    maxProjects: number
    maxVersionsPerProject: number
    issuedAt: number
    notBefore: number
    trialEndsAt: number | null
    trialDurationDays?: number | null
    maintenanceUntil: number | null
  } | null
  trialActivation: { startedAt: number | null; endsAt: number | null }
  advancedEntitlements: {
    moduleAvailable: boolean
    status:
      | 'module_unavailable'
      | 'not_licensed'
      | 'permanent'
      | 'trial'
      | 'expired'
      | 'legacy_trial'
      | 'not_started'
    features: string[]
  }
  freeEntitlements: { maxProjects: number; baseVersionsPerProject: number; features: string[] }
  enforcedCapacity: {
    projectLimit: number
    versionLimit: number
    source: 'deployment' | 'free' | 'license'
    projectVersionLimits?: Record<string, number>
  }
}

export interface PrototypeLicenseImport {
  result: 'imported' | 'unchanged'
  status: PrototypeLicenseStatus
}
