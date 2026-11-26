import { createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { strToU8, zipSync } from 'fflate'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import type { DeliveryDocumentInput } from '../../src/modules/protohub-manager-ui/types/delivery-document'
// Isolated wire/UI fixture. Source authorization and offline export safety are verified on the real API.
let sourceVersion = 0
export function resetDeliveryDocuments() {
  sourceVersion = 0
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function deliveryDocumentResponse(
  path: string,
  method: string,
  data: Record<string, unknown>,
  revisions: Map<string, Revision>,
  manifest: (revision: string) => PrototypePage[],
  res: ServerResponse,
  send: Send,
) {
  if (process.env.PROTOTYPE_HUB_TEST_DELIVERY_DOCUMENT !== '1') return false
  const fixed = path.match(/^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/(.*)$/)
  const specs = path.match(/^\/prototype-hub\/versions\/([^/]+)\/element-descriptions(.*)$/)
  if (!fixed && !specs) return false
  const versionId = decodeURIComponent((fixed || specs)![1]!),
    revisionId = fixed ? decodeURIComponent(fixed[2]!) : String(data.revisionId || '')
  const revision = revisions.get(revisionId)
  if (!revision || revision.versionId !== versionId) return false
  const flatten = (pages: PrototypePage[]): PrototypePage[] =>
    pages.flatMap((page) => [page, ...flatten(page.children || [])])
  const pages = flatten(manifest(revisionId)),
    pageId = String(data.pageId || fixed?.[3].match(/^pages\/([^/]+)/)?.[1] || '')
  const meta = {
    projectId: revision.projectId,
    versionId,
    revisionId,
    pageId,
    configVersion: sourceVersion,
  }
  const descriptions = Array.from({ length: 23 }, (_, index) => ({
    ...meta,
    id: `description-${index + 1}`,
    title: `Description ${index + 1}`,
    purpose: `真实来源 / Source ${index + 1}`,
    inputRules: '',
    permissionRules: '',
    navigationRules: '',
    notes: '',
    anchor: null,
    createdAt: index,
    updatedAt: index,
  }))
  const materials = [
    {
      ...meta,
      id: 'document-1',
      materialType: 'document',
      fileName: 'Delivery notes.txt',
      mediaType: 'text/plain',
      fileSize: 100,
      sha256: 'a'.repeat(64),
      sourceName: 'User notes',
      textStatus: 'READY',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      ...meta,
      id: 'image-1',
      materialType: 'image',
      fileName: 'Screen.png',
      mediaType: 'image/png',
      fileSize: 68,
      sha256: 'b'.repeat(64),
      createdAt: 1,
      updatedAt: 1,
    },
  ]
  const checks = [
    {
      ...meta,
      id: 'check-1',
      title: 'Keyboard interaction',
      category: { value: 'normal', text: 'Normal' },
      result: { value: 'passed', text: 'Passed' },
      steps: 'Tab and Enter',
      expected: 'Button works',
      observed: 'Worked',
      evidence: 'Manual record',
      viewportWidth: 390,
      viewportHeight: 844,
      viewportScale: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ]
  function paging(rows: unknown[]) {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    send(res, 200, {
      data: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: rows.length,
      pageIndex,
      pageSize,
    })
  }
  if (specs) {
    if (specs[2] === '/_query') paging(descriptions)
    else
      send(
        res,
        200,
        descriptions.find((row) => row.id === specs[2]!.slice(1)),
      )
    return true
  }
  const suffix = fixed![3]!
  if (suffix === 'materials/_query') {
    paging(materials)
    return true
  }
  if (suffix.startsWith('materials/')) {
    if (suffix.endsWith('/content')) {
      const image = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      )
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="Screen.png"',
      })
      res.end(image)
    } else
      send(
        res,
        200,
        materials.find((row) => row.id === suffix.split('/')[1]),
      )
    return true
  }
  if (/^pages\/[^/]+\/viewport-checks\/_query$/.test(suffix)) {
    paging(checks)
    return true
  }
  if (!suffix.startsWith('delivery-document/')) return false
  if (suffix.endsWith('/_test/change')) {
    sourceVersion++
    send(res, 200, true)
    return true
  }
  if (suffix.endsWith('/_test/deny')) {
    send(res, 403, null, 'Access denied')
    return true
  }
  const input = data as unknown as DeliveryDocumentInput
  const items = input.pages.map((page) => {
    const actual = pages.find((item) => item.pageId === page.pageId)!
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          page.pageId,
          page.descriptions,
          page.materials,
          page.images,
          page.checks,
          input.locale,
          sourceVersion,
        ]),
      )
      .digest('hex')
    return {
      ...page,
      name: actual.name,
      path: actual.path,
      body:
        page.body ??
        [
          ...page.descriptions.map((ref) => `${ref.id}: Source text`),
          ...page.materials.map(
            (ref) => `Material ${ref.id}${ref.includeText ? ': Extracted text' : ''}`,
          ),
          ...page.checks.map((ref) => `Manual record ${ref.id}`),
        ].join('\n'),
      sourceFingerprint: fingerprint,
    }
  })
  if (method === 'POST' && suffix.endsWith('/_assemble')) {
    send(res, 200, { ...input, projectId: revision.projectId, versionId, revisionId, pages: items })
    return true
  }
  if (suffix.includes('/_export/')) {
    if (
      items.some((page, index) => page.sourceFingerprint !== input.pages[index]?.sourceFingerprint)
    ) {
      send(res, 409, null, 'Sources changed', 'PROTOTYPE_HUB_DELIVERY_DOCUMENT_SOURCE_CHANGED')
      return true
    }
    const text = `${input.title}\n${input.introduction}\n${items.map((page) => page.body).join('\n')}`
    const html = suffix.endsWith('/html'),
      bytes = html
        ? Buffer.from(
            `<html><body><pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`,
          )
        : zipSync({ '说明书.md': strToU8(text) })
    res.writeHead(200, {
      'Content-Type': html ? 'text/html;charset=UTF-8' : 'application/zip',
      'Content-Disposition': `attachment; filename="delivery-document.${html ? 'html' : 'zip'}"`,
    })
    res.end(bytes)
    return true
  }
  return false
}
