import { describe, expect, it } from 'vitest'
import { connectLive, liveUrl, parseChange, PING_MS, PONG_WAIT_MS, SESSION_EXPIRED, type LiveChange, type LiveState, type SocketLike } from './live.ts'

type Listener = (event: { data?: unknown; code?: number }) => void

class FakeSocket implements SocketLike {
  readonly sent: string[] = []
  closed: { code?: number } | null = null
  private readonly listeners = new Map<string, Listener[]>()
  readonly url: string
  constructor(url: string) {
    this.url = url
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number): void {
    this.closed = { code }
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, event: { data?: unknown; code?: number } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

/** Timers run by hand, in order of when they fall due. */
function clock() {
  let now = 0
  let next = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  return {
    setTimer: (run: () => void, ms: number): unknown => {
      const id = next++
      timers.set(id, { at: now + ms, run })
      return id
    },
    clearTimer: (id: unknown): void => void timers.delete(id as number),
    advance(ms: number): void {
      const until = now + ms
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = due[1].at
        due[1].run()
      }
      now = until
    },
    pending: (): number => timers.size,
  }
}

function connect() {
  const sockets: FakeSocket[] = []
  const changes: LiveChange[] = []
  const states: LiveState[] = []
  const time = clock()
  const close = connectLive('work', { onChange: c => void changes.push(c), onState: s => void states.push(s) }, {
    origin: 'https://hecate.test',
    openSocket: url => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
  })
  const latest = (): FakeSocket => sockets.at(-1) as FakeSocket
  return { sockets, changes, states, time, close, latest }
}

describe('the live socket', () => {
  it('opens on the app’s own origin and passes on each change it hears', () => {
    const live = connect()
    expect(live.latest().url).toBe('wss://hecate.test/api/workspaces/work/live')
    expect(liveUrl('http://localhost:8788', 'a b')).toBe('ws://localhost:8788/api/workspaces/a%20b/live')
    live.latest().emit('open')
    live.latest().emit('message', { data: '{"version":4,"pending":1,"unread":2}' })
    live.latest().emit('message', { data: 'not json' })
    live.latest().emit('message', { data: '{"version":"4"}' })
    expect(live.changes).toEqual([{ version: 4, pending: 1, unread: 2 }])
    expect(live.states).toEqual(['connecting', 'open'])
  })

  it('keeps the connection alive, and treats a missing pong as a dead one', () => {
    const live = connect()
    const first = live.latest()
    first.emit('open')
    live.time.advance(PING_MS)
    expect(first.sent).toEqual(['ping'])
    first.emit('message', { data: 'pong' })
    live.time.advance(PING_MS)
    expect(first.sent).toEqual(['ping', 'ping'])
    live.time.advance(PONG_WAIT_MS)
    expect(first.closed).not.toBeNull()
    expect(live.states.at(-1)).toBe('closed')
    live.time.advance(1_000)
    expect(live.sockets).toHaveLength(2)
  })

  it('reconnects after 1, 2, 5 s and so on, and starts again from 1 s once a socket opens', () => {
    const live = connect()
    live.latest().emit('close', { code: 1006 })
    live.time.advance(999)
    expect(live.sockets).toHaveLength(1)
    live.time.advance(1)
    expect(live.sockets).toHaveLength(2)
    live.latest().emit('close', { code: 1006 })
    live.time.advance(2_000)
    expect(live.sockets).toHaveLength(3)
    live.latest().emit('open')
    live.latest().emit('close', { code: 1006 })
    live.time.advance(1_000)
    expect(live.sockets).toHaveLength(4)
  })

  it('stops when the session has expired, and when the app closes it', () => {
    const ended = connect()
    ended.latest().emit('open')
    ended.latest().emit('close', { code: SESSION_EXPIRED })
    expect(ended.states.at(-1)).toBe('ended')
    ended.time.advance(60_000)
    expect(ended.sockets).toHaveLength(1)

    const closed = connect()
    closed.latest().emit('open')
    closed.close()
    expect(closed.latest().closed).toEqual({ code: 1000 })
    closed.latest().emit('close', { code: 1000 })
    closed.time.advance(60_000)
    expect(closed.sockets).toHaveLength(1)
    expect(closed.time.pending()).toBe(0)
  })

  it('reads only well-formed changes', () => {
    expect(parseChange('{"version":1,"pending":0,"unread":0}')).toEqual({ version: 1, pending: 0, unread: 0 })
    expect(parseChange('pong')).toBeNull()
    expect(parseChange('null')).toBeNull()
    expect(parseChange(42)).toBeNull()
  })
})
