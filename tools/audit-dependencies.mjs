import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const registry = 'https://registry.npmjs.org'
const severities = ['info', 'low', 'moderate', 'high', 'critical']
const digest = (value) => createHash('sha256').update(value).digest('hex')

/** Wait for the owned child to close before releasing its cache lock, including on interruption. */
export function runCommand(command, args, options) {
  return new Promise((complete) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '',
      error,
      escalation
    const stop = () => {
      child.kill('SIGTERM')
      escalation ??= setTimeout(() => child.kill('SIGKILL'), 2_000)
    }
    const deadline = setTimeout(stop, options.timeout)
    options.signal?.addEventListener('abort', stop, { once: true })
    const maxBuffer = options.maxBuffer || 1024 * 1024
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      if (Buffer.byteLength(stdout) > maxBuffer) {
        error = new Error('Audit output exceeded the size limit')
        stop()
      }
    })
    child.stderr.resume()
    child.on('error', (cause) => {
      error = cause
    })
    child.on('close', (status, signal) => {
      clearTimeout(deadline)
      clearTimeout(escalation)
      options.signal?.removeEventListener('abort', stop)
      complete({ status, signal, stdout, error })
    })
  })
}

/** Use a fixed private cache; never accept an arbitrary output or cleanup path from the CLI. */
function privateCache(root) {
  let directory = root
  for (const segment of ['node_modules', '.cache', 'prototype-hub-audit']) {
    directory = join(directory, segment)
    if (existsSync(directory)) {
      const stat = lstatSync(directory)
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error('The audit cache must use real directories')
    } else mkdirSync(directory, { mode: 0o700 })
  }
  chmodSync(directory, 0o700)
  return directory
}

function parseAudit(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status))
    throw new Error('The official registry audit did not complete')
  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    throw new Error('The official registry audit did not return valid JSON')
  }
  const counts = report?.metadata?.vulnerabilities
  if (
    !report ||
    report.error ||
    !counts ||
    !severities.every((severity) => Number.isSafeInteger(counts[severity]) && counts[severity] >= 0)
  )
    throw new Error('The official registry audit returned an incomplete report')
  const total = severities.reduce((sum, severity) => sum + counts[severity], 0)
  if ((total === 0 && result.status !== 0) || (total > 0 && result.status === 0))
    throw new Error('The audit exit status and vulnerability counts disagree')
  return { report, counts, total, exitCode: result.status }
}

