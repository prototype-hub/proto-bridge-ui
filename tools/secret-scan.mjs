import { readdirSync, readFileSync } from 'node:fs'
const dirs = ['src', 'public', 'tools', 'third-party']
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(dir + '/' + entry.name) : [dir + '/' + entry.name],
  )
}
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AKIA[A-Z0-9]{16}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
]
const failures = dirs
  .flatMap(walk)
  .filter((path) => patterns.some((pattern) => pattern.test(readFileSync(path, 'utf8'))))
if (failures.length) throw new Error('Possible credentials in ' + failures.join(', '))
console.log('Secret pattern scan passed (source, public assets, tools, third-party materials)')
