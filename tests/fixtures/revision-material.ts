import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Revision, Version } from '../../src/modules/protohub-manager-ui/types'
import type {
  RevisionMaterial,
  MaterialSource,
} from '../../src/modules/protohub-manager-ui/types/revision-material'
const rows = new Map<string, RevisionMaterial>()
const files = new Map<string, Buffer>()
const receipts = new Map<string, { fingerprint: string; value: unknown }>()
let serial = 0
export function resetMaterials() {
  rows.clear()
  files.clear()
  receipts.clear()
  serial = 0
}
function source(data: Record<string, unknown>): MaterialSource {
  return Object.fromEntries(
    ['sourceTool', 'sourceName', 'sourceUrl', 'sourceNotes'].map((key) => [
      key,
      typeof data[key] === 'string' ? data[key].trim() || null : null,
    ]),
  )
}
export function recordImportSource(version: Version, fields: Map<string, Buffer>, now: number) {
  const declared = source(
    Object.fromEntries(
      [...fields].filter(([key]) => key !== 'file').map(([key, value]) => [key, value.toString()]),
    ),
  )
  if (!Object.values(declared).some(Boolean)) return
  const bytes = fields.get('file') || Buffer.alloc(0),
    id = `prototype-${++serial}`
  rows.set(id, {
    id,
    projectId: version.projectId,
    versionId: version.id,
    revisionId: version.currentRevisionId!,
    materialType: 'prototype',
    fileName: 'original.zip',
    mediaType: 'application/zip',
    fileSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    configVersion: 0,
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: now,
    updatedAt: now,
    ...declared,
  })
  files.set(id, bytes)
}
export function materialsResponse(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
  data: Record<string, unknown>,
  bytes: Buffer,
  revisions: Map<string, Revision>,
  member: boolean,
  now: number,
  send: (
    res: ServerResponse,
    status: number,
    result: unknown,
    message?: string,
    code?: string,
  ) => void,
) {
  const match = path.match(
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/materials(?:\/(.*))?$/,
  )
  if (!match) return false
  const versionId = decodeURIComponent(match[1]!),
    revisionId = decodeURIComponent(match[2]!),
    action = match[3] || '',
    revision = revisions.get(revisionId)
  if (!revision || revision.versionId !== versionId) {
    send(res, 404, null, 'Revision unavailable')
    return true
  }
  if (member && action !== '_query' && !action.endsWith('/content')) {
    send(res, 403, null, 'Access denied')
    return true
  }
  const scope = [...rows.values()].filter(
    (row) => row.versionId === versionId && row.revisionId === revisionId,
  )
  if (action === '_query' && method === 'POST') {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    const values = scope
      .filter((row) => !data.materialType || row.materialType === data.materialType)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    send(res, 200, {
      data: values.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: values.length,
      pageIndex,
      pageSize,
    })
    return true
  }
  const [id, suffix] = action.split('/'),
    existing = rows.get(id || '')
  if (suffix === 'content' && method === 'GET') {
    if (!existing || !scope.includes(existing)) send(res, 404, null, 'File missing')
    else {
      res.writeHead(200, {
        'content-type': existing.mediaType,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(existing.fileName)}`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      })
      res.end(files.get(existing.id))
    }
    return true
  }
  let upload: { fileName: string; content: Buffer } | undefined
  if (!action && method === 'POST') {
    const boundary = String(req.headers['content-type'])
      .match(/boundary=(?:"([^"]+)"|([^;]+))/)
      ?.slice(1)
      .find(Boolean)
    const fields: Record<string, unknown> = {}
    for (const part of bytes.toString('latin1').split(`--${boundary}`).slice(1, -1)) {
      const split = part.indexOf('\r\n\r\n'),
        header = part.slice(0, split),
        key = header.match(/\bname="([^"]+)"/)?.[1],
        value = Buffer.from(part.slice(split + 4, -2), 'latin1')
      if (key === 'file')
        upload = {
          fileName: Buffer.from(
            header.match(/filename="([^"]+)"/)?.[1] || 'file',
            'latin1',
          ).toString(),
          content: value,
        }
      else if (key) fields[key] = value.toString()
    }
    data = fields
  }
  const requestKey = String(req.headers['idempotency-key'] || data.clientRequestId || '')
  const receiptKey = `${path}:${method}:${requestKey}`,
    fingerprint = JSON.stringify([
      data,
      upload?.fileName,
      upload && createHash('sha256').update(upload.content).digest('hex'),
    ])
  const prior = receipts.get(receiptKey)
  if (prior) {
    if (
      prior.value &&
      typeof prior.value === 'object' &&
      'id' in prior.value &&
      !rows.has(String(prior.value.id))
    ) {
      send(res, 409, null, 'Original creation was deleted', 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT')
      return true
    }
    send(
      res,
      prior.fingerprint === fingerprint ? 200 : 409,
      prior.fingerprint === fingerprint ? prior.value : null,
      'Receipt replay',
    )
    return true
  }
  let result: unknown
  if (!action && upload) {
    const extension = upload.fileName.split('.').pop()?.toLowerCase(),
      image = ['png', 'jpg', 'jpeg'].includes(extension || '')
    if (!image && !['pdf', 'txt', 'md', 'docx', 'xlsx', 'pptx'].includes(extension || '')) {
      send(res, 400, null, 'Unsupported material')
      return true
    }
    const id = `material-${++serial}`
    const media = image
      ? extension === 'png'
        ? 'image/png'
        : 'image/jpeg'
      : extension === 'pdf'
        ? 'application/pdf'
        : 'application/octet-stream'
    const row: RevisionMaterial = {
      id,
      projectId: revision.projectId,
      versionId,
      revisionId,
      materialType: image ? 'image' : 'document',
      fileName: upload.fileName,
      mediaType: media,
      fileSize: upload.content.length,
      sha256: createHash('sha256').update(upload.content).digest('hex'),
      configVersion: 0,
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: now,
      updatedAt: now,
      ...source(data),
    }
    rows.set(id, row)
    files.set(id, upload.content)
    result = row
  } else if (action === 'prototype-source' && method === 'POST') {
    if (scope.some((row) => row.materialType === 'prototype')) {
      send(res, 409, null, 'Source already exists')
      return true
    }
    const content = Buffer.from('mock-original.zip')
    const row: RevisionMaterial = {
      id: `prototype-${++serial}`,
      projectId: revision.projectId,
      versionId,
      revisionId,
      materialType: 'prototype',
      fileName: 'original.zip',
      mediaType: 'application/zip',
      fileSize: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      configVersion: 0,
      createdBy: 'admin',
      updatedBy: 'admin',
      createdAt: now,
      updatedAt: now,
      ...source(data),
    }
    rows.set(row.id, row)
    files.set(row.id, content)
    result = row
  } else if (existing && scope.includes(existing)) {
    if (data.expectedVersion !== existing.configVersion) {
      send(res, 409, null, 'Source changed', 'PROTOTYPE_HUB_MATERIAL_CONFLICT')
      return true
    }
    if (method === 'PUT') {
      Object.assign(existing, source(data), {
        configVersion: existing.configVersion + 1,
        updatedAt: now,
      })
      result = existing
    } else if (method === 'POST' && suffix === '_delete') {
      rows.delete(existing.id)
      files.delete(existing.id)
      result = true
    }
  }
  if (result === undefined) send(res, 404, null, 'Material unavailable')
  else {
    receipts.set(receiptKey, { fingerprint, value: structuredClone(result) })
    send(res, 200, result)
  }
  return true
}
