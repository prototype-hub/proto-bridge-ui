/** Verified declarations are separate from enforced capacity and do not activate commercial modules. */
export interface PrototypeLicenseStatus {
  schemaVersion: 1
  installationId: string
  status: 'missing' | 'valid' | 'untrusted' | 'invalid' | 'not_yet_valid'
  trustConfigured: boolean
  acceptedCredential: {
    licenseId: string
    sequence: number
    fingerprint: string
    acceptedAt: number
    keyId: string
  } | null
  verifiedEntitlements: {
    customer: string
    edition: string
    features: string[]
    maxProjects: number
    baseVersionsPerProject: number
    projectVersionGrants: { projectId: string; extraVersionBlocks: number }[]
    issuedAt: number
    notBefore: number
    trialEndsAt: number | null
    maintenanceUntil: number | null
  } | null
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
