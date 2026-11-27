import { describe, expect, it } from 'vitest'
import {
  normalizeOrganization,
  trimProjectLabel,
  validOrganization,
  safeProjectCover,
} from '@/modules/protohub-manager-ui/utils/project-organization'
import {
  projectOrganizationFixture,
  organizationProject,
  filterProjectOrganization,
  resetProjectOrganization,
} from '../fixtures/project-organization'
import { ownerProjectAccess } from '../fixtures/project-access'
import type { Project } from '@/modules/protohub-manager-ui/types'
const project = (): Project => ({
  id: 'p1',
  name: 'Project',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
})
describe('project labels and cover trust boundary', () => {
  it('matches Java whitespace without folding case or removing U0085', () => {
    expect(trimProjectLabel('\u001c\u00a0\uFEFF Team \u001f')).toBe('Team')
    expect(trimProjectLabel('\u0085A\u0085')).toBe('\u0085A\u0085')
    expect(
      normalizeOrganization({ groupName: ' Team ', tags: [' A ', '', 'A', 'a'], archived: false }),
    ).toEqual({ groupName: 'Team', tags: ['A', 'a'], archived: false })
    expect(validOrganization({ groupName: 'x', tags: Array(11).fill('a'), archived: false })).toBe(
      false,
    )
    expect(validOrganization({ groupName: '\0', tags: [], archived: false })).toBe(false)
  })
  it('renders only safe HTTP or relative image URLs', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:image/png,a',
      'blob:https://example.com/a',
      '//other.example/a.png',
      'https://user:pass@site/a',
      '/\\site/a',
      '/a\n.png',
    ])
      expect(safeProjectCover(value, 'https://app.example')).toBeUndefined()
    expect(safeProjectCover('/cover.png', 'https://app.example')).toBe(
      'https://app.example/cover.png',
    )
    expect(safeProjectCover('https://images.example/a.png', 'https://app.example')).toBe(
      'https://images.example/a.png',
    )
  })
})
it('keeps favorite counters personal, supports current-state replay and intersects filters before paging', () => {
  resetProjectOrganization()
  const rows = [project()]
  const favorite = { favorite: true, expectedVersion: 0, clientRequestId: 'first' }
  expect(
    projectOrganizationFixture(
      '/prototype-hub/projects/p1/_favorite',
      'PUT',
      favorite,
      'u1',
      rows,
      false,
      () => 10,
    )?.status,
  ).toBe(200)
  expect(organizationProject(rows[0]!, 'u2').favorite).toBe(false)
  expect(
    projectOrganizationFixture(
      '/prototype-hub/projects/p1/_favorite',
      'PUT',
      { favorite: false, expectedVersion: 1, clientRequestId: 'second' },
      'u1',
      rows,
      false,
      () => 10,
    )?.status,
  ).toBe(200)
  expect(
    (
      projectOrganizationFixture(
        '/prototype-hub/projects/p1/_favorite',
        'PUT',
        favorite,
        'u1',
        rows,
        false,
        () => 10,
      )?.result as Project
    ).favorite,
  ).toBe(false)
  expect(rows[0]!.organizationVersion).toBe(0)
  expect(rows[0]!.updatedAt).toBe(1)
  const organization = {
    groupName: ' Team ',
    tags: ['z', 'a', 'a'],
    archived: true,
    expectedVersion: 0,
    clientRequestId: 'org',
  }
  expect(
    projectOrganizationFixture(
      '/prototype-hub/projects/p1/_organization',
      'PUT',
      organization,
      'u1',
      rows,
      true,
      () => 10,
    )?.status,
  ).toBe(200)
  expect(
    projectOrganizationFixture(
      '/prototype-hub/projects/p1/_organization',
      'PUT',
      { ...organization, clientRequestId: 'other' },
      'u1',
      rows,
      true,
      () => 10,
    )?.status,
  ).toBe(409)
  expect(filterProjectOrganization(rows, { archived: false }, 'u1')).toEqual([])
  expect(
    filterProjectOrganization(rows, { archived: true, groupName: 'Team', tag: 'a' }, 'u1'),
  ).toHaveLength(1)
  expect(
    filterProjectOrganization(rows, { archived: null, favoriteOnly: true }, 'u1'),
  ).toHaveLength(0)
})
