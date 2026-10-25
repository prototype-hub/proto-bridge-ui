import { randomUUID, randomBytes, createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type {
  ReviewThread,
  ReviewMessage,
  ReviewIdentity,
  Share,
  PrototypePage,
  ReviewImage,
} from '../../src/modules/protohub-manager-ui/types'
// UI fixtures model paging, visibility and receipt-shaped retries, not SQL/authentication guarantees.
interface StoredThread {
  thread: ReviewThread
  shareId: string
  versionId: string
  owner: string
}
const threads = new Map<string, StoredThread>(),
  messages = new Map<string, ReviewMessage[]>()
const receipts = new Map<string, { body: string; id: string; message: boolean }>()
const images = new Map<string, ThreadImage>()
export interface ThreadImage {
  bytes: Buffer
  info: ReviewImage
}
export function resetThreads() {
  threads.clear()
  messages.clear()
  receipts.clear()
  images.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
const owner = (identity: ReviewIdentity) => `${identity.verificationLevel}:${identity.guestId}`
function pageRows<T>(rows: T[], input: Record<string, unknown>) {
  const pageIndex = Number(input.pageIndex),
    pageSize = Number(input.pageSize)
  if (
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex > 10000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    return undefined
  return {
    data: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    total: rows.length,
    pageIndex,
    pageSize,
  }
}
function flat(pages: PrototypePage[]): PrototypePage[] {
  return pages.flatMap((page) => [page, ...flat(page.children || [])])
}
export function threadResponse(
  res: ServerResponse,
  versionId: string,
  pages: PrototypePage[],
  input: Record<string, unknown>,
  suffix: string,
  method: string,
  send: Send,
  guest?: { share: Share; identity: ReviewIdentity },
  image?: ThreadImage,
) {
  const rid = String(input.revisionId),
    pageId = String(input.pageId),
    matches = flat(pages).filter((page) => page.pageId === pageId && page.path && !page.folder)
  if (matches.length !== 1) {
    send(res, 404, null, 'Feedback unavailable', 'PROTOTYPE_HUB_REVIEW_PAGE_INVALID')
    return
  }
  const allowed = (row: StoredThread) =>
    row.versionId === versionId &&
    row.thread.revisionId === rid &&
    row.thread.pageId === pageId &&
    (!guest || (row.shareId === guest.share.id && row.owner === owner(guest.identity)))
  if (suffix === '/_query' && method === 'POST') {
    const rows = [...threads.values()]
      .filter(allowed)
      .map((value) => value.thread)
      .filter((row) => !input.state || row.state === input.state)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    const result = pageRows(rows, input)
    send(res, result ? 200 : 400, result)
    return
  }
  const [, id, action, query] = suffix.split('/')
  const stored = id ? threads.get(decodeURIComponent(id)) : undefined
  if (suffix && (!stored || !allowed(stored))) {
    send(res, 404, null, 'Feedback unavailable', 'PROTOTYPE_HUB_REVIEW_THREAD_UNAVAILABLE')
    return
  }
  if (action === '_detail' && method === 'POST') {
    send(res, 200, stored!.thread)
    return
  }
  if (action === 'messages' && query === '_query' && method === 'POST') {
    const rows = (messages.get(id!) || []).filter(
      (message) => !guest || message.visibility === 'public',
    )
    const result = pageRows(rows, input)
    send(res, result ? 200 : 400, result)
    return
  }
  if (action === 'messages' && suffix.split('/')[4] === 'image' && method === 'POST') {
    const message = messages
      .get(id!)
      ?.find((row) => row.id === query && (!guest || row.visibility === 'public'))
    const value = message && images.get(message.id)
    if (!value) send(res, 404, null, 'Image unavailable', 'PROTOTYPE_HUB_REVIEW_IMAGE_UNAVAILABLE')
    else {
      res.statusCode = 200
      res.setHeader('Content-Type', value.info.contentType)
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(value.bytes)
    }
    return
  }
  const requestKey = String(input.clientRequestId || ''),
    text = typeof input.text === 'string' ? input.text.trim() : ''
  if (!/^[\x21-\x7e]{1,128}$/.test(requestKey)) {
    send(res, 400, null, 'Invalid request')
    return
  }
  const operation =
      suffix === '' ? 'create' : action === 'messages-with-image' ? 'messages' : action,
    key = JSON.stringify([
      guest ? owner(guest.identity) : 'member:admin',
      guest?.share.id || versionId,
      rid,
      pageId,
      operation,
      id || '',
      requestKey,
    ])
  const body =
      JSON.stringify(input) + (image ? createHash('sha256').update(image.bytes).digest('hex') : ''),
    existing = receipts.get(key)
  if (existing) {
    if (existing.body !== body) send(res, 409, null, 'Request changed', 'IDEMPOTENCY_CONFLICT')
    else
      send(
        res,
        200,
        existing.message
          ? [...messages.values()].flat().find((row) => row.id === existing.id)
          : threads.get(existing.id)?.thread,
      )
    return
  }
  if (action === 'status' && method === 'PUT' && stored) {
    if (!['open', 'resolved'].includes(String(input.state)) || (guest && input.state !== 'open'))
      send(res, 400, null, 'Invalid state')
    else if (stored.thread.configVersion !== input.expectedVersion)
      send(res, 409, null, 'Feedback changed', 'PROTOTYPE_HUB_REVIEW_THREAD_CONFLICT')
    else {
      if (stored.thread.state !== input.state) {
        stored.thread.state = input.state as ReviewThread['state']
        stored.thread.configVersion++
        stored.thread.updatedAt = Date.now()
      }
      receipts.set(key, { body, id: stored.thread.id, message: false })
      send(res, 200, stored.thread)
    }
    return
  }
  if (
    method !== 'POST' ||
    !text ||
    text.length > 4000 ||
    (!guest && suffix === '') ||
    (suffix !== '' && action !== 'messages' && action !== 'messages-with-image') ||
    (action === 'messages-with-image' && !image)
  ) {
    send(res, 400, null, 'Invalid feedback')
    return
  }
  if (!guest && input.visibility !== 'public' && input.visibility !== 'internal') {
    send(res, 400, null, 'Invalid visibility')
    return
  }
  const now = Date.now(),
    initial = suffix === ''
  const thread = initial
    ? {
        id: randomBytes(32).toString('base64url'),
        revisionId: rid,
        pageId,
        pageName: matches[0]!.name,
        pagePath: matches[0]!.path!,
        summary: text.slice(0, 200),
        authorName: guest!.identity.displayName,
        authorCompany: guest!.identity.company,
        verificationLevel: guest!.identity.verificationLevel,
        state: 'open' as const,
        configVersion: 0,
        createdAt: now,
        updatedAt: now,
      }
    : stored!.thread
  if (initial) {
    threads.set(thread.id, {
      thread,
      versionId,
      shareId: guest!.share.id,
      owner: owner(guest!.identity),
    })
    messages.set(thread.id, [])
  }
  const message: ReviewMessage = {
    id: randomUUID(),
    threadId: thread.id,
    text,
    authorType: guest ? 'guest' : 'member',
    authorName: guest?.identity.displayName || 'Administrator',
    authorCompany: guest?.identity.company || null,
    verificationLevel: guest?.identity.verificationLevel || null,
    visibility: guest ? 'public' : (input.visibility as ReviewMessage['visibility']),
    createdAt: now,
    image: image?.info || null,
  }
  if (image) images.set(message.id, image)
  messages.get(thread.id)!.push(message)
  if (!initial && message.visibility === 'public') {
    thread.updatedAt = now
    if (guest && thread.state === 'resolved') {
      thread.state = 'open'
      thread.configVersion++
    }
  }
  receipts.set(key, { body, id: initial ? thread.id : message.id, message: !initial })
  send(res, 200, initial ? thread : message)
}
