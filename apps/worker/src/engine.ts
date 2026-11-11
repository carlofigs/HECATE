/**
 * engine.ts — one workspace, held in memory, written to git (ADR 0002).
 *
 * The WorkspaceDO is a thin shell around this engine, which runs anywhere:
 * the Durable Object gives it storage and an alarm, and tests give it a Map,
 * a fake clock and a fake GitHub.
 *
 * - **Authoritative state.** The workspace's files and parsed state live in
 *   persistence, with a monotonic `version`. Reads and writes see the same
 *   state immediately (read-your-writes for the app and for Claude).
 * - **Writes are batches of ops.** A batch is prepared, applied and validated by
 *   @hecate/core. It is deduplicated by opId, refused on a stale `ifVersion`,
 *   and previewed on `dryRun` without changing anything.
 * - **Commits are coalesced.** The first pending change sets an alarm one
 *   interval out. Everything applied before it fires goes into a single commit,
 *   so 20 ops in a minute make at most two commits. `flush()` commits now.
 * - **Never overwrite another writer.** If the branch moved, the engine reads
 *   the new head:
 *   - if none of its pending paths changed upstream, and the merge still loads
 *     and checks clean, it rebuilds the commit on the new head;
 *   - otherwise it replays its pending batches on the upstream state (keys may
 *     be renumbered; a batch that no longer applies is dropped and reported).
 *   It retries up to three times, then defers. A head that does not load and
 *   check clean is never adopted: pending changes stay safe until someone
 *   fixes it.
 */

import {
  applyBatch, BatchInputError, changedFiles, checkWorkspace, isoWeekKey, prepareBatch, renderErrors, renderFocusWeek, renderPreview,
  serializeActivityEntry, stateFromFiles, todayIn, ulid, WorkspaceLoadError,
  type Actor, type ApplySuccess, type Batch, type IsoDate, type OpError, type Ulid, type Warning, type WorkspaceState,
} from '@hecate/core'
import { RateLimitError, type GitStore, type Head } from '@hecate/github-store'
import { commitMessage, type CommittedBatch } from './commit-message.ts'
import type { AlarmClock, Persistence } from './persistence.ts'
import { activityEntries, CURSOR_PATTERN, newFor, runQuery, unread, type Cursor, type ReadQuery } from './queries.ts'

// ─── Public types ───────────────────────────────────────────────────────────

export interface ApplyRequest {
  ops: unknown[]
  actor: Actor
  /** The same opId twice is the same change: the second call returns the first result. */
  opId?: string
  dryRun?: boolean
  /** Refuse unless the workspace is still at this version. */
  ifVersion?: number
}

export type ApplyOutcome =
  | { status: 'applied'; version: number; opId: string; keyMap: Record<string, string>; summary: string[]; warnings: Warning[]; preview: string; duplicate: boolean }
  | {
    status: 'dry-run'; version: number; keyMap: Record<string, string>; summary: string[]; warnings: Warning[]; preview: string; changed: string[]; deleted: string[]
    /** Each focus week the batch changes, rendered as it would be: what the focus skill proposes. */
    focus: { weekOf: string; markdown: string }[]
  }
  | { status: 'rejected'; version: number; errors: OpError[]; message: string }
  | { status: 'invalid'; version: number; message: string }
  | { status: 'version-conflict'; version: number; expected: number }
  | { status: 'unavailable'; message: string }

export interface ReplayReport {
  /** Batches whose new keys changed because upstream allocated the old ones. */
  renumbered: { opId: string; from: Record<string, string>; to: Record<string, string> }[]
  /** Batches that no longer applied to the upstream state. */
  dropped: { opId: string; actor: string; summary: string[]; errors: OpError[] }[]
}

export type FlushOutcome =
  | { status: 'clean'; version: number; head: string; replayed: ReplayReport | null }
  | { status: 'committed'; version: number; commit: string; batches: number; rebased: boolean; replayed: ReplayReport | null }
  | { status: 'deferred'; version: number; retryAt: number; message: string }
  | { status: 'unavailable'; message: string }

export type RefreshOutcome =
  | { status: 'unchanged' | 'updated' | 'deferred'; version: number; head: string }
  | { status: 'error'; version: number; message: string }
  | { status: 'unavailable'; message: string }

