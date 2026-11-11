/**
 * offline.ts — the copy of HECATE kept on this device, so a reload works
 * offline and unsent changes survive it (ADR 0009, P6).
 *
 * IndexedDB, database `hecate`, three stores:
 * - `session`: who is signed in and the workspace list, so the app can start
 *   without the network;
 * - `snapshots`: each opened workspace as the Worker last sent it, without
 *   unsent changes;
 * - `batches`: each unsent batch, one record per opId, so two tabs never
 *   overwrite each other's queue. A batch restored and sent twice is safe: the
 *   Worker deduplicates by opId (ADR 0004).
 *
 * Never in the way: a call that fails answers as if nothing were stored, and
 * `persistent()` turns false so the app warns before an unload loses changes.
 * A copy older than a session (14 days) or saved by a build with other file
 * versions is not used. Sign-out clears everything; a signed-out answer from
 * the Worker clears all but the unsent batches, which go once you sign in.
 */
import { CURRENT_VERSION } from '@hecate/core'
import type { Me, Snapshot, WorkspaceList } from './api.ts'

export interface StoredBatch {
  dir: string
  opId: string
  ops: unknown[]
  at: string
  label: string
}

interface DeviceSession {
  me: Me
  workspaces: WorkspaceList
  savedAt: number
}

interface DeviceWorkspace {
  snapshot: Snapshot | null
  /** When the snapshot was saved (ms), or null without one. */
  savedAt: number | null
  /** Unsent batches, oldest first. */
  batches: StoredBatch[]
}

export interface OfflineStore {
  /** Whether the copy works on this device: false in a private window, with site data blocked, or after a failed write. */
  persistent(): boolean
  loadSession(): Promise<DeviceSession | null>
  saveSession(me: Me, workspaces: WorkspaceList): Promise<void>
  loadWorkspace(dir: string): Promise<DeviceWorkspace>
  saveSnapshot(dir: string, snapshot: Snapshot): Promise<void>
  addBatch(batch: StoredBatch): Promise<void>
  removeBatch(opId: string): Promise<void>
  /** Sign-out: everything on this device. */
  clear(): Promise<void>
  /** The session is over: who you are and every snapshot, but never an unsent batch. */
  forget(): Promise<void>
}

/** A copy older than a session is not used. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
/** The file versions this build reads; a snapshot saved under others is discarded. */
const CONTRACT = JSON.stringify(CURRENT_VERSION)

type StoreName = 'session' | 'snapshots' | 'batches'

/** The storage under the rules: IndexedDB in the app, a Map in tests. Values carry their own key (session: `key`, snapshots: `dir`, batches: `opId`). */
export interface Backend {
  get<T>(store: StoreName, key: string): Promise<T | undefined>
  put(store: StoreName, value: object): Promise<void>
  delete(store: StoreName, key: string): Promise<void>
  all<T>(store: StoreName): Promise<T[]>
  clear(stores: StoreName[]): Promise<void>
}

interface SessionRecord extends DeviceSession {
  key: 'me'
}

interface SnapshotRecord {
  dir: string
  snapshot: Snapshot
  savedAt: number
  contract: string
}

export function deviceStore(backend: Promise<Backend | null>, now: () => number = Date.now): OfflineStore {
  let working = true
  void backend.then(
    b => {
      if (!b) working = false
    },
    () => {
      working = false
    },
  )
  async function guard<T>(fallback: T, run: (b: Backend) => Promise<T>): Promise<T> {
    try {
      const b = await backend
      if (!b) return fallback
      return await run(b)
    } catch {
      working = false
      return fallback
    }
  }
  const stale = (savedAt: number): boolean => now() - savedAt > MAX_AGE_MS

  return {
    persistent: () => working,

    loadSession: () =>
      guard(null, async b => {
        const record = await b.get<SessionRecord>('session', 'me')
        if (!record) return null
        if (stale(record.savedAt)) {
          await b.delete('session', 'me')
          return null
        }
        return { me: record.me, workspaces: record.workspaces, savedAt: record.savedAt }
      }),

    saveSession: (me, workspaces) => guard(undefined, b => b.put('session', { key: 'me', me, workspaces, savedAt: now() } satisfies SessionRecord)),

    loadWorkspace: dir =>
      guard<DeviceWorkspace>({ snapshot: null, savedAt: null, batches: [] }, async b => {
        let record = (await b.get<SnapshotRecord>('snapshots', dir)) ?? null
        if (record && (record.contract !== CONTRACT || stale(record.savedAt))) {
          await b.delete('snapshots', dir)
          record = null
        }
        const batches = (await b.all<StoredBatch>('batches'))
          .filter(x => x.dir === dir)
          .sort((x, y) => (x.at === y.at ? x.opId.localeCompare(y.opId) : x.at.localeCompare(y.at)))
        return { snapshot: record?.snapshot ?? null, savedAt: record?.savedAt ?? null, batches }
      }),

    saveSnapshot: (dir, snapshot) => guard(undefined, b => b.put('snapshots', { dir, snapshot, savedAt: now(), contract: CONTRACT } satisfies SnapshotRecord)),

    addBatch: batch => guard(undefined, b => b.put('batches', { ...batch })),

    removeBatch: opId => guard(undefined, b => b.delete('batches', opId)),

    clear: () => guard(undefined, b => b.clear(['session', 'snapshots', 'batches'])),

    forget: () => guard(undefined, b => b.clear(['session', 'snapshots'])),
  }
}

