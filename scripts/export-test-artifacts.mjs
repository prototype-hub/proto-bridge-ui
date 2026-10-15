import { readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(dir + '/' + entry.name) : [dir + '/' + entry.name],
  )
}
if (existsSync('test-results')) {
  mkdirSync('docs/screenshots', { recursive: true })
  for (const path of walk('test-results')) {
    const name = path.split('/').pop()
    if (/^(share-\d+|inspect-mobile|pro-[a-z-]+)\.png$/.test(name))
      copyFileSync(path, 'docs/screenshots/' + name)
  }
}
