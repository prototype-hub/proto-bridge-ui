import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageLicense, readJson, runtimeDependencies } from './lib/dependencies.mjs'

const scriptRoot = dirname(fileURLToPath(import.meta.url))
const hash = (value) => createHash('sha256').update(value).digest('hex')

/** Fail closed on missing/changed license text; supplement only exact reviewed package versions. */
export function licenseRecords(root, supplementsDir = join(scriptRoot, '..', 'third-party')) {
  const supplements = readJson(join(supplementsDir, 'supplements.json'))
  return runtimeDependencies(root).map((pkg) => {
    const name = `${pkg.name}@${pkg.version}`,
      license = packageLicense(pkg)
    if (license === 'UNKNOWN') throw new Error(`Unknown license: ${name}`)
    const dir = dirname(pkg.path)
    const files = readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /^(?:licen[cs]e|copying|notice|third[-_]?party)(?:[.\-_]|$|notice)/i.test(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        text: readFileSync(join(dir, entry.name), 'utf8'),
        source: `installed package/${entry.name}`,
      }))
    let reviewRequired = false
    if (!files.length) {
      const supplement = supplements.find(
        (item) => item.package === name && item.license === license,
      )
      if (!supplement)
        throw new Error(
          `Missing license text: ${name}; review its upstream notice before adding a supplement`,
        )
      const text = readFileSync(join(supplementsDir, supplement.file), 'utf8')
      if (hash(text) !== supplement.sha256)
        throw new Error(`License supplement hash mismatch: ${name}`)
      files.push({ name: supplement.file, text, source: supplement.source })
      reviewRequired = supplement.reviewRequired === true
    }
    if (files.some((file) => file.text.trim().length < 100))
      throw new Error(`Incomplete license text: ${name}`)
    return {
      name: pkg.name,
      version: pkg.version,
      license,
      reviewRequired,
      repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
      notices: files.map((file) => ({ ...file, sha256: hash(file.text) })),
    }
  })
}

/** A declaration-only record is useful for review, but cannot approve a binary release. */
export function assertReleaseLicenses(records) {
  const pending = records.filter((pkg) => pkg.reviewRequired)
  if (pending.length)
    throw new Error(
      'Unresolved attribution review blocks binary release: ' +
        pending.map((pkg) => `${pkg.name}@${pkg.version}`).join(', '),
    )
}

/** Publish complete notices for a conservative dependency superset, without claiming every entry is bundled. */
export function publishNotices(root, output = join(root, 'dist')) {
  const records = licenseRecords(root)
  const project = readJson(join(root, 'package.json'))
  if (project.license !== 'Apache-2.0')
    throw new Error('Expected the approved project license Apache-2.0')
  if (!readFileSync(join(root, 'LICENSE'), 'utf8').includes('Apache License'))
    throw new Error('Project Apache LICENSE is missing')
  mkdirSync(output, { recursive: true })
  const scope =
    'Conservative installed production dependency closure, including peers/optional dependencies. This is a superset, not a claim that every package is present in browser bundles.'
  const intro = `THIRD-PARTY NOTICES\n\n${scope}\nProject code is Apache-2.0; dependencies retain their own licenses.\nDeclaration-only records are explicitly marked for attribution review.\n`
  const text =
    intro +
    records
      .map(
        (pkg) =>
          `\n${'='.repeat(72)}\n${pkg.name}@${pkg.version} — ${pkg.license}\nAttribution review required: ${pkg.reviewRequired}\n${pkg.notices.map((notice) => `Source: ${notice.source}\nSHA256: ${notice.sha256}\n\n${notice.text}`).join('\n')}`,
      )
      .join('\n')
  const manifest = {
    scope,
    lockSha256: hash(readFileSync(join(root, 'pnpm-lock.yaml'))),
    packages: records.map((pkg) => ({
      ...pkg,
      notices: pkg.notices.map(({ text: _text, ...notice }) => notice),
    })),
  }
  writeFileSync(join(output, 'THIRD_PARTY_NOTICES.txt'), text)
  writeFileSync(join(output, 'third-party-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  copyFileSync(join(root, 'LICENSE'), join(output, 'LICENSE'))
  if (existsSync(join(root, 'NOTICE'))) copyFileSync(join(root, 'NOTICE'), join(output, 'NOTICE'))
  return records
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  const checking = process.argv.includes('--check') || process.argv.includes('--release')
  const records = checking ? licenseRecords(root) : publishNotices(root)
  const reviews = records.filter((pkg) => pkg.reviewRequired)
  if (process.argv.includes('--release')) assertReleaseLicenses(records)
  console.log(
    `${records.length} dependency license text records collected; ${reviews.length} declaration-only attribution review record(s)`,
  )
  if (reviews.length)
    console.log('Review records: ' + reviews.map((pkg) => `${pkg.name}@${pkg.version}`).join(', '))
}