/** Run both scopes and publish one lock-bound receipt only after both reports are complete. */
export async function auditDependencies({ root = process.cwd(), run = runCommand, signal } = {}) {
  const cache = privateCache(resolve(root))
  const current = join(cache, 'current')
  const lock = join(cache, '.running')
  // An exclusive directory prevents one invocation from publishing another invocation's evidence.
  mkdirSync(lock, { mode: 0o700 })
  const staging = join(cache, 'run-' + randomUUID())
  let snapshot
  try {
    // Starting a new audit revokes the previous receipt, including on network or tool failure.
    rmSync(current, { recursive: true, force: true })
    mkdirSync(staging, { mode: 0o700 })
    const lockFile = join(root, 'pnpm-lock.yaml')
    const packageFile = join(root, 'package.json')
    const inputs = {
      lockSha256: digest(readFileSync(lockFile)),
      packageSha256: digest(readFileSync(packageFile)),
    }
    const manifest = JSON.parse(readFileSync(packageFile, 'utf8'))
    if (manifest.pnpm?.auditConfig?.ignoreCves?.length)
      throw new Error('Remove pnpm.auditConfig.ignoreCves before an unfiltered release audit')
    // An external snapshot avoids loading repository/ancestor npmrc or workspace configuration.
    snapshot = mkdtempSync(join(tmpdir(), 'prototype-hub-audit-'))
    chmodSync(snapshot, 0o700)
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, snapshot }), {
      mode: 0o600,
    })
    writeFileSync(join(snapshot, 'package.json'), readFileSync(packageFile), { mode: 0o600 })
    writeFileSync(join(snapshot, 'pnpm-lock.yaml'), readFileSync(lockFile), { mode: 0o600 })
    const emptyConfig = join(snapshot, '.npmrc')
    writeFileSync(emptyConfig, '', { mode: 0o600 })
    const userConfig = join(snapshot, 'user.npmrc')
    const globalConfig = join(snapshot, 'global.npmrc')
    writeFileSync(userConfig, '', { mode: 0o600 })
    writeFileSync(globalConfig, '', { mode: 0o600 })
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot']
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    )
    // pnpm 9 accepts the npm configuration environment keys; audit rejects bare --userconfig flags.
    env.npm_config_userconfig = userConfig
    env.npm_config_globalconfig = globalConfig
    const version = await run('pnpm', ['--version'], {
      cwd: snapshot,
      env,
      encoding: 'utf8',
      timeout: 15_000,
      signal,
    })
    const pnpmVersion = version.stdout?.trim()
    if (
      version.error ||
      version.signal ||
      version.status !== 0 ||
      !/^\d+\.\d+\.\d+$/.test(pnpmVersion) ||
      manifest.packageManager !== `pnpm@${pnpmVersion}` ||
      !pnpmVersion.startsWith('9.')
    )
      throw new Error('Unable to identify the pnpm audit tool')
    const reports = {}
    const errors = []
    for (const scope of ['production', 'all']) {
      const args = [
        'audit',
        ...(scope === 'production' ? ['--prod'] : []),
        '--json',
        '--registry',
        registry,
      ]
      try {
        reports[scope] = parseAudit(
          await run('pnpm', args, {
            cwd: snapshot,
            encoding: 'utf8',
            timeout: 180_000,
            maxBuffer: 16 * 1024 * 1024,
            env,
            signal,
          }),
        )
      } catch (error) {
        if (signal?.aborted)
          throw new Error('Dependency audit interrupted; no receipt was published')
        errors.push(`${scope}: ${error.message}`)
      }
    }
    if (errors.length) throw new Error(errors.join('; '))
    if (
      digest(readFileSync(lockFile)) !== inputs.lockSha256 ||
      digest(readFileSync(packageFile)) !== inputs.packageSha256
    )
      throw new Error('Dependency inputs changed during the audit; no receipt was published')
    const passed = Object.values(reports).every((result) => result.total === 0)
    const receipt = {
      schemaVersion: 1,
      registry,
      checkedAt: new Date().toISOString(),
      ...inputs,
      nodeVersion: process.version,
      pnpmVersion,
      passed,
      scopes: Object.fromEntries(
        Object.entries(reports).map(([scope, result]) => [
          scope,
          { exitCode: result.exitCode, vulnerabilities: result.counts, report: `${scope}.json` },
        ]),
      ),
    }
    for (const [scope, result] of Object.entries(reports))
      writeFileSync(join(staging, `${scope}.json`), JSON.stringify(result.report, null, 2) + '\n', {
        mode: 0o600,
      })
    writeFileSync(join(staging, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {
      mode: 0o600,
    })
    // The directory rename publishes complete raw reports and their identity as one generation.
    renameSync(staging, current)
    return { exitCode: passed ? 0 : 1, receipt }
  } finally {
    rmSync(staging, { recursive: true, force: true })
    if (snapshot) rmSync(snapshot, { recursive: true, force: true })
    rmSync(lock, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('This audit command does not accept arguments')
    process.exitCode = 2
  } else {
    const controller = new globalThis.AbortController()
    let interrupted
    const onInterrupt = (signal) => {
      interrupted = signal
      controller.abort()
    }
    const onSigint = () => onInterrupt('SIGINT')
    const onSigterm = () => onInterrupt('SIGTERM')
    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)
    try {
      const result = await auditDependencies({ signal: controller.signal })
      for (const [scope, evidence] of Object.entries(result.receipt.scopes))
        console.log(`${scope}: ${JSON.stringify(evidence.vulnerabilities)}`)
      console.log('Private reports: node_modules/.cache/prototype-hub-audit/current')
      console.log(result.receipt.passed ? 'Dependency audit passed' : 'Dependency audit failed')
      process.exitCode = result.exitCode
    } catch (error) {
      console.error(error.message)
      process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 2
    } finally {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
    }
  }
}
