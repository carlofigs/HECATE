/**
 * live.ts — the open workspace's live socket (ADR 0003, P6).
 *
 * The Worker's Durable Object tells every open tab `{ version, pending, unread }`
 * whenever one of them changes: a change from another tab, from Claude, or a
 * push from another writer. The socket carries no workspace data; the store
 * refetches the snapshot when the version moves. If the socket is down, the
 * Shell's slower poll still catches up.
 *
 * - Keep-alive: `ping` every 25 s, answered `pong` by the runtime without
 *   waking the Durable Object. No answer within 10 s means a dead connection.
 * - Reconnect after 1, 2, 5, 10, then every 30 s; a socket that opens resets it.
 * - Code 4401 means the session expired: stop, and let the next request find
 *   the tab signed out.
 */

export interface LiveChange {
  version: number
  /** Batches applied but not yet committed to git. */
  pending: number
  /** Activity entries new to the app's reader. */
  unread: number
}

export type LiveState = 'connecting' | 'open' | 'closed' | 'ended'

export interface LiveHandlers {
  onChange: (change: LiveChange) => void
  onState: (state: LiveState) => void
}

/** The part of the browser's WebSocket this uses, so tests can pass a fake. */
export interface SocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: { data?: unknown; code?: number }) => void): void
}

export interface LiveOptions {
  openSocket?: (url: string) => SocketLike
  /** Where the app runs; the socket is on the same origin. */
  origin?: string
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

export const PING_MS = 25_000
export const PONG_WAIT_MS = 10_000
const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const
/** The Worker closes a socket with this when its session has expired. */
export const SESSION_EXPIRED = 4401

export function liveUrl(origin: string, dir: string): string {
  return `${origin.replace(/^http/, 'ws')}/api/workspaces/${encodeURIComponent(dir)}/live`
}

export function parseChange(data: unknown): LiveChange | null {
  if (typeof data !== 'string' || data === 'pong') return null
  try {
    const value = JSON.parse(data) as Partial<Record<keyof LiveChange, unknown>> | null
    const { version, pending, unread } = value ?? {}
    if (typeof version !== 'number' || typeof pending !== 'number' || typeof unread !== 'number') return null
    return { version, pending, unread }
  } catch {
    return null
  }
}

/** Keeps a live socket open to `dir` until the returned function is called. */
export function connectLive(dir: string, handlers: LiveHandlers, options: LiveOptions = {}): () => void {
  const openSocket = options.openSocket ?? ((url: string): SocketLike => new WebSocket(url))
  const origin = options.origin ?? window.location.origin
  const setTimer = options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer = options.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>))

  let socket: SocketLike | null = null
  let attempt = 0
  let stopped = false
  let ping: unknown = null
  let pongDue: unknown = null
  let retry: unknown = null

  const clearAll = (): void => {
    for (const timer of [ping, pongDue, retry]) if (timer !== null) clearTimer(timer)
    ping = pongDue = retry = null
  }

  const keepAlive = (current: SocketLike): void => {
    ping = setTimer(() => {
      if (socket !== current) return
      try {
        current.send('ping')
      } catch {
        return drop(current)
      }
      pongDue = setTimer(() => drop(current), PONG_WAIT_MS)
    }, PING_MS)
  }

  /** The connection is gone or silent: close it and try again later. */
  const drop = (current: SocketLike): void => {
    if (socket !== current) return
    socket = null
    clearAll()
    try {
      current.close()
    } catch {
      // Already closed.
    }
    if (stopped) return
    handlers.onState('closed')
    const wait = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)] as number
    attempt++
    retry = setTimer(() => {
      retry = null
      open()
    }, wait)
  }

  const open = (): void => {
    if (stopped) return
    handlers.onState('connecting')
    let current: SocketLike
    try {
      current = openSocket(liveUrl(origin, dir))
    } catch {
      attempt++
      retry = setTimer(open, RECONNECT_MS[Math.min(attempt - 1, RECONNECT_MS.length - 1)] as number)
      return
    }
    socket = current
    current.addEventListener('open', () => {
      if (socket !== current) return
      attempt = 0
      handlers.onState('open')
      keepAlive(current)
    })
    current.addEventListener('message', event => {
      if (socket !== current) return
      if (event.data === 'pong') {
        if (pongDue !== null) clearTimer(pongDue)
        pongDue = null
        keepAlive(current)
        return
      }
      const change = parseChange(event.data)
      if (change) handlers.onChange(change)
    })
    current.addEventListener('close', event => {
      if (socket !== current) return
      if (event.code === SESSION_EXPIRED) {
        socket = null
        clearAll()
        handlers.onState('ended')
        return
      }
      drop(current)
    })
    // An error is always followed by a close.
    current.addEventListener('error', () => {})
  }

  open()
  return () => {
    stopped = true
    const current = socket
    socket = null
    clearAll()
    try {
      current?.close(1000, 'Closed by the app')
    } catch {
      // Already closed.
    }
  }
}
