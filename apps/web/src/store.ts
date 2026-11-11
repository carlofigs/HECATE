/**
 * The app's state: who is signed in, the workspaces, and the open workspace.
 *
 * Reads: one snapshot of the workspace from the Worker. Pages compute every
 * view from it with @hecate/core's selectors, as the MCP tools do.
 *
 * Writes: ops only (ADR 0004). A change is applied locally at once, with the
 * same engine the Worker runs, and queued. The queue goes to the Worker one
 * batch at a time, each with its own opId, so a retry is never applied twice.
 * Each batch is prepared once, before it is queued, so the ids it creates are the same everywhere it is applied.
 * The page shows the server's state with the unsent batches on top.
 *
 * - Applied, and nothing else landed in between (version + 1): the local
 *   result stands.
 * - Applied after someone else's change: refetch.
 * - Refused: drop the batch, refetch, and say why.
 * - Offline or failing: keep it and retry with backoff.
 *
 * The device copy (offline.ts, ADR 0009): each batch is kept on the device
 * from the moment it is queued until the Worker answers, and each snapshot
 * the Worker sends is kept too, so a reload offline shows the workspace with
 * its unsent changes and sends them when the connection is back.
 *
 * Live: the Worker tells an open tab `{ version, pending, unread }` on every
 * change (live.ts). A newer version means refetch; the same version updates
 * the counts in place. A newer version heard while a batch is in flight is
 * remembered, and fetched once the batch's answer is in.
 */
import { applyBatch, BatchInputError, prepareBatch, ulid, type WorkspaceState } from '@hecate/core'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Api, ApplyAnswer, Failure, Me, Snapshot, WorkspaceList } from './api.ts'
import type { LiveChange, LiveState } from './live.ts'
import { noDeviceCopy, type OfflineStore } from './offline.ts'

/** What the store needs from the Worker: the snapshot and the write path. Pages call the rest of the API themselves. */
export type StoreServer = Pick<Api, 'me' | 'workspaces' | 'snapshot' | 'signOut' | 'applyOps'>
import { rememberWorkspace } from './workspace.ts'

type Session =
  | { status: 'checking' }
  | { status: 'signed-out' }
  /** `offline`: started from the device copy because the Worker could not be reached; confirmed on reconnect. */
  | { status: 'signed-in'; me: Me; offline?: boolean }
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
  /** The live socket (live.ts): while it is open, changes made elsewhere arrive within a second or two. */
  live: 'off' | LiveState
  /** The snapshot is the device copy, not yet confirmed by the Worker: its next answer is taken whatever its version. */
  fromDevice: boolean
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
  /** Refresh unless a check or a send is running, or the snapshot is younger than `minAgeMs` and its last check worked. */
  refreshIfStale: (minAgeMs: number) => Promise<void>
  /** Applies ops to the open workspace now and queues them for the Worker. Refused at once if they cannot apply. */
  apply: (ops: unknown[], label: string) => LocalResult
  /** Sends waiting changes now instead of after the backoff: the connection is back. */
  retryNow: () => void
  /** The live socket for `dir` heard a change. */
  onLive: (dir: string, change: LiveChange) => void
  /** The live socket for `dir` connected, dropped, or ended with the session. */
  setLive: (dir: string, state: LiveState) => void
  /** Signs out and clears HECATE from this device, unsent changes included (the page asks first). */
  signOut: () => Promise<void>
  /** Whether unsent changes would survive closing this tab: false without a working device copy. */
  keepsChanges: () => boolean
}

export type AppStore = StoreApi<AppState>