export type Snapshot =
  | {
    status: 'ok'
    version: number
    state: WorkspaceState
    head: string
    /** Batches applied but not yet committed. */
    pending: number
    lastError: { at: number; message: string } | null
    lastReplay: ReplayReport | null
    /** The web app's reader: how many activity entries are new to it (ADR 0002, cursors). */
    activity: { unread: number }
  }
  | { status: 'unavailable'; message: string }

export type ReadOutcome =
  | { status: 'ok'; version: number; text: string; data: Record<string, unknown> }
  | { status: 'not-found'; version: number; message: string }
  | { status: 'unavailable'; message: string }

export type AckOutcome =
  | { status: 'ok'; version: number; acknowledged: number; cursor: Cursor | null }
  | { status: 'not-found'; version: number; message: string }
  | { status: 'unavailable'; message: string }

export interface EngineDeps {
  /** The workspace directory in the data repository. */
  dir: string
  store: GitStore
  persistence: Persistence
  alarm: AlarmClock
  /** The store's blob cache; seeded from persisted files so a restart fetches only what changed. */
  blobs: Map<string, string>
  now?: () => number
  newId?: () => Ulid
  /** Minimum time between commits; also how long the first pending change waits. */
  commitIntervalMs?: number
  /** How old the last head check may be before a read checks again. */
  freshnessMs?: number
  sleep?: (ms: number) => Promise<void>
  /** Called whenever what an open tab shows may have changed: the Durable Object tells its sockets. */
  notify?: (change: LiveChange) => void
}

/** What a live socket is told (ADR 0003): enough to know whether to refetch, never the data itself. */
export interface LiveChange {
  version: number
  /** Batches applied but not yet committed to git. */
  pending: number
  /** Activity entries new to the app's reader. */
  unread: number
}

// ─── Persisted shapes ───────────────────────────────────────────────────────

interface Meta {
  dir: string
  version: number
  /** The commit the files were last in sync with. */
  base: Head
  /** Blob SHA of each file at `base`, relative to the workspace directory. */
  shas: Record<string, string>
  etag: string | null
  lastCommitAt: number
  lastCheckedAt: number
  retryAt: number
  lastError: { at: number; message: string } | null
  lastReplay: ReplayReport | null
  /** opIds remembered for deduplication, oldest first. */
  recentOps: string[]
}

interface PendingBatch extends CommittedBatch {
  batch: Batch
  keyMap: Record<string, string>
}

interface Pending {
  batches: PendingBatch[]
  /** Paths (relative) that differ from `base`. */
  dirty: string[]
}

interface OpRecord {
  version: number
  keyMap: Record<string, string>
  summary: string[]
  warnings: Warning[]
  preview: string
  /** Set when a replay could no longer apply the batch. */
  dropped?: OpError[]
}

interface Loaded {
  meta: Meta
  files: Map<string, string>
  state: WorkspaceState
  pending: Pending
}

const OP_HISTORY = 500
const MAX_ATTEMPTS = 3
const RETRY_MS = 60_000
const FILE = 'file:'
const OP = 'op:'
const CURSOR = 'cursor:'
/** The web app's activity reader; MCP's is `claude` (mcp/server.ts). */
export const APP_CURSOR = 'app'
const FOCUS_WEEK = /^focus\/(\d{4}-\d{2}-\d{2})\.json$/

const mergeReports = (a: ReplayReport | null, b: ReplayReport): ReplayReport =>
  a === null ? b : { renumbered: [...a.renumbered, ...b.renumbered], dropped: [...a.dropped, ...b.dropped] }

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** A state that loads and has no cross-file errors, or the reason it is not one. */
function loadClean(files: Record<string, string>): { state: WorkspaceState } | { problem: string } {
  try {
    const state = stateFromFiles(files)
    const errors = checkWorkspace(state).filter(i => i.severity === 'error')
    if (errors.length > 0) return { problem: errors.map(e => `${e.path}: ${e.message}`).join('; ') }
    return { state }
  } catch (error) {
    if (error instanceof WorkspaceLoadError) return { problem: error.problems.map(p => `${p.path}: ${p.message}`).join('; ') }
    return { problem: errorMessage(error) }
  }
}

export class WorkspaceEngine {
  private readonly dir: string
  private readonly store: GitStore
  private readonly persistence: Persistence
  private readonly alarm: AlarmClock
  private readonly blobs: Map<string, string>
  private readonly now: () => number
  private readonly newId: () => Ulid
  private readonly interval: number
  private readonly freshness: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly notify: ((change: LiveChange) => void) | null

