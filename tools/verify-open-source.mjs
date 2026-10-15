import { readdirSync, readFileSync } from 'node:fs'
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name],
  )
}
const files = [...walk('src'), 'package.json', 'vite.config.ts']
const banned = /@jetlinks-web|<j-|https?:\/\/[^\s"']*(?:iconfont|alicdn)/
const failures = files.filter((path) => banned.test(readFileSync(path, 'utf8')))
if (failures.length) throw new Error('Unexpected private UI dependencies: ' + failures.join(', '))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (pkg.license !== 'Apache-2.0' || !readFileSync('LICENSE', 'utf8').includes('Apache License'))
  throw new Error('The approved project Apache-2.0 license must accompany the source')
for (const version of Object.values({ ...pkg.dependencies, ...pkg.devDependencies }))
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Unpinned dependency: ' + version)
console.log('Runtime dependency and remote resource scan passed')