/** A Map per store, for tests. */
export function memoryBackend(): Backend & { dump(): Record<StoreName, unknown[]> } {
  const stores: Record<StoreName, Map<string, object>> = { session: new Map(), snapshots: new Map(), batches: new Map() }
  const keyOf = (store: StoreName, value: object): string => String((value as Record<string, unknown>)[store === 'session' ? 'key' : store === 'snapshots' ? 'dir' : 'opId'])
  const copy = <T>(value: T): T => structuredClone(value)
  return {
    get: <T>(store: StoreName, key: string) => Promise.resolve(copy(stores[store].get(key)) as T | undefined),
    put: (store, value) => {
      stores[store].set(keyOf(store, value), copy(value))
      return Promise.resolve()
    },
    delete: (store, key) => {
      stores[store].delete(key)
      return Promise.resolve()
    },
    all: <T>(store: StoreName) => Promise.resolve([...stores[store].values()].map(v => copy(v)) as T[]),
    clear: names => {
      for (const name of names) stores[name].clear()
      return Promise.resolve()
    },
    dump: () => ({ session: [...stores.session.values()], snapshots: [...stores.snapshots.values()], batches: [...stores.batches.values()] }),
  }
}

const DB = 'hecate'

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })

const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })

/** IndexedDB, or null where the browser has none or refuses it. Writes resolve once committed, so a reload right after keeps them. */
export async function indexedDbBackend(): Promise<Backend | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => {
      open.result.createObjectStore('session', { keyPath: 'key' })
      open.result.createObjectStore('snapshots', { keyPath: 'dir' })
      open.result.createObjectStore('batches', { keyPath: 'opId' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error ?? new Error('IndexedDB is unavailable'))
    open.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })
  // Another tab's newer build may need to upgrade the database: let it.
  db.onversionchange = () => db.close()
  const write = (stores: StoreName[], run: (tx: IDBTransaction) => void): Promise<void> => {
    const tx = db.transaction(stores, 'readwrite')
    run(tx)
    return committed(tx)
  }
  return {
    get: <T>(store: StoreName, key: string) => done(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>,
    put: (store, value) => write([store], tx => tx.objectStore(store).put(value)),
    delete: (store, key) => write([store], tx => tx.objectStore(store).delete(key)),
    all: <T>(store: StoreName) => done(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>,
    clear: stores => write(stores, tx => {
      for (const store of stores) tx.objectStore(store).clear()
    }),
  }
}

/** Nothing kept: a store that remembers nothing, for tests that do not care. */
export const noDeviceCopy = (): OfflineStore => ({ ...deviceStore(Promise.resolve(null)), persistent: () => false })

const SIGN_OUT_KEY = 'hecate:sign-out'

/** A sign-out that could not reach the Worker (offline), finished at the next start. A flag, never a credential. */
export const signOutFlag = {
  get(): boolean {
    try {
      return localStorage.getItem(SIGN_OUT_KEY) === '1'
    } catch {
      return false
    }
  },
  set(pending: boolean): void {
    try {
      if (pending) localStorage.setItem(SIGN_OUT_KEY, '1')
      else localStorage.removeItem(SIGN_OUT_KEY)
    } catch {
      // Storage unavailable: the cookie lapses with the session instead.
    }
  },
}
