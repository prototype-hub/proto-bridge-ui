import { config } from '@/shared/config'
import { token } from '@/shared/auth/token'
export interface SubscriptionOptions {
  id: string
  topic: string
  parameter: Record<string, unknown>
  onData: (payload: unknown) => void
  onError: () => void
}
export function subscribe(options: SubscriptionOptions): () => void {
  const accessToken = token.get()
  if (!accessToken) {
    options.onError()
    return () => {}
  }
  const url = new URL(
    `${config.apiBase}/messaging/${encodeURIComponent(accessToken)}`,
    window.location.origin,
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set(config.tokenHeader, accessToken)
  let socket: WebSocket | undefined,
    heartbeat: ReturnType<typeof setInterval> | undefined,
    retry: ReturnType<typeof setTimeout> | undefined
  let disposed = false,
    attempts = 0
  function send(value: Record<string, unknown>) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value))
  }
  function connect() {
    if (disposed) return
    socket = new WebSocket(url)
    socket.onopen = () => {
      attempts = 0
      send({ id: options.id, topic: options.topic, parameter: options.parameter, type: 'sub' })
      heartbeat = setInterval(() => send({ type: 'ping' }), 2000)
    }
    socket.onmessage = (event) => {
      try {
        const value: unknown = JSON.parse(String(event.data))
        if (!value || typeof value !== 'object') return
        const message = value as Record<string, unknown>
        if (message.requestId !== options.id) return
        if (message.type === 'error') options.onError()
        else if ('payload' in message) options.onData(message.payload)
      } catch {
        options.onError()
      }
    }
    socket.onerror = () => options.onError()
    socket.onclose = () => {
      clearInterval(heartbeat)
      if (!disposed && attempts++ < 2) retry = setTimeout(connect, attempts * 2000)
    }
  }
  connect()
  return () => {
    disposed = true
    clearInterval(heartbeat)
    clearTimeout(retry)
    send({ id: options.id, type: 'unsub' })
    socket?.close()
  }
}
