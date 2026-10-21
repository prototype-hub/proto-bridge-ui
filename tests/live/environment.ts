import { statSync } from 'node:fs'
import { resolve } from 'node:path'

/** Live tests require the isolated runtime verifier; there is no mock or credential fallback. */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Live verification requires ${name}`)
  return value
}

export function liveEnvironment() {
  const api = new URL(required('PROTO_E2E_API_URL'))
  if (
    api.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  ) {
    throw new Error('Live verification requires a loopback API origin without credentials or path')
  }
  const zipPath = resolve(required('PROTO_E2E_ZIP_PATH'))
  if (!statSync(zipPath).isFile()) throw new Error('Live verification requires a fixture ZIP file')
  return {
    apiOrigin: api.origin,
    username: required('PROTO_E2E_USERNAME'),
    password: required('PROTO_E2E_PASSWORD'),
    zipPath,
  }
}