  private loaded: Loaded | null = null
  private loading: Promise<void> | null = null
  private unavailable: { at: number; message: string } | null = null
  private flushing: Promise<FlushOutcome> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(deps: EngineDeps) {
    this.dir = deps.dir
    this.store = deps.store
    this.persistence = deps.persistence
    this.alarm = deps.alarm
    this.blobs = deps.blobs
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? ulid
    this.interval = deps.commitIntervalMs ?? 30_000
    this.freshness = deps.freshnessMs ?? 30_000
    this.sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.notify = deps.notify ?? null
  }

  // ─── Reading ──────────────────────────────────────────────────────────────

  async snapshot(): Promise<Snapshot> {
    const m = await this.ready()
    if (!m) return { status: 'unavailable', message: this.unavailable?.message ?? 'Unavailable' }
    if (this.now() - m.meta.lastCheckedAt > this.freshness) await this.refresh()
    return {
      status: 'ok', version: m.meta.version, state: m.state, head: m.meta.base.commit, pending: m.pending.batches.length,
      lastError: m.meta.lastError, lastReplay: m.meta.lastReplay,
      activity: { unread: await this.appUnread(m) },
    }
  }

  /** What a live socket is told when it opens, so a tab that reconnects catches up; null while unavailable. */
  async live(): Promise<LiveChange | null> {
    const m = await this.ready()
    return m ? this.changeOf(m) : null
  }

  /** A view of the workspace for a reader (MCP): markdown plus data. */
  async read(query: ReadQuery): Promise<ReadOutcome> {
    const m = await this.ready()
    if (!m) return { status: 'unavailable', message: this.unavailable?.message ?? 'Unavailable' }
    if (this.now() - m.meta.lastCheckedAt > this.freshness) await this.refresh()
    const cursorName = query.kind === 'briefing' || query.kind === 'activity' || query.kind === 'feed' ? query.cursor : null
    if (cursorName !== null && !CURSOR_PATTERN.test(cursorName)) return { status: 'not-found', version: m.meta.version, message: `"${cursorName}" is not a cursor name (a-z, 0-9, -)` }
    const cursor = cursorName === null ? null : ((await this.persistence.get<Cursor>(`${CURSOR}${cursorName}`)) ?? null)
    const result = runQuery(m.state, query, { now: this.now(), activity: () => activityEntries(m.files), cursor })
    return result.found
      ? { status: 'ok', version: m.meta.version, text: result.text, data: result.data }
      : { status: 'not-found', version: m.meta.version, message: result.message }
  }

  /** Move a reader's cursor forward to `upTo` (an entry id), or to the newest entry. */
  async ackActivity(cursorName: string, upTo?: string): Promise<AckOutcome> {
    const m = await this.ready()
    if (!m) return { status: 'unavailable', message: this.unavailable?.message ?? 'Unavailable' }
    const version = m.meta.version
    if (!CURSOR_PATTERN.test(cursorName)) return { status: 'not-found', version, message: `"${cursorName}" is not a cursor name (a-z, 0-9, -)` }
    return this.exclusive(async (): Promise<AckOutcome> => {
      const entries = activityEntries(m.files)
      const current = (await this.persistence.get<Cursor>(`${CURSOR}${cursorName}`)) ?? null
      const target = upTo === undefined ? entries.at(-1) : entries.find(e => e.id === upTo)
      if (upTo !== undefined && !target) return { status: 'not-found', version, message: `No activity entry ${upTo}` }
      if (!target) return { status: 'ok', version, acknowledged: 0, cursor: current }
      const position: Cursor = { at: target.at, id: target.id }
      const acknowledged = unread(entries, current).filter(e => !unread([e], position).length).length
      if (acknowledged === 0) return { status: 'ok', version, acknowledged: 0, cursor: current }
      await this.persistence.write({ [`${CURSOR}${cursorName}`]: position })
      if (cursorName === APP_CURSOR) await this.announce(m)
      return { status: 'ok', version, acknowledged, cursor: position }
    })
  }

  // ─── Writing ──────────────────────────────────────────────────────────────

