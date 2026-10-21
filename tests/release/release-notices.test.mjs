import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runtimeDependencies } from '../../tools/lib/dependencies.mjs'
import {
  assertReleaseLicenses,
  licenseRecords,
  publishNotices,
} from '../../tools/third-party-notices.mjs'

const text =
  'Copyright fixture contributors.\nPermission is hereby granted to reproduce this license fixture. '.repeat(
    3,
  )
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'proto-license-test-'))
  function file(path, data) {
    const target = join(root, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data))
  }
  file('package.json', {
    name: 'fixture',
    license: 'Apache-2.0',
    dependencies: { a: '1.0.0' },
    devDependencies: { excluded: '1.0.0' },
  })
  file('node_modules/a/package.json', {
    name: 'a',
    version: '1.0.0',
    license: 'MIT',
    dependencies: { b: '1.0.0' },
  })
  file('node_modules/b/package.json', {
    name: 'b',
    version: '1.0.0',
    license: 'MIT',
    dependencies: { a: '1.0.0' },
    optionalDependencies: { unavailable: '1.0.0' },
  })
  file('node_modules/a/LICENSE', text)
  file('node_modules/b/LICENSE', text)
  file('LICENSE', 'Apache License, Version 2.0')
  file('NOTICE', 'Project NOTICE fixture')
  file('pnpm-lock.yaml', 'fixture lock')
  file('supplements/supplements.json', [])
  try {
    run({ root, file, supplements: join(root, 'supplements') })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
test('walks installed production cycles once, excludes dev-only packages and tolerates absent optional packages', () =>
  fixture(({ root }) => {
    assert.deepEqual(
      runtimeDependencies(root).map((p) => p.name),
      ['a', 'b'],
    )
  }))
test('does not turn an absent required dependency into an incomplete successful inventory', () =>
  fixture(({ root, file }) => {
    file('node_modules/b/package.json', {
      name: 'b',
      version: '1.0.0',
      dependencies: { missing: '1.0.0' },
    })
    assert.throws(() => runtimeDependencies(root), /Missing installed dependency missing/)
  }))
test('fails when a new package lacks license text instead of emitting only its SPDX label', () =>
  fixture(({ root, supplements }) => {
    rmSync(join(root, 'node_modules/a/LICENSE'))
    assert.throws(() => licenseRecords(root, supplements), /Missing license text: a@1.0.0/)
  }))
test('rejects changed supplement contents and version-mismatched exceptions', () =>
  fixture(({ root, file, supplements }) => {
    rmSync(join(root, 'node_modules/a/LICENSE'))
    file('supplements/a.txt', text)
    file('supplements/supplements.json', [
      { package: 'a@1.0.0', license: 'MIT', file: 'a.txt', sha256: 'invalid' },
    ])
    assert.throws(() => licenseRecords(root, supplements), /hash mismatch/)
    file('supplements/supplements.json', [{ package: 'a@0.9.0', license: 'MIT', file: 'a.txt' }])
    assert.throws(() => licenseRecords(root, supplements), /Missing license text/)
  }))
test('keeps declaration-only evidence visible but rejects it at the binary release gate', () =>
  fixture(({ root, file, supplements }) => {
    rmSync(join(root, 'node_modules/a/LICENSE'))
    file('supplements/a.txt', text)
    file('supplements/supplements.json', [
      {
        package: 'a@1.0.0',
        license: 'MIT',
        file: 'a.txt',
        sha256: createHash('sha256').update(text).digest('hex'),
        source: 'https://example.org/upstream/declaration',
        reviewRequired: true,
      },
    ])
    const records = licenseRecords(root, supplements)
    assert.equal(records.find((pkg) => pkg.name === 'a').reviewRequired, true)
    assert.throws(() => assertReleaseLicenses(records), /blocks binary release: a@1\.0\.0/)
  }))
test('permits the binary release gate when installed packages provide their notices', () =>
  fixture(({ root, supplements }) => {
    assert.doesNotThrow(() => assertReleaseLicenses(licenseRecords(root, supplements)))
  }))
test('includes license, third-party notices and the project grant in distributable output without absolute paths', () =>
  fixture(({ root, file }) => {
    file('node_modules/a/NOTICE', 'Additional attribution from the package. '.repeat(4))
    const output = join(root, 'dist')
    publishNotices(root, output)
    const notices = readFileSync(join(output, 'THIRD_PARTY_NOTICES.txt'), 'utf8')
    assert.ok(notices.includes(text))
    assert.ok(notices.includes('Additional attribution'))
    assert.ok(notices.includes('superset'))
    assert.ok(!notices.includes(root))
    assert.equal(readFileSync(join(output, 'NOTICE'), 'utf8'), 'Project NOTICE fixture')
    assert.equal(readFileSync(join(output, 'LICENSE'), 'utf8'), 'Apache License, Version 2.0')
    const manifest = JSON.parse(readFileSync(join(output, 'third-party-manifest.json'), 'utf8'))
    assert.equal(manifest.packages.length, 2)
    assert.ok(!JSON.stringify(manifest).includes(root))
  }))
