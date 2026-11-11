/**
 * workspace-do.ts — the Durable Object that is the only writer of a workspace
 * (ADR 0002). One instance per workspace directory, addressed by name.
 *
 * Everything that matters is in WorkspaceEngine; this class only connects it
 * to the runtime: SQLite-backed storage, the alarm, the GitHub store, and the
 * open tabs' live sockets. The Worker calls it over RPC; fetch() opens a live
 * socket (`GET /live`, only ever forwarded by /api after its checks) and
 * serves JSON routes for tests and tools.
 */

import { DurableObject } from 'cloudflare:workers'
import { WorkspaceEngine, type AckOutcome, type ApplyRequest, type ApplyOutcome, type FlushOutcome, type LiveChange, type ReadOutcome, type RefreshOutcome, type Snapshot } from './engine.ts'
import type { ReadQuery } from './queries.ts'
import { storeFor, type Env } from './env.ts'
import type { Persistence } from './persistence.ts'

const MAX_KEYS_PER_PUT = 128
/** Open tabs per workspace: plenty for one person, and a ceiling on a reconnect loop gone wrong. */
const MAX_SOCKETS = 16
/** Closes a socket whose session has expired; the tab's next request finds it signed out (ADR 0003). */
const SESSION_EXPIRED = 4401
const DIR = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

interface SocketAttachment {
  /** The session's expiry, in seconds. */
  exp: number
}

function storagePersistence(storage: DurableObjectStorage): Persistence {
  return {
    get: key => storage.get(key),
    async list<T>(prefix: string) {
      const entries = await storage.list<T>({ prefix })
      return new Map([...entries].map(([key, value]) => [key.slice(prefix.length), value]))
    },
    async write(puts, deletes = []) {
      // Issued together with no await in between, so the runtime commits them as one atomic write.
      const entries = Object.entries(puts)
      const writes: Promise<unknown>[] = []
      for (let i = 0; i < entries.length; i += MAX_KEYS_PER_PUT) writes.push(storage.put(Object.fromEntries(entries.slice(i, i + MAX_KEYS_PER_PUT))))
      for (let i = 0; i < deletes.length; i += MAX_KEYS_PER_PUT) writes.push(storage.delete(deletes.slice(i, i + MAX_KEYS_PER_PUT)))
      await Promise.all(writes)
    },
  }
}

export class WorkspaceDO extends DurableObject<Env> {
  private engine: { dir: string; engine: WorkspaceEngine } | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alives are answered without waking the object (the Hibernation API).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  private async engineFor(dir: string | null): Promise<WorkspaceEngine | null> {
    const stored = (await this.ctx.storage.get<{ dir: string }>('meta'))?.dir ?? null
    const name = dir ?? stored
    if (name === null) return null
    if (stored !== null && stored !== name) throw new Error(`This Durable Object holds "${stored}", not "${name}"`)
    if (this.engine?.dir === name) return this.engine.engine
    const blobs = new Map<string, string>()
    const engine = new WorkspaceEngine({
      dir: name,
      store: storeFor(this.env, blobs),
      blobs,
      persistence: storagePersistence(this.ctx.storage),
      alarm: { get: () => this.ctx.storage.getAlarm(), set: at => this.ctx.storage.setAlarm(at) },
      commitIntervalMs: Number(this.env.COMMIT_INTERVAL_MS ?? 30_000),
      notify: change => this.broadcast(change),
    })
    this.engine = { dir: name, engine }
    return engine
  }

  private async required(dir: string): Promise<WorkspaceEngine> {
    return (await this.engineFor(dir)) as WorkspaceEngine
  }

  async apply(dir: string, request: ApplyRequest): Promise<ApplyOutcome> {
    return (await this.required(dir)).apply(request)
  }

  async snapshot(dir: string): Promise<Snapshot> {
    return (await this.required(dir)).snapshot()
  }

  async flush(dir: string): Promise<FlushOutcome> {
    return (await this.required(dir)).flush()
  }

  async refresh(dir: string): Promise<RefreshOutcome> {
    return (await this.required(dir)).refresh()
  }

  async read(dir: string, query: ReadQuery): Promise<ReadOutcome> {
    return (await this.required(dir)).read(query)
  }

  async ackActivity(dir: string, cursor: string, upTo?: string): Promise<AckOutcome> {
    return (await this.required(dir)).ackActivity(cursor, upTo)
  }

  override async alarm(): Promise<void> {
    await (await this.engineFor(null))?.onAlarm()
  }

  /** Tells every open tab what changed; a socket whose session has expired is closed instead. */
  private broadcast(change: LiveChange): void {
    const message = JSON.stringify(change)
    const now = Date.now() / 1000
    for (const socket of this.ctx.getWebSockets()) {
      const exp = (socket.deserializeAttachment() as SocketAttachment | null)?.exp ?? 0
      try {
        if (exp <= now) socket.close(SESSION_EXPIRED, 'Session expired')
        else socket.send(message)
      } catch {
        // Already closing: the runtime drops it.
      }
    }
  }

  /** `GET /live?dir=…&exp=…` with `Upgrade: websocket`: a tab's live socket, told the current state at once. */
  private async openLive(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 })
    const dir = url.searchParams.get('dir') ?? ''
    const exp = Number(url.searchParams.get('exp'))
    if (!DIR.test(dir) || !Number.isFinite(exp)) return Response.json({ error: 'dir and exp are required' }, { status: 400 })
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return Response.json({ error: 'Too many open tabs on this workspace' }, { status: 429 })
    const engine = await this.required(dir)
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ exp } satisfies SocketAttachment)
    const change = await engine.live()
    if (change) server.send(JSON.stringify(change))
    return new Response(null, { status: 101, webSocket: client })
  }

  /** A tab sends only keep-alives, answered by the runtime; anything else is ignored. */
  override webSocketMessage(): void {}

  override webSocketClose(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason)
    } catch {
      // The runtime already answered the close.
    }
  }

  /** `GET /live` (above), or `POST /<verb>` with `{ dir, ...request }`. */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/live' && request.method === 'GET') return this.openLive(request, url)
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = await request.json<{ dir?: unknown } & ApplyRequest>()
    if (typeof body.dir !== 'string' || !DIR.test(body.dir)) return Response.json({ error: 'dir is required' }, { status: 400 })
    const { dir, ...rest } = body
    switch (url.pathname) {
      case '/apply': return Response.json(await this.apply(dir, rest))
      case '/snapshot': return Response.json(await this.snapshot(dir))
      case '/flush': return Response.json(await this.flush(dir))
      case '/refresh': return Response.json(await this.refresh(dir))
      default: return new Response('Not found', { status: 404 })
    }
  }
}
