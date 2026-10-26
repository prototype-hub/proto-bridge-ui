import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  watchFile,
  unwatchFile,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { auditDependencies, runCommand } from '../../tools/audit-dependencies.mjs'

const clean = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
function response(vulnerabilities = clean) {
  const found = Object.values(vulnerabilities).some((count) => count > 0)
  return {
    status: found ? 1 : 0,
    stdout: JSON.stringify({
      metadata: { vulnerabilities },
      advisories: found ? { fixture: { severity: 'high' } } : {},
    }),
  }
}
async function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'proto-audit-test-'))
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","packageManager":"pnpm@9.0.6"}')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'fixture lock')
  const cache = join(root, 'node_modules', '.cache', 'prototype-hub-audit')
  const current = join(cache, 'current')
  const commands = []
  const cli = (command, args, options) => {
    commands.push({ command, args, options })
    return args[0] === '--version' ? { status: 0, stdout: '9.0.6\n' } : response()
  }
  try {
    await run({ root, cache, current, commands, cli })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('audits production and all dependencies against the official registry and binds private evidence to inputs', () =>
  fixture(async ({ root, current, commands, cli }) => {
    const result = await auditDependencies({ root, run: cli })
    assert.equal(result.exitCode, 0)
    assert.equal(result.receipt.passed, true)
    assert.match(result.receipt.lockSha256, /^[a-f0-9]{64}$/)
    assert.match(result.receipt.packageSha256, /^[a-f0-9]{64}$/)
    assert.equal(result.receipt.pnpmVersion, '9.0.6')
    assert.deepEqual(
      commands.slice(1).map(({ args }) => args.slice(0, args.includes('--prod') ? 5 : 4)),
      [
        ['audit', '--prod', '--json', '--registry', 'https://registry.npmjs.org'],
        ['audit', '--json', '--registry', 'https://registry.npmjs.org'],
      ],
    )
    for (const { options } of commands.slice(1)) {
      assert.ok(!options.cwd.startsWith(root))
      assert.equal(options.env.npm_config_userconfig, join(options.cwd, 'user.npmrc'))
      assert.equal(options.env.npm_config_globalconfig, join(options.cwd, 'global.npmrc'))
      assert.equal(existsSync(options.cwd), false)
    }
    assert.equal(statSync(current).mode & 0o777, 0o700)
    for (const file of ['receipt.json', 'production.json', 'all.json'])
      assert.equal(statSync(join(current, file)).mode & 0o777, 0o600)
    assert.ok(!JSON.stringify(result.receipt).includes(root))
  }))

test('keeps all findings and returns failure instead of suppressing a known development advisory', () =>
  fixture(async ({ root, current, cli }) => {
    const result = await auditDependencies({
      root,
      run: (command, args, options) =>
        args[0] === 'audit' && !args.includes('--prod')
          ? response({ ...clean, high: 1 })
          : cli(command, args, options),
    })
    assert.equal(result.exitCode, 1)
    assert.equal(result.receipt.passed, false)
    assert.equal(result.receipt.scopes.production.exitCode, 0)
    assert.equal(result.receipt.scopes.all.vulnerabilities.high, 1)
    assert.deepEqual(JSON.parse(readFileSync(join(current, 'all.json'))).advisories, {
      fixture: { severity: 'high' },
    })
  }))

test('revokes an older receipt and publishes no partial reports when one scope cannot reach the registry', () =>
  fixture(async ({ root, current, commands, cli }) => {
    await auditDependencies({ root, run: cli })
    commands.length = 0
    await assert.rejects(
      () =>
        auditDependencies({
          root,
          run: (command, args, options) =>
            args.includes('--prod')
              ? { status: 1, stdout: '{"error":{"code":"ECONNRESET"}}' }
              : cli(command, args, options),
        }),
      /production:.*incomplete report/,
    )
    assert.equal(existsSync(current), false)
    assert.equal(commands.filter(({ args }) => args[0] === 'audit').length, 1)
  }))

test('rejects malformed JSON, inconsistent exit status and incomplete counts without a receipt', () =>
  fixture(async ({ root, current, cli }) => {
    for (const result of [
      { status: 0, stdout: 'not JSON' },
      { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { high: 0 } } }) },
      { ...response({ ...clean, high: 1 }), status: 0 },
      { ...response(), status: 1 },
      { status: null, signal: 'SIGTERM', stdout: '{}' },
    ]) {
      await assert.rejects(() =>
        auditDependencies({
          root,
          run: (command, args, options) =>
            args[0] === 'audit' ? result : cli(command, args, options),
        }),
      )
      assert.equal(existsSync(current), false)
    }
  }))