  async apply(request: ApplyRequest): Promise<ApplyOutcome> {
    const m = await this.ready()
    if (!m) return { status: 'unavailable', message: this.unavailable?.message ?? 'Unavailable' }
    // A sprint close is its own commit, so `git revert` undoes exactly it (ADR 0002): what is pending is committed
    // first, and the close is committed at once rather than with whatever the alarm would gather.
    const closesSprint = !request.dryRun && request.ops.some(op => (op as { type?: unknown } | null)?.type === 'sprint.close')
    if (closesSprint) await this.flush()
    const outcome = await this.applyNow(m, request)
    if (closesSprint && outcome.status === 'applied' && !outcome.duplicate) await this.flush()
    return outcome
  }

  private applyNow(m: Loaded, request: ApplyRequest): Promise<ApplyOutcome> {
    return this.exclusive(async (): Promise<ApplyOutcome> => {
      const version = m.meta.version
      if (request.opId) {
        const prior = await this.persistence.get<OpRecord>(`${OP}${request.opId}`)
        if (prior?.dropped) return { status: 'rejected', version, errors: prior.dropped, message: 'This change was dropped: after a concurrent push it no longer applied.' }
        if (prior) {
          return { status: 'applied', version: prior.version, opId: request.opId, keyMap: prior.keyMap, summary: prior.summary, warnings: prior.warnings, preview: prior.preview, duplicate: true }
        }
      }
      if (request.ifVersion !== undefined && request.ifVersion !== version) return { status: 'version-conflict', version, expected: request.ifVersion }

      let batch: Batch
      try {
        batch = prepareBatch({ ops: request.ops }, {
          opId: request.opId ?? `op-${this.newId()}`, at: new Date(this.now()).toISOString(), actor: request.actor, newId: this.newId,
        })
      } catch (error) {
        if (error instanceof BatchInputError) return { status: 'invalid', version, message: error.message }
        throw error
      }

      const result = applyBatch(m.state, batch)
      if (!result.ok) return { status: 'rejected', version, errors: result.errors, message: renderErrors(result) }
      const summary = result.summary.map(s => s.text)
      if (request.dryRun) {
        const today = todayIn(result.state.workspace.timezone, new Date(this.now()))
        const focus = result.changed
          .flatMap(path => FOCUS_WEEK.exec(path)?.[1] ?? [])
          .filter(weekOf => weekOf in result.state.focusWeeks)
          .sort()
          .map(weekOf => ({ weekOf, markdown: renderFocusWeek(result.state, weekOf as IsoDate, { today }) }))
        return {
          status: 'dry-run', version, keyMap: result.keyMap, summary, warnings: result.warnings,
          preview: renderPreview(result, { dryRun: true }), changed: result.changed, deleted: result.deleted, focus,
        }
      }

      const writes = this.writeResult(m.files, result)
      m.state = result.state
      m.meta.version += 1
      m.pending.batches.push({ opId: batch.opId, actor: batch.actor, summary, batch, keyMap: result.keyMap })
      m.pending.dirty = [...new Set([...m.pending.dirty, ...Object.keys(writes)])].sort()
      const record: OpRecord = { version: m.meta.version, keyMap: result.keyMap, summary, warnings: result.warnings, preview: renderPreview(result, { dryRun: false }) }
      m.meta.recentOps.push(batch.opId)
      const forgotten = m.meta.recentOps.splice(0, Math.max(0, m.meta.recentOps.length - OP_HISTORY))
      const { puts, deletes } = this.fileWrites(writes)
      await this.persistence.write(
        { ...puts, meta: m.meta, pending: m.pending, [`${OP}${batch.opId}`]: record },
        [...deletes, ...forgotten.map(id => `${OP}${id}`)],
      )
      await this.scheduleCommit(m)
      await this.announce(m)
      return { status: 'applied', opId: batch.opId, duplicate: false, ...record }
    })
  }

  /** The Durable Object alarm: commit what is pending. */
  async onAlarm(): Promise<void> {
    await this.flush()
  }

