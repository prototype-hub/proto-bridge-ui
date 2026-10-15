import { readFileSync, writeFileSync } from 'node:fs'
const [name, displayName = name] = process.argv.slice(2)
if (!name || !/^[a-z][a-z0-9-]*$/.test(name))
  throw new Error('Usage: pnpm rename <npm-name> [display-name]')
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const project = read('project.config.json')
const pkg = read('package.json')
const old = pkg.name
const oldDisplayName = project.displayName
const oldImageName = project.imageName
project.legacyNamespaces = [
  ...new Set([...project.legacyNamespaces, project.storageNamespace]),
].filter((value) => value !== name)
project.storageNamespace = name
project.displayName = displayName
project.imageName = name
pkg.name = name
for (const [path, value] of [
  ['project.config.json', project],
  ['package.json', pkg],
])
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const escapeHtml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
writeFileSync(
  'index.html',
  readFileSync('index.html', 'utf8').replace(
    /<title>.*?<\/title>/,
    '<title>' + escapeHtml(displayName) + '</title>',
  ),
)
writeFileSync(
  'README.md',
  readFileSync('README.md', 'utf8').replaceAll(old, name).replaceAll(oldDisplayName, displayName),
)
writeFileSync(
  'compose.yaml',
  readFileSync('compose.yaml', 'utf8').replace(
    'FRONTEND_IMAGE:-' + oldImageName,
    'FRONTEND_IMAGE:-' + name,
  ),
)
console.log(
  'Renamed. Confirm domain names, OAuth callbacks and backend address manually. API paths and share format were preserved.',
)
