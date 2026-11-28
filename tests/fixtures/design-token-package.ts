import type {
  DesignTokenDocument,
  DesignTokenPackage,
  DesignTokenScope,
} from '../../src/modules/protohub-manager-ui/types/design-token-package'
import { ownerProjectAccess } from './project-access'

export const tokenScope: DesignTokenScope = {
  actorId: 'u1',
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
  revision: {
    id: 'r1',
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 1,
    totalBytes: 100,
    createdBy: 'u1',
    createdAt: 1,
  },
}
export function tokenDocument(count = 30): DesignTokenDocument {
  return {
    format: 'tokens',
    standardVersion: '2025.10',
    validatorVersion: '2025.10-1',
    valid: true,
    tokenCount: count,
    groupCount: 2,
    issues: [],
    truncated: false,
    inputs: {},
    modifiers: [],
    sets: [{ name: 'base', description: 'Base', tokenPaths: [['color', 'token29']] }],
    groups: [
      {
        path: ['color'],
        pointer: '/color',
        description: 'Colors',
        type: 'number',
        extensions: null,
      },
      {
        path: ['color', 'nested'],
        pointer: '/color/nested',
        description: null,
        type: 'number',
        extensions: null,
      },
    ],
    tokens: Array.from({ length: count }, (_, index) => ({
      path: ['color', `token${index}`],
      pointer: `/color/token${index}`,
      name: `token${index}`,
      type: 'number',
      declaredValue: index === 0 ? '{color.token29}' : index,
      resolvedValue: index === 0 ? 29 : index,
      description: null,
      extensions:
        index === 0
          ? JSON.parse('{"__proto__":{"polluted":true},"content":"<img src=x onerror=alert(1)>"}')
          : null,
      deprecated: null,
      aliases:
        index === 0
          ? [
              {
                reference: '{color.token29}',
                targetPath: ['color', 'token29'],
                status: 'resolved' as const,
              },
            ]
          : [],
    })),
  }
}
export const tokenPackage: DesignTokenPackage = {
  id: 'pack1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'r1',
  fileName: 'tokens.json',
  fileSize: 100,
  sha256: 'a'.repeat(64),
  standardVersion: '2025.10',
  validatorVersion: '2025.10-1',
  valid: true,
  tokenCount: 30,
  groupCount: 2,
  issueCount: 0,
  report: { valid: true, issues: [], truncated: false },
  configVersion: 0,
  createdBy: 'u1',
  updatedBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
}