  /** Commit everything pending now, as one commit. */
  flush(): Promise<FlushOutcome> {
    this.flushing ??= this.runFlush().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  /** Pick up changes pushed by someone else (the webhook calls this). */
  async refresh(): Promise<RefreshOutcome> {
    const m = await this.ready()
    if (!m) return { status: 'unavailable', message: this.unavailable?.message ?? 'Unavailable' }
    let head
    try {
      head = await this.store.readHead({ etag: m.meta.etag })
    } catch (error) {
      return { status: 'error', version: m.meta.version, message: errorMessage(error) }
    }
    m.meta.lastCheckedAt = this.now()
    if ('unchanged' in head || head.commit === m.meta.base.commit) {
      if (!('unchanged' in head)) m.meta.etag = head.etag
      await this.persistence.write({ meta: m.meta })
      return { status: 'unchanged', version: m.meta.version, head: m.meta.base.commit }
    }
    if (m.pending.dirty.length > 0) {
      // Our own changes are waiting: committing them reconciles with the new head.
      void this.flush()
      return { status: 'deferred', version: m.meta.version, head: m.meta.base.commit }
    }
    const upstream = await this.store.readFiles(head.tree, this.dir)
    return this.exclusive(async (): Promise<RefreshOutcome> => {
      if (m.pending.dirty.length > 0) {
        void this.flush()
        return { status: 'deferred', version: m.meta.version, head: m.meta.base.commit }
      }
      const loaded = loadClean(upstream.files)
      if ('problem' in loaded) {
        m.meta.lastError = { at: this.now(), message: `The branch head ${head.commit.slice(0, 7)} is not a valid workspace, so it was not adopted: ${loaded.problem}` }
        await this.persistence.write({ meta: m.meta })
        return { status: 'error', version: m.meta.version, message: m.meta.lastError.message }
      }
      await this.adoptUpstream(m, head, upstream.files, upstream.shas, loaded.state, { batches: [], dirty: [] })
      m.meta.etag = head.etag
      await this.persistence.write({ meta: m.meta })
      return { status: 'updated', version: m.meta.version, head: head.commit }
    })
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /** Run `task` alone: no other state change interleaves with it. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async ready(): Promise<Loaded | null> {
    if (this.unavailable && this.now() - this.unavailable.at < this.freshness) return null
    if (this.unavailable) {
      this.unavailable = null
      this.loading = null
    }
    this.loading ??= this.load().catch((error: unknown) => {
      this.loading = null
      throw error
    })
    await this.loading
    return this.loaded
  }

  private async load(): Promise<void> {
    const meta = await this.persistence.get<Meta>('meta')
    if (meta) {
      if (meta.dir !== this.dir) throw new Error(`This Durable Object holds "${meta.dir}", not "${this.dir}"`)
      const files = await this.persistence.list<string>(FILE)
      const pending = (await this.persistence.get<Pending>('pending')) ?? { batches: [], dirty: [] }
      const dirty = new Set(pending.dirty)
      for (const [path, sha] of Object.entries(meta.shas)) {
        const content = files.get(path)
        if (content !== undefined && !dirty.has(path)) this.blobs.set(sha, content)
      }
      this.loaded = { meta, files, pending, state: stateFromFiles(Object.fromEntries(files)) }
      return
    }

    const head = await this.store.readHead()
    if ('unchanged' in head) throw new Error('Unexpected 304 without an ETag')
    const { files, shas } = await this.store.readFiles(head.tree, this.dir)
    if (Object.keys(files).length === 0) {
      this.unavailable = { at: this.now(), message: `There is no workspace at ${this.dir}/ on the branch` }
      return
    }
    const loaded = loadClean(files)
    if ('problem' in loaded) {
      this.unavailable = { at: this.now(), message: `${this.dir}/ is not a valid v2 workspace: ${loaded.problem}` }
      return
    }
    const now = this.now()
    const fresh: Loaded = {
      meta: {
        dir: this.dir, version: 1, base: { commit: head.commit, tree: head.tree }, shas, etag: head.etag,
        lastCommitAt: 0, lastCheckedAt: now, retryAt: 0, lastError: null, lastReplay: null, recentOps: [],
      },
      files: new Map(Object.entries(files)),
      state: loaded.state,
      pending: { batches: [], dirty: [] },
    }
    await this.persistence.write({
      ...Object.fromEntries(Object.entries(files).map(([path, content]) => [`${FILE}${path}`, content])),
      meta: fresh.meta,
      pending: fresh.pending,
    })
    this.loaded = fresh
  }

  /** Apply a batch result to the file map: changed and deleted files, and activity appended to its weekly log. */
  private writeResult(files: Map<string, string>, result: ApplySuccess): Record<string, string | null> {
    const writes: Record<string, string | null> = { ...changedFiles(result.state, result.changed) }
    for (const path of result.deleted) writes[path] = null
    for (const entry of result.activity) {
      const path = `activity/${isoWeekKey(entry.date)}.jsonl`
      const current = writes[path] ?? files.get(path) ?? ''
      writes[path] = `${current}${current !== '' && !current.endsWith('\n') ? '\n' : ''}${serializeActivityEntry(entry)}`
    }
    for (const [path, content] of Object.entries(writes)) {
      if (content === null) files.delete(path)
      else files.set(path, content)
    }
    return writes
  }

  private fileWrites(writes: Record<string, string | null>): { puts: Record<string, string>; deletes: string[] } {
    const puts: Record<string, string> = {}
    const deletes: string[] = []
    for (const [path, content] of Object.entries(writes)) {
      if (content === null) deletes.push(`${FILE}${path}`)
      else puts[`${FILE}${path}`] = content
    }
    return { puts, deletes }
  }

  private async scheduleCommit(m: Loaded): Promise<void> {
    if (m.pending.dirty.length === 0) return
    const due = Math.max(this.now() + this.interval, m.meta.retryAt)
    const current = await this.alarm.get()
    if (current === null || current > due) await this.alarm.set(due)
  }

  private async runFlush(): Promise<FlushOutcome> {
    const m = await this.ready()
    if (!m) return { status: 'unavailable', message: this.unavailable?.message ?? 'Unavailable' }
    let rebased = false
    let replayed: ReplayReport | null = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const snap = await this.exclusive(() => Promise.resolve(this.pendingSnapshot(m)))
      if (!snap) return { status: 'clean', version: m.meta.version, head: m.meta.base.commit, replayed }

      let result
      try {
        const changes = Object.fromEntries(Object.entries(snap.changes).map(([path, content]) => [`${this.dir}/${path}`, content]))
        result = await this.store.commitChanges({ parent: m.meta.base, changes, message: snap.message })
      } catch (error) {
        return this.defer(m, error)
      }

      if (result.ok) {
        const committed = result
        await this.exclusive(async () => {
          m.meta.base = { commit: committed.commit, tree: committed.tree }
          for (const [path, sha] of Object.entries(committed.blobs)) {
            const rel = path.slice(this.dir.length + 1)
            if (sha === null) delete m.meta.shas[rel]
            else m.meta.shas[rel] = sha
          }
          m.pending.batches = m.pending.batches.slice(snap.count)
          m.pending.dirty = m.pending.dirty.filter(p => !(p in snap.changes) || (m.files.get(p) ?? null) !== snap.changes[p])
          m.meta.lastCommitAt = this.now()
          m.meta.retryAt = 0
          m.meta.lastError = null
          m.meta.etag = null
          await this.persistence.write({ meta: m.meta, pending: m.pending })
        })
        await this.scheduleCommit(m)
        await this.announce(m)
        return { status: 'committed', version: m.meta.version, commit: committed.commit, batches: snap.count, rebased, replayed }
      }

      // Someone else moved the branch.
      try {
        const report = await this.catchUp(m)
        rebased = true
        if (report) replayed = mergeReports(replayed, report)
      } catch (error) {
        return this.defer(m, error)
      }
      if (attempt < MAX_ATTEMPTS) await this.sleep(250 * attempt + Math.floor(Math.random() * 250))
    }
    return this.defer(m, new Error('The branch kept moving during three attempts to commit'))
  }

  private pendingSnapshot(m: Loaded): { count: number; changes: Record<string, string | null>; message: string } | null {
    if (m.pending.dirty.length === 0) return null
    const changes = Object.fromEntries(m.pending.dirty.map(p => [p, m.files.get(p) ?? null]))
    const message = m.pending.batches.length > 0 ? commitMessage(this.dir, m.pending.batches) : `${this.dir}: Sync`
    return { count: m.pending.batches.length, changes, message }
  }

  /**
   * After a rejected push: bring state up to the new head with pending changes
   * on top. Returns the replay report, or null when a plain rebuild sufficed.
   * Throws (so the flush defers) when the new head is not a valid workspace.
   */
  private async catchUp(m: Loaded): Promise<ReplayReport | null> {
    const head = await this.store.readHead()
    if ('unchanged' in head) throw new Error('Unexpected 304 without an ETag')
    const upstream = await this.store.readFiles(head.tree, this.dir)
    const diff = await this.store.diffTrees(m.meta.base.tree, head.tree, this.dir)

    return this.exclusive(async () => {
      const moved = new Set([...diff.added, ...diff.modified, ...diff.deleted])
      if (!m.pending.dirty.some(p => moved.has(p))) {
        const merged: Record<string, string> = { ...upstream.files }
        for (const path of m.pending.dirty) {
          const content = m.files.get(path)
          if (content === undefined) delete merged[path]
          else merged[path] = content
        }
        const loaded = loadClean(merged)
        if ('state' in loaded) {
          await this.adoptUpstream(m, head, merged, upstream.shas, loaded.state, m.pending)
          return null
        }
      }

      const base = loadClean(upstream.files)
      if ('problem' in base) {
        throw new Error(`The branch head ${head.commit.slice(0, 7)} is not a valid workspace; pending changes are kept until it is fixed: ${base.problem}`)
      }
      let state = base.state
      const files = new Map(Object.entries(upstream.files))
      const dirty = new Set<string>()
      const kept: PendingBatch[] = []
      const report: ReplayReport = { renumbered: [], dropped: [] }
      const records: Record<string, OpRecord> = {}
      for (const entry of m.pending.batches) {
        const r = applyBatch(state, entry.batch)
        if (!r.ok) {
          report.dropped.push({ opId: entry.opId, actor: entry.actor, summary: [...entry.summary], errors: r.errors })
          const prior = await this.persistence.get<OpRecord>(`${OP}${entry.opId}`)
          if (prior) records[`${OP}${entry.opId}`] = { ...prior, dropped: r.errors }
          continue
        }
        for (const path of Object.keys(this.writeResult(files, r))) dirty.add(path)
        state = r.state
        const sameKeys = JSON.stringify(entry.keyMap) === JSON.stringify(r.keyMap)
        if (!sameKeys) {
          report.renumbered.push({ opId: entry.opId, from: entry.keyMap, to: r.keyMap })
          const prior = await this.persistence.get<OpRecord>(`${OP}${entry.opId}`)
          if (prior) records[`${OP}${entry.opId}`] = { ...prior, keyMap: r.keyMap, summary: r.summary.map(s => s.text) }
        }
        kept.push({ ...entry, summary: r.summary.map(s => s.text), keyMap: r.keyMap })
      }
      m.meta.lastReplay = report.renumbered.length + report.dropped.length > 0 ? report : null
      await this.adoptUpstream(m, head, Object.fromEntries(files), upstream.shas, state, { batches: kept, dirty: [...dirty].sort() }, records)
      return report
    })
  }

  /** Replace the files and state with `files` on top of `head`, persisting everything at once. */
  private async adoptUpstream(
    m: Loaded,
    head: Head,
    files: Record<string, string>,
    shas: Record<string, string>,
    state: WorkspaceState,
    pending: Pending,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const before = new Set(m.files.keys())
    m.files = new Map(Object.entries(files))
    m.state = state
    m.pending = pending
    m.meta.base = { commit: head.commit, tree: head.tree }
    m.meta.shas = { ...shas }
    m.meta.version += 1
    const deletes = [...before].filter(p => !m.files.has(p)).map(p => `${FILE}${p}`)
    await this.persistence.write(
      { ...Object.fromEntries([...m.files].map(([p, c]) => [`${FILE}${p}`, c])), meta: m.meta, pending: m.pending, ...extra },
      deletes,
    )
    await this.announce(m)
  }

  private async appUnread(m: Loaded): Promise<number> {
    const cursor = (await this.persistence.get<Cursor>(`${CURSOR}${APP_CURSOR}`)) ?? null
    return newFor(APP_CURSOR, activityEntries(m.files), cursor).length
  }

  private async changeOf(m: Loaded): Promise<LiveChange> {
    return { version: m.meta.version, pending: m.pending.batches.length, unread: await this.appUnread(m) }
  }

  /** Tell open tabs something changed. Never fails a write: a socket that cannot be told refetches on its own. */
  private async announce(m: Loaded): Promise<void> {
    if (!this.notify) return
    try {
      this.notify(await this.changeOf(m))
    } catch {
      // A socket error is the socket's problem, not the write's.
    }
  }

  private async defer(m: Loaded, error: unknown): Promise<FlushOutcome> {
    const now = this.now()
    const retryAt = error instanceof RateLimitError && error.resetAt !== null ? Math.max(error.resetAt + 1000, now + 1000) : now + RETRY_MS
    const message = errorMessage(error)
    await this.exclusive(async () => {
      m.meta.lastError = { at: now, message }
      m.meta.retryAt = retryAt
      await this.persistence.write({ meta: m.meta })
    })
    await this.alarm.set(retryAt)
    return { status: 'deferred', version: m.meta.version, retryAt, message }
  }
}
