import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
export const packageLicense = (pkg) =>
  typeof pkg.license === 'string'
    ? pkg.license
    : pkg.license?.type ||
      pkg.licenses
        ?.map((item) => item.type)
        .filter(Boolean)
        .join(' OR ') ||
      'UNKNOWN'

/** Resolve installed dependency links without relying on package exports exposing package.json. */
function resolvePackage(from, name) {
  let dir = dirname(from)
  while (dir !== parse(dir).root) {
    const candidate = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(candidate)) return realpathSync(candidate)
    dir = dirname(dir)
  }
}

/** Conservative production dependency closure, including installed peer and optional dependencies. */
export function runtimeDependencies(root) {
  const source = join(root, 'package.json'),
    seen = new Set(),
    packages = new Map()
  function visit(file, isRoot = false) {
    file = realpathSync(file)
    if (seen.has(file)) return
    seen.add(file)
    const pkg = readJson(file)
    if (!isRoot) packages.set(`${pkg.name}@${pkg.version}`, { ...pkg, path: file })
    const dependencies = {
      ...pkg.dependencies,
      ...(!isRoot && pkg.peerDependencies),
      ...pkg.optionalDependencies,
    }
    for (const name of Object.keys(dependencies)) {
      const resolved = resolvePackage(file, name)
      const optional =
        name in (pkg.optionalDependencies || {}) || pkg.peerDependenciesMeta?.[name]?.optional
      if (!resolved && !optional)
        throw new Error(`Missing installed dependency ${name} required by ${pkg.name}`)
      if (resolved) visit(resolved)
    }
  }
  visit(source, true)
  return [...packages.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )
}
