import { randomUUID, randomBytes, createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type {
  ReviewThread,
  ReviewMessage,
  ReviewIdentity,
  Share,
  PrototypePage,
  ReviewImage,
  ReviewAssignment,
  ReviewAssignee,
} from '../../src/modules/protohub-manager-ui/types'
// UI fixtures model paging, visibility and receipt-shaped retries, not SQL/authentication guarantees.
interface StoredThread {
  thread: ReviewThread
  shareId: string
  versionId: string
  owner: string
  assignment?: ReviewAssignment
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
  assignees: ReviewAssignee[] = [],
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
  const initial = suffix === '' || suffix === '/_with-image'
  const [, rawId, action, query] = suffix.split('/')
  const id = initial ? undefined : rawId
  const stored = id ? threads.get(decodeURIComponent(id)) : undefined
  if (!initial && (!stored || !allowed(stored))) {
    send(res, 404, null, 'Feedback unavailable', 'PROTOTYPE_HUB_REVIEW_THREAD_UNAVAILABLE')
    return
  }
  if (action === 'assignment') {
    if (guest) {
      send(res, 404, null, 'Assignment unavailable')
      return
    }
    const initial: ReviewAssignment = {
      threadId: id!,
      assignmentVersion: 0,
      updatedAt: null,
      assignee: null,
    }
    const current = () => {
      const value = stored!.assignment || initial
      return {
        ...value,
        assignee: value.assignee
          ? {
              ...value.assignee,
              available: assignees.some((row) => row.userId === value.assignee!.userId),
            }
          : null,
      }
    }
    if (query === '_detail' && method === 'POST') {
      send(res, 200, current())
      return
    }
    if (query === '_candidates' && method === 'POST') {
      const index = input.pageIndex ?? 0,
        size = input.pageSize ?? 20,
        keyword = input.keyword ?? ''
      if (
        !Number.isInteger(index) ||
        Number(index) < 0 ||
        Number(index) > 10000 ||
        !Number.isInteger(size) ||
        Number(size) < 1 ||
        Number(size) > 50 ||
        typeof keyword !== 'string' ||
        keyword.length > 100
      ) {
        send(res, 400, null, 'Invalid candidates query')
        return
      }
      const rows = assignees
        .filter((row) => row.name.toLowerCase().includes(keyword.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId))
      send(res, 200, pageRows(rows, { pageIndex: index, pageSize: size }))
      return
    }
    if (
      method !== 'PUT' ||
      query ||
      (input.assigneeId !== null &&
        (typeof input.assigneeId !== 'string' || !input.assigneeId.trim())) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      Number(input.expectedVersion) < 0 ||
      !/^[\x21-\x7e]{1,128}$/.test(String(input.clientRequestId || ''))
    ) {
      send(res, 400, null, 'Invalid assignment')
      return
    }
    const key = JSON.stringify(['assignment', versionId, rid, pageId, id, input.clientRequestId]),
      body = JSON.stringify(input),
      existing = receipts.get(key)
    if (existing) {
      send(res, existing.body === body ? 200 : 409, existing.body === body ? current() : null)
      return
    }
    const before = current(),
      target = assignees.find((row) => row.userId === input.assigneeId)
    if (before.assignmentVersion !== input.expectedVersion) {
      send(res, 409, null, 'Assignment changed', 'PROTOTYPE_HUB_REVIEW_ASSIGNMENT_CONFLICT')
      return
    }
    if (input.assigneeId !== null && !target) {
      send(res, 400, null, 'Assignee unavailable', 'PROTOTYPE_HUB_REVIEW_ASSIGNEE_INVALID')
      return
    }
    if ((before.assignee?.userId || null) !== input.assigneeId)
      stored!.assignment = {
        threadId: id!,
        assignmentVersion: before.assignmentVersion + 1,
        updatedAt: Date.now(),
        assignee: target ? { ...target, available: true } : null,
      }
    receipts.set(key, { body, id: id!, message: false })
    send(res, 200, current())
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
  const operation = initial ? 'create' : action === 'messages-with-image' ? 'messages' : action,
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
    (!guest && initial) ||
    (!initial && action !== 'messages' && action !== 'messages-with-image') ||
    ((suffix === '/_with-image' || action === 'messages-with-image') && !image)
  ) {
    send(res, 400, null, 'Invalid feedback')
    return
  }
  if (!guest && input.visibility !== 'public' && input.visibility !== 'internal') {
    send(res, 400, null, 'Invalid visibility')
    return
  }
  const now = Date.now()
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
