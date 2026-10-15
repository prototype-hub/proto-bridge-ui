import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { packageLicense, runtimeDependencies } from './lib/dependencies.mjs'

const runtime = new Set(
  runtimeDependencies(process.cwd()).map((pkg) => `${pkg.name}@${pkg.version}`),
)
const packages = new Map()
for (const store of readdirSync('node_modules/.pnpm')) {
  const dir = 'node_modules/.pnpm/' + store + '/node_modules'
  if (!existsSync(dir)) continue
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const names = entry.name.startsWith('@')
      ? readdirSync(dir + '/' + entry.name).map((name) => entry.name + '/' + name)
      : [entry.name]
    for (const name of names) {
      const path = dir + '/' + name + '/package.json'
      if (!existsSync(path)) continue
      const pkg = JSON.parse(readFileSync(path, 'utf8'))
      if (!pkg.name || !pkg.version) continue
      packages.set(`${pkg.name}@${pkg.version}`, {
        name: pkg.name,
        version: pkg.version,
        license: packageLicense(pkg),
        scope: runtime.has(`${pkg.name}@${pkg.version}`) ? 'runtime-closure' : 'development',
        repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
      })
    }
  }
}
const values = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))
const unknown = values.filter((pkg) => pkg.license === 'UNKNOWN')
if (unknown.length)
  throw new Error('Review licenses for ' + unknown.map((pkg) => pkg.name).join(', '))
writeFileSync('docs/dependency-licenses.json', JSON.stringify(values, null, 2) + '\n')
writeFileSync(
  'docs/sbom.json',
  JSON.stringify(
    {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: {
        tools: [{ name: 'ProtoBridge UI installed dependency inventory', version: '1.0.0' }],
        properties: [
          {
            name: 'pnpm-lock-sha256',
            value: createHash('sha256').update(readFileSync('pnpm-lock.yaml')).digest('hex'),
          },
          {
            name: 'inventory-scope',
            value:
              'Current platform installed packages, including development dependencies. Uninstalled platform/optional lock entries are not inventoried; runtime-closure includes installed peers and is not an exact browser bundle inventory.',
          },
        ],
      },
      components: values.map((pkg) => ({
        type: 'library',
        name: pkg.name,
        version: pkg.version,
        purl: `pkg:npm/${pkg.name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(pkg.version)}`,
        licenses: [{ expression: pkg.license }],
        properties: [{ name: 'dependency-scope', value: pkg.scope }],
      })),
    },
    null,
    2,
  ) + '\n',
)
console.log(
  `${values.length} installed dependencies inventoried; ${runtime.size} in conservative runtime closure`,
)