test('rejects dependency input changes during a complete audit', () =>
  fixture(async ({ root, current, cli }) => {
    await assert.rejects(
      () =>
        auditDependencies({
          root,
          run: (command, args, options) => {
            if (args[0] === 'audit' && !args.includes('--prod'))
              writeFileSync(join(root, 'pnpm-lock.yaml'), 'changed')
            return cli(command, args, options)
          },
        }),
      /inputs changed/,
    )
    assert.equal(existsSync(current), false)
  }))

test('a missing pnpm tool revokes the old generation and leaves no successful evidence', () =>
  fixture(async ({ root, current, cli }) => {
    await auditDependencies({ root, run: cli })
    await assert.rejects(
      () => auditDependencies({ root, run: () => ({ status: null, error: new Error('ENOENT') }) }),
      /identify the pnpm/,
    )
    assert.equal(existsSync(current), false)
  }))

test('a timeout rejects valid output even when the real child handles SIGTERM and exits successfully', async () => {
  const result = await runCommand(
    process.execPath,
    [
      '-e',
      `process.on('SIGTERM', () => { console.log(${JSON.stringify(response().stdout)}); process.exit(0) }); setInterval(() => {}, 1000)`,
    ],
    { timeout: 500 },
  )
  assert.equal(result.status, 0)
  assert.equal(result.signal, null)
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(response().stdout))
  assert.match(result.error?.message || '', /timed out/)
})

test('a timeout escalates to SIGKILL and waits for the real child to close', async () => {
  const result = await runCommand(
    process.execPath,
    [
      '-e',
      "process.on('SIGTERM', () => {}); console.log(process.pid); setInterval(() => {}, 1000)",
    ],
    { timeout: 500 },
  )
  assert.equal(result.status, null)
  assert.equal(result.signal, 'SIGKILL')
  assert.match(result.error?.message || '', /timed out/)
  assert.throws(() => process.kill(Number(result.stdout.trim()), 0), /ESRCH/)
})

test('accepts a real child result completed before its deadline', async () => {
  const result = await runCommand(process.execPath, ['-e', "console.log('9.0.6')"], {
    timeout: 2_000,
  })
  assert.equal(result.status, 0)
  assert.equal(result.signal, null)
  assert.equal(result.error, undefined)
  assert.equal(result.stdout.trim(), '9.0.6')
})

test('a timeout revokes the old receipt instead of publishing the successful-looking child report', () =>
  fixture(async ({ root, cache, current, cli }) => {
    await auditDependencies({ root, run: cli })
    let timedOut
    await assert.rejects(
      () =>
        auditDependencies({
          root,
          run: async (command, args, options) => {
            if (!args.includes('--prod')) return cli(command, args, options)
            timedOut = await runCommand(
              process.execPath,
              [
                '-e',
                `process.on('SIGTERM', () => { console.log(${JSON.stringify(response().stdout)}); process.exit(0) }); setInterval(() => {}, 1000)`,
              ],
              { ...options, timeout: 500 },
            )
            return timedOut
          },
        }),
      /production:.*did not complete/,
    )
    assert.equal(timedOut.status, 0)
    assert.match(timedOut.error?.message || '', /timed out/)
    assert.equal(existsSync(current), false)
    assert.equal(existsSync(join(cache, '.running')), false)
  }))

test('refuses a redirected cache and does not delete files at a symlink target', () =>
  fixture(async ({ root }) => {
    const outside = join(root, 'unrelated')
    mkdirSync(outside)
    writeFileSync(join(outside, 'keep'), 'untouched')
    mkdirSync(join(root, 'node_modules'))
    symlinkSync(outside, join(root, 'node_modules', '.cache'))
    await assert.rejects(() => auditDependencies({ root }), /real directories/)
    assert.equal(readFileSync(join(outside, 'keep'), 'utf8'), 'untouched')
  }))

