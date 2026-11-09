/**
 * The app's state: who is signed in, the workspaces, and the open workspace.
 *
 * Reads: one snapshot of the workspace from the Worker. Pages compute every
 * view from it with @hecate/core's selectors, as the MCP tools do.
 *
 * Writes: ops only (ADR 0004). A change is applied locally at once, with the
 * same engine the Worker runs, and queued. The queue goes to the Worker one
 * batch at a time, each with its own opId, so a retry is never applied twice.
 * The page shows the server's state with the unsent batches on top.
 *
 * - Applied, and nothing else landed in between (version + 1): the local
 *   result stands.
 * - Applied after someone else's change: refetch.
 * - Refused: drop the batch, refetch, and say why.
 * - Offline or failing: keep it and retry with backoff.
 */
import { applyBatch, BatchInputError, prepareBatch, ulid, type WorkspaceState } from '@hecate/core'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Api, ApplyAnswer, Failure, Me, Snapshot, WorkspaceList } from './api.ts'
import { rememberWorkspace } from './workspace.ts'

type Session =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; me: Me }
  | { status: 'error'; failure: Failure }

type Workspaces = { status: 'loading' } | { status: 'ready'; list: WorkspaceList } | { status: 'error'; failure: Failure }

/** A batch of ops applied locally and waiting for the Worker. */
interface PendingBatch {
  opId: string
  ops: unknown[]
  /** When it was made: the local apply's clock. */
  at: string
  /** What it does, for messages: "Complete A12". */
  label: string
}

export interface OpenWorkspace {
  dir: string
  /** The last snapshot the Worker sent, plus the batches it has applied since. Kept when a refresh fails. Its `pending` (changes not yet committed to git) is as of the last fetch. */
  snapshot: Snapshot | null
  /** The snapshot with every pending batch applied on top: what the page shows. */
  view: WorkspaceState | null
  /** When `snapshot` was fetched (ms). */
  fetchedAt: number | null
  /** loading: no snapshot yet · ready · refreshing: a snapshot, checking again · stale: a snapshot, the last check failed · error: none could load. */
  status: 'loading' | 'ready' | 'refreshing' | 'stale' | 'error'
  failure: Failure | null
  /** Changes not yet accepted by the Worker, oldest first. */
  queue: PendingBatch[]
  /** A batch is on its way to the Worker. */
  sending: boolean
  /** The last attempt to send failed; the queue retries on its own. */
  sendFailure: Failure | null
}

/** A message for the person using the app; the page decides how to show it (a toast). */
export interface Notice {
  tone: 'success' | 'danger'
  title: string
  description?: string
}

export type LocalResult = { ok: true; keyMap: Record<string, string> } | { ok: false; message: string }

export interface AppState {
  session: Session
  workspaces: Workspaces
  open: OpenWorkspace | null
  /** Who is signed in, and which workspaces exist. */
  start: () => Promise<void>
  openWorkspace: (dir: string) => Promise<void>
  refresh: () => Promise<void>
  /** Refresh unless a check or a send is running, or the snapshot is younger than `minAgeMs`. */
  refreshIfStale: (minAgeMs: number) => Promise<void>
  /** Applies ops to the open workspace now and queues them for the Worker. Refused at once if they cannot apply. */
  apply: (ops: unknown[], label: string) => LocalResult
  /** Sends waiting changes now instead of after the backoff: the connection is back. */
  retryNow: () => void
  signOut: () => Promise<void>
}

export type AppStore = StoreApi<AppState>

