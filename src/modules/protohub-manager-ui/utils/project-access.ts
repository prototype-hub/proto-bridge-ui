import type { Project, ProjectCapabilities } from '../types'

/** Missing or stale scope never grants an action, even when the platform grants its menu button. */
export function projectAllows(
  project: Project | undefined,
  action: keyof ProjectCapabilities,
): boolean {
  return project?.capabilities?.[action] === true
}