export interface StoreOptions {
  now?: () => number
  notify?: (notice: Notice) => void
  /** Waits before a retry; tests replace it. */
  sleep?: (ms: number) => Promise<void>
  /** The copy kept on this device; by default nothing is kept. */
  offline?: OfflineStore
  /** Set when a sign-out could not reach the Worker, so the next start finishes it. */
  signOutPending?: { get(): boolean; set(pending: boolean): void }
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

export function createAppStore(api: StoreServer, options: StoreOptions = {}): AppStore {
  const now = options.now ?? Date.now
  const notify = options.notify ?? (() => {})
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const offline = options.offline ?? noDeviceCopy()
  let pendingFlag = false
  const signOutPending = options.signOutPending ?? { get: () => pendingFlag, set: (on: boolean) => void (pendingFlag = on) }

  return createStore<AppState>()((set, get) => {
    /** The session is over: forget who you are and every snapshot, but keep unsent batches for the next sign-in. */
    const signedOut = (): void => {
      void offline.forget()
      set({ session: { status: 'signed-out' }, open: null })
    }
    const keep = (dir: string, snapshot: Snapshot): void => void offline.saveSnapshot(dir, snapshot)
    /** Updates the open workspace if it is still `dir`. */
    const update = (dir: string, patch: (open: OpenWorkspace) => Partial<OpenWorkspace>): void => {
      const open = get().open
      if (open?.dir === dir) set({ open: { ...open, ...patch(open) } })
    }

    let attempt = 0
    /** The newest version the live socket has announced for the open workspace. */
    let heard = 0
    /**
     * The newest change the live socket announced. Its counts (pending, unread) are not versioned: a read or a commit
     * leaves the version alone, so a snapshot of the same version taken before the change would undo them. For its
     * version, the socket's counts win; any later change sends another message.
     */
    let lastLive: LiveChange | null = null
    /** Refreshes started, so only the newest decides whether to fetch again. */
    let refreshes = 0
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
          // The snapshot that includes it is kept before the batch is let go, so the device copy never lacks it.
          void offline.saveSnapshot(dir, snapshot).then(() => offline.removeBatch(batch.opId))
          // Another change was announced while this one was on its way: fetch it now.
          if (heard > answer.version) await get().refresh()
        } else {
          // Someone else's change landed first, or this was a retry the Worker had already applied: take its state.
          update(dir, () => ({ queue: rest, sending: false, sendFailure: null }))
          await get().refresh()
          // If that refresh failed, the batch stays on the device; sent again after a reload, it is a harmless duplicate.
          if (get().open?.status === 'ready') void offline.removeBatch(batch.opId)
        }
        return send(dir)
      }

      if (answer.kind === 'rejected') {
        attempt = 0
        notify({ tone: 'danger', title: `Couldn't ${batch.label.charAt(0).toLowerCase()}${batch.label.slice(1)}`, description: `${answer.message}. Nothing was changed.` })
        void offline.removeBatch(batch.opId)
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
        // A sign-out that could not reach the Worker is finished first.
        if (signOutPending.get()) {
          const out = await api.signOut()
          if (out.kind === 'ok' || out.kind === 'signed-out') signOutPending.set(false)
          return signedOut()
        }
        const me = await api.me()
        if (me.kind === 'signed-out') return signedOut()
        if (me.kind !== 'ok') {
          // The Worker cannot be reached: start from the device copy if there is one.
          const copy = await offline.loadSession()
          if (copy) return set({ session: { status: 'signed-in', me: copy.me, offline: true }, workspaces: { status: 'ready', list: copy.workspaces } })
          return set({ session: { status: 'error', failure: me } })
        }
        set({ session: { status: 'signed-in', me: me.data } })
        const list = await api.workspaces()
        if (list.kind === 'signed-out') return signedOut()
        if (list.kind === 'ok') void offline.saveSession(me.data, list.data)
        set({ workspaces: list.kind === 'ok' ? { status: 'ready', list: list.data } : { status: 'error', failure: list } })
      },

      async openWorkspace(dir) {
        const current = get().open
        if (current?.dir === dir && current.snapshot) return get().refresh()
        attempt = 0
        heard = 0
        lastLive = null
        set({ open: { dir, snapshot: null, view: null, fetchedAt: null, status: 'loading', failure: null, queue: [], sending: false, sendFailure: null, live: 'off', fromDevice: false } })
        // The device copy first, so the page shows at once, offline too; then the Worker's answer.
        const copy = await offline.loadWorkspace(dir)
        if (get().open?.dir !== dir) return
        if (copy.snapshot || copy.batches.length > 0) {
          const queue: PendingBatch[] = copy.batches.map(b => ({ opId: b.opId, ops: b.ops, at: b.at, label: b.label }))
          const snapshot = copy.snapshot
          update(dir, o => ({
            queue: [...queue, ...o.queue.filter(b => !queue.some(q => q.opId === b.opId))],
            ...(snapshot ? { snapshot, view: fold(snapshot.state, queue), fetchedAt: copy.savedAt, status: 'refreshing' as const, fromDevice: true } : {}),
          }))
        }
        await get().refresh()
      },

      async refresh() {
        const open = get().open
        // While a batch is in flight the Worker's answer is not known yet: the next refresh will see it.
        if (!open || open.sending) return
        set({ open: { ...open, status: open.snapshot ? 'refreshing' : 'loading' } })
        const heardBefore = heard
        const mine = ++refreshes
        const result = await api.snapshot(open.dir)
        const latest = get().open
        if (latest?.dir !== open.dir) return
        if (result.kind === 'signed-out') return signedOut()
        if (result.kind === 'ok') {
          rememberWorkspace(open.dir)
          // A refresh that set off before a change was confirmed can answer after it: never go back to an older version.
          // A device copy is the exception: the Worker's versions start again if its storage is ever reset.
          const held = get().open
          if (held?.snapshot && !held.fromDevice && result.data.version < held.snapshot.version) {
            update(open.dir, () => ({ fetchedAt: now(), status: 'ready', failure: null }))
            return
          }
          const live = lastLive
          const snapshot: Snapshot = live && live.version === result.data.version
            ? { ...result.data, pending: live.pending, activity: { unread: live.unread } }
            : result.data
          update(open.dir, o => ({ snapshot, view: fold(snapshot.state, o.queue), fetchedAt: now(), status: 'ready', failure: null, fromDevice: false }))
          keep(open.dir, snapshot)
          // A newer version announced while this refresh was on its way: fetch that one too (once per announcement, so
          // versions that start again after a storage reset can never loop).
          // A later refresh already covers it if one has started since.
          if (heard > heardBefore && heard > snapshot.version && mine === refreshes) return get().refresh()
          const queued = get().open
          if (queued && queued.queue.length > 0 && !queued.sending) void send(open.dir)
          return
        }
        update(open.dir, o => ({ status: o.snapshot ? 'stale' : 'error', failure: result }))
      },

      async refreshIfStale(minAgeMs) {
        const open = get().open
        if (!open || open.status === 'loading' || open.status === 'refreshing' || open.sending) return
        // A snapshot whose last check failed (offline, or the device copy) is never fresh enough.
        if (open.status !== 'stale' && open.fetchedAt !== null && now() - open.fetchedAt < minAgeMs) return
        await get().refresh()
      },

      apply(ops, label) {
        const open = get().open
        if (!open?.view) return { ok: false, message: 'The workspace has not loaded yet' }
        const opId = ulid()
        const at = new Date(now()).toISOString()
        // Prepared once, here: every id the batch needs (a new task, a plan item, an outcome) is fixed before it is
        // queued, so the local apply, the Worker and any re-apply all use the same ids. Prepared ops prepare to themselves.
        let prepared: unknown[]
        try {
          prepared = prepareBatch({ ops }, { opId, at, actor: 'app' }).ops
        } catch (error) {
          if (error instanceof BatchInputError) return { ok: false, message: error.message }
          throw error
        }
        const batch: PendingBatch = { opId, ops: prepared, at, label }
        const result = applyLocal(open.view, batch)
        if (!result.ok) return { ok: false, message: failureMessage(result) }
        update(open.dir, o => ({ queue: [...o.queue, batch], view: result.state }))
        void offline.addBatch({ dir: open.dir, ...batch })
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

      onLive(dir, change) {
        const open = get().open
        if (open?.dir !== dir) return
        heard = Math.max(heard, change.version)
        // One socket delivers in order, and a reconnect starts with the current state: the last message is the newest.
        lastLive = change
        const snapshot = open.snapshot
        if (!snapshot) return
        // Newer: fetch it (a refresh waits for a batch in flight; the batch's answer checks `heard`).
        if (change.version > snapshot.version) return void get().refresh()
        if (change.version < snapshot.version) return
        if (snapshot.pending === change.pending && snapshot.activity?.unread === change.unread) return
        update(dir, o => (o.snapshot ? { snapshot: { ...o.snapshot, pending: change.pending, activity: { unread: change.unread } } } : {}))
      },

      setLive(dir, state) {
        if (get().open?.dir !== dir) return
        update(dir, () => ({ live: state }))
        // The session expired: the next request finds the tab signed out.
        if (state === 'ended') void get().refresh()
      },

      async signOut() {
        await offline.clear()
        const out = await api.signOut()
        // Offline, the cookie cannot be cleared yet: the next start finishes the sign-out.
        if (out.kind !== 'ok' && out.kind !== 'signed-out') signOutPending.set(true)
        signedOut()
      },

      keepsChanges: () => offline.persistent(),
    }
  })
}
