/**
 * workspace-do.ts — the Durable Object that is the only writer of a workspace
 * (ADR 0002). One instance per workspace directory, addressed by name.
 *
 * Everything that matters is in WorkspaceEngine; this class only connects it
 * to the runtime: SQLite-backed storage, the alarm, and the GitHub store. The
 * Worker calls it over RPC; the JSON routes in fetch() serve tests and tools.
 */

import { DurableObject } from 'cloudflare:workers'
import { WorkspaceEngine, type ApplyRequest, type ApplyOutcome, type FlushOutcome, type RefreshOutcome, type Snapshot } from './engine.ts'
import { storeFor, type Env } from './env.ts'
import type { Persistence } from './persistence.ts'

const MAX_KEYS_PER_PUT = 128

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

  override async alarm(): Promise<void> {
    await (await this.engineFor(null))?.onAlarm()
  }

  /** `POST /<verb>` with `{ dir, ...request }`. */
  override async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = await request.json<{ dir?: unknown } & ApplyRequest>()
    if (typeof body.dir !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(body.dir)) return Response.json({ error: 'dir is required' }, { status: 400 })
    const { dir, ...rest } = body
    switch (new URL(request.url).pathname) {
      case '/apply': return Response.json(await this.apply(dir, rest))
      case '/snapshot': return Response.json(await this.snapshot(dir))
      case '/flush': return Response.json(await this.flush(dir))
      case '/refresh': return Response.json(await this.refresh(dir))
      default: return new Response('Not found', { status: 404 })
    }
  }
}
