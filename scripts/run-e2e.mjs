import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url))
const result = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status || 1)
await import('./export-test-artifacts.mjs')