test('an overlapping invocation cannot remove evidence or the other invocation lock', () =>
  fixture(async ({ root, cache, current, cli }) => {
    await auditDependencies({ root, run: cli })
    mkdirSync(join(cache, '.running'))
    await assert.rejects(() => auditDependencies({ root, run: cli }), /EEXIST/)
    assert.equal(existsSync(join(current, 'receipt.json')), true)
    assert.equal(existsSync(join(cache, '.running')), true)
  }))

test('rejects manifest advisory ignores and revokes previous evidence', () =>
  fixture(async ({ root, current, cli }) => {
    await auditDependencies({ root, run: cli })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@9.0.6',
        pnpm: { auditConfig: { ignoreCves: ['CVE-fixture'] } },
      }),
    )
    await assert.rejects(() => auditDependencies({ root, run: cli }), /ignoreCves/)
    assert.equal(existsSync(current), false)
  }))

test('isolates environment and project configuration that would narrow a default all audit', () =>
  fixture(async ({ root, cli }) => {
    const keys = [
      'NODE_ENV',
      'npm_config_production',
      'npm_config_only',
      'npm_config_ignore_registry_errors',
    ]
    const previous = keys.map((key) => process.env[key])
    writeFileSync(
      join(root, '.npmrc'),
      'production=true\noptional=false\nignore-registry-errors=true\n',
    )
    try {
      for (const key of keys) process.env[key] = key === 'NODE_ENV' ? 'production' : 'true'
      await auditDependencies({
        root,
        run: (command, args, options) => {
          assert.ok(keys.every((key) => !(key in options.env)))
          assert.equal(readFileSync(join(options.cwd, '.npmrc'), 'utf8'), '')
          return cli(command, args, options)
        },
      })
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key]
        else process.env[key] = previous[index]
      })
    }
  }))

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`the real CLI cleans its child, snapshot and lock after ${signal}, then permits another audit`, () =>
    fixture(async ({ root, cache, current }) => {
      const bin = join(root, 'bin')
      mkdirSync(bin)
      const marker = join(root, 'child.json')
      const cleanReport = JSON.stringify(response().stdout)
      writeFileSync(
        join(bin, 'pnpm'),
        `#!${process.execPath}\nconst fs = require('node:fs'); if(process.argv.includes('--version')) { console.log('9.0.6') } else if(fs.existsSync(${JSON.stringify(join(root, 'finish'))})) { console.log(${cleanReport}) } else { fs.writeFileSync(${JSON.stringify(marker + '.tmp')}, JSON.stringify({pid:process.pid,cwd:process.cwd()})); fs.renameSync(${JSON.stringify(marker + '.tmp')}, ${JSON.stringify(marker)}); setInterval(()=>{},1000) }\n`,
        { mode: 0o700 },
      )
      const script = fileURLToPath(new URL('../../tools/audit-dependencies.mjs', import.meta.url))
      const env = { ...process.env, PATH: bin + ':' + process.env.PATH }
      let deadline
      // stat polling also works when the host's kernel file-watcher budget is exhausted.
      const ready = new Promise((complete, reject) => {
        watchFile(marker, { interval: 50 }, (stat) => {
          if (stat.size > 0) complete()
        })
        deadline = setTimeout(() => reject(new Error('Audit fixture did not become ready')), 10_000)
      })
      const child = spawn(process.execPath, [script], { cwd: root, env, stdio: 'ignore' })
      const closed = new Promise((complete) => child.on('close', (code) => complete(code)))
      try {
        await ready
        assert.equal(existsSync(marker), true)
        const owned = JSON.parse(readFileSync(marker, 'utf8'))
        child.kill(signal)
        assert.equal(await closed, signal === 'SIGINT' ? 130 : 143)
        assert.equal(existsSync(current), false)
        assert.equal(existsSync(join(cache, '.running')), false)
        assert.equal(existsSync(owned.cwd), false)
        assert.throws(() => process.kill(owned.pid, 0), /ESRCH/)
        writeFileSync(join(root, 'finish'), '')
        const retry = spawn(process.execPath, [script], { cwd: root, env, stdio: 'ignore' })
        assert.equal(
          await new Promise((complete) => retry.on('close', (code) => complete(code))),
          0,
        )
        assert.equal(JSON.parse(readFileSync(join(current, 'receipt.json'))).passed, true)
      } finally {
        clearTimeout(deadline)
        unwatchFile(marker)
        if (child.exitCode === null) {
          child.kill('SIGTERM')
          await closed
        }
      }
    }))
}
