import type { PrototypeLicenseStatus } from '../../src/modules/protohub-manager-ui/types/license'

/** Controlled UI declarations only; real signatures and authorization are verified by backend integration. */
export function fixtureLicense(): PrototypeLicenseStatus {
  return {
    schemaVersion: 1,
    installationId: '9ebd81e4-8b46-45a2-a49c-001c51a88d39',
    status: 'missing',
    trustConfigured: true,
    acceptedCredential: null,
    verifiedEntitlements: null,
    freeEntitlements: { maxProjects: 5, baseVersionsPerProject: 5, features: [] },
    enforcedCapacity: { projectLimit: 5, versionLimit: 5, source: 'deployment' },
  }
}

export const fixtureLicenseDocument = {
  keyId: 'fixture-key',
  payload: {
    schemaVersion: 1,
    licenseId: 'fixture-license',
    sequence: 1,
    orderId: 'fixture-order',
    installationId: fixtureLicense().installationId,
    customer: 'Example customer',
    edition: 'example',
    features: ['example-feature'],
    maxProjects: 10,
    baseVersionsPerProject: 5,
    projectVersionGrants: [{ projectId: 'p1', extraVersionBlocks: 1 }],
    issuedAt: 1793404800000,
    notBefore: 1793404800000,
    trialEndsAt: null,
    maintenanceUntil: null,
  },
  signature: 'controlled-ui-fixture-not-a-signature',
}

export function fixtureAcceptedLicense(fingerprint: string): PrototypeLicenseStatus {
  return {
    ...fixtureLicense(),
    status: 'valid',
    acceptedCredential: {
      licenseId: 'fixture-license',
      sequence: 1,
      fingerprint,
      acceptedAt: 1793404800000,
      keyId: 'fixture-key',
    },
    verifiedEntitlements: fixtureLicenseDocument.payload,
  }
}
