import type { Project } from '../../src/modules/protohub-manager-ui/types'

/** Full project scope for fixtures that exercise existing owner workflows. */
export const ownerProjectAccess: Pick<
  Project,
  | 'ownerId'
  | 'role'
  | 'claimRequired'
  | 'capabilities'
  | 'groupName'
  | 'tags'
  | 'archivedTime'
  | 'organizationVersion'
  | 'favorite'
  | 'favoriteVersion'
> = {
  groupName: '',
  tags: [],
  archivedTime: null,
  organizationVersion: 0,
  favorite: false,
  favoriteVersion: 0,
  ownerId: 'u1',
  role: 'owner',
  claimRequired: false,
  capabilities: {
    read: true,
    edit: true,
    manageMembers: true,
    deleteProject: true,
    manageShares: true,
  },
}
