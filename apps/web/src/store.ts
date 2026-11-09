/**
 * The app's state: who is signed in, the workspaces, and the open workspace's
 * snapshot. Views are never stored: pages compute them from the snapshot with
 * @hecate/core's selectors, as the MCP tools do.
 */
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Api, Failure, Me, Snapshot, WorkspaceList } from './api.ts'
import { rememberWorkspace } from './workspace.ts'

type Session =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; me: Me }
  | { status: 'error'; failure: Failure }

type Workspaces = { status: 'loading' } | { status: 'ready'; list: WorkspaceList } | { status: 'error'; failure: Failure }

export interface OpenWorkspace {
  dir: string
  /** The last snapshot that loaded; kept when a refresh fails. */
  snapshot: Snapshot | null
  /** When `snapshot` was fetched (ms). */
  fetchedAt: number | null
  /** loading: no snapshot yet · ready · refreshing: a snapshot, checking again · stale: a snapshot, the last check failed · error: none could load. */
  status: 'loading' | 'ready' | 'refreshing' | 'stale' | 'error'
  failure: Failure | null
}

export interface AppState {
  session: Session
  workspaces: Workspaces
  open: OpenWorkspace | null
  /** Who is signed in, and which workspaces exist. */
  start: () => Promise<void>
  openWorkspace: (dir: string) => Promise<void>
  refresh: () => Promise<void>
  /** Refresh unless a check is already running or the snapshot is younger than `minAgeMs`. */
  refreshIfStale: (minAgeMs: number) => Promise<void>
  signOut: () => Promise<void>
}

export type AppStore = StoreApi<AppState>

export function createAppStore(api: Api, now: () => number = Date.now): AppStore {
  return createStore<AppState>()((set, get) => {
    const signedOut = (): void => set({ session: { status: 'signed-out' }, open: null })

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
        set({ open: { dir, snapshot: null, fetchedAt: null, status: 'loading', failure: null } })
        await get().refresh()
      },

      async refresh() {
        const open = get().open
        if (!open) return
        set({ open: { ...open, status: open.snapshot ? 'refreshing' : 'loading' } })
        const result = await api.snapshot(open.dir)
        const latest = get().open
        if (latest?.dir !== open.dir) return
        if (result.kind === 'signed-out') return signedOut()
        if (result.kind === 'ok') {
          rememberWorkspace(open.dir)
          return set({ open: { dir: open.dir, snapshot: result.data, fetchedAt: now(), status: 'ready', failure: null } })
        }
        set({ open: { ...latest, status: latest.snapshot ? 'stale' : 'error', failure: result } })
      },

      async refreshIfStale(minAgeMs) {
        const open = get().open
        if (!open || open.status === 'loading' || open.status === 'refreshing') return
        if (open.fetchedAt !== null && now() - open.fetchedAt < minAgeMs) return
        await get().refresh()
      },

      async signOut() {
        await api.signOut()
        signedOut()
      },
    }
  })
}