export interface StoreOptions {
  now?: () => number
  notify?: (notice: Notice) => void
  /** Waits before a retry; tests replace it. */
  sleep?: (ms: number) => Promise<void>
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

/** One batch, applied with the engine the Worker runs. */
function applyLocal(state: WorkspaceState, batch: PendingBatch): ReturnType<typeof applyBatch> | { ok: false; message: string } {
  try {
    return applyBatch(state, prepareBatch({ ops: batch.ops }, { opId: batch.opId, at: batch.at, actor: 'app' }))
  } catch (error) {
    if (error instanceof BatchInputError) return { ok: false, message: error.message }
    throw error
  }
}

const failureMessage = (result: { ok: false; message: string } | { ok: false; errors: { message: string }[] }): string =>
  'message' in result ? result.message : result.errors.map(e => e.message).join('; ')

/** The snapshot with the pending batches on top. A batch that no longer applies is left out: the Worker will refuse it too, and say why. */
function fold(state: WorkspaceState, queue: readonly PendingBatch[]): WorkspaceState {
  return queue.reduce((current, batch) => {
    const result = applyLocal(current, batch)
    return result.ok ? result.state : current
  }, state)
}

export function createAppStore(api: Api, options: StoreOptions = {}): AppStore {
  const now = options.now ?? Date.now
  const notify = options.notify ?? (() => {})
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))

  return createStore<AppState>()((set, get) => {
    const signedOut = (): void => set({ session: { status: 'signed-out' }, open: null })
    /** Updates the open workspace if it is still `dir`. */
    const update = (dir: string, patch: (open: OpenWorkspace) => Partial<OpenWorkspace>): void => {
      const open = get().open
      if (open?.dir === dir) set({ open: { ...open, ...patch(open) } })
    }

    let attempt = 0
    /** Ends the current backoff early (retryNow). */
    let wake: (() => void) | null = null
    const pause = (ms: number): Promise<void> =>
      new Promise<void>(resolve => {
        wake = resolve
        void sleep(ms).then(resolve)
      })

    async function send(dir: string): Promise<void> {
      const open = get().open
      if (open?.dir !== dir || open.sending || !open.snapshot) return
      const batch = open.queue[0]
      if (!batch) return
      update(dir, () => ({ sending: true }))
      const answer: ApplyAnswer = await api.applyOps(dir, { ops: batch.ops, opId: batch.opId })
      const latest = get().open
      if (latest?.dir !== dir) return

      if (answer.kind === 'signed-out') return signedOut()

      if (answer.kind === 'applied') {
        attempt = 0
        const rest = latest.queue.slice(1)
        const base = latest.snapshot as Snapshot
        const local = !answer.duplicate && answer.version === base.version + 1 ? applyLocal(base.state, batch) : null
        if (local?.ok) {
          const snapshot: Snapshot = { ...base, state: local.state, version: answer.version }
          update(dir, () => ({ snapshot, queue: rest, view: fold(local.state, rest), sending: false, sendFailure: null }))
        } else {
          // Someone else's change landed first, or this was a retry the Worker had already applied: take its state.
          update(dir, () => ({ queue: rest, sending: false, sendFailure: null }))
          await get().refresh()
        }
        return send(dir)
      }

      if (answer.kind === 'rejected') {
        attempt = 0
        notify({ tone: 'danger', title: `Couldn't ${batch.label.charAt(0).toLowerCase()}${batch.label.slice(1)}`, description: `${answer.message}. Nothing was changed.` })
        update(dir, o => ({ queue: o.queue.slice(1), sending: false, sendFailure: null }))
        await get().refresh()
        return send(dir)
      }

      // Offline, or the Worker could not take it now: keep the batch and try again.
      const failure: Failure = answer.kind === 'network'
        ? { kind: 'network' }
        : answer.kind === 'unavailable' ? { kind: 'unavailable', message: answer.message } : { kind: 'unexpected', status: answer.status, message: answer.message }
      update(dir, () => ({ sending: false, sendFailure: failure }))
      const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] as number
      attempt++
      await pause(wait)
      wake = null
      return send(dir)
    }

    return {
      session: { status: 'checking' },
      workspaces: { status: 'loading' },
      open: null,

      async start() {
        const me = await api.me()
        if (me.kind === 'signed-out') return signedOut()
        if (me.kind !== 'ok') return set({ session: { status: 'error', failure: me } })
        set({ session: { status: 'signed-in', me: me.data } })
        const list = await api.workspaces()
        if (list.kind === 'signed-out') return signedOut()
        set({ workspaces: list.kind === 'ok' ? { status: 'ready', list: list.data } : { status: 'error', failure: list } })
      },

      async openWorkspace(dir) {
        const current = get().open
        if (current?.dir === dir && current.snapshot) return get().refresh()
        attempt = 0
        set({ open: { dir, snapshot: null, view: null, fetchedAt: null, status: 'loading', failure: null, queue: [], sending: false, sendFailure: null } })
        await get().refresh()
      },

      async refresh() {
        const open = get().open
        // While a batch is in flight the Worker's answer is not known yet: the next refresh will see it.
        if (!open || open.sending) return
        set({ open: { ...open, status: open.snapshot ? 'refreshing' : 'loading' } })
        const result = await api.snapshot(open.dir)
        const latest = get().open
        if (latest?.dir !== open.dir) return
        if (result.kind === 'signed-out') return signedOut()
        if (result.kind === 'ok') {
          rememberWorkspace(open.dir)
          // A refresh that set off before a change was confirmed can answer after it: never go back to an older version.
          const held = get().open?.snapshot
          if (held && result.data.version < held.version) {
            update(open.dir, () => ({ fetchedAt: now(), status: 'ready', failure: null }))
            return
          }
          update(open.dir, o => ({ snapshot: result.data, view: fold(result.data.state, o.queue), fetchedAt: now(), status: 'ready', failure: null }))
          if (latest.queue.length > 0 && !latest.sending) void send(open.dir)
          return
        }
        update(open.dir, o => ({ status: o.snapshot ? 'stale' : 'error', failure: result }))
      },

      async refreshIfStale(minAgeMs) {
        const open = get().open
        if (!open || open.status === 'loading' || open.status === 'refreshing' || open.sending) return
        if (open.fetchedAt !== null && now() - open.fetchedAt < minAgeMs) return
        await get().refresh()
      },

      apply(ops, label) {
        const open = get().open
        if (!open?.view) return { ok: false, message: 'The workspace has not loaded yet' }
        const withIds = ops.map(op => {
          const o = op as Record<string, unknown>
          return o.type === 'task.add' && o.id === undefined ? { ...o, id: ulid() } : op
        })
        const batch: PendingBatch = { opId: ulid(), ops: withIds, at: new Date(now()).toISOString(), label }
        const result = applyLocal(open.view, batch)
        if (!result.ok) return { ok: false, message: failureMessage(result) }
        update(open.dir, o => ({ queue: [...o.queue, batch], view: result.state }))
        void send(open.dir)
        return { ok: true, keyMap: result.keyMap }
      },

      retryNow() {
        attempt = 0
        const backoff = wake
        wake = null
        if (backoff) return backoff()
        const open = get().open
        if (open && open.queue.length > 0 && !open.sending) void send(open.dir)
      },

      async signOut() {
        await api.signOut()
        signedOut()
      },
    }
  })
}
