import { CURRENT_VERSION } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from './api.ts'
import { deviceStore, MAX_AGE_MS, memoryBackend, noDeviceCopy, type Backend, type StoredBatch } from './offline.ts'

const me = { userId: 42, login: 'owner' }
const list = { workspaces: [{ dir: 'w', hidden: false, name: null, policy: 'open' as const }], default: null }
const snapshot = (version: number): Snapshot => ({ version, state: {} as Snapshot['state'], pending: 0, lastError: null })
const batch = (opId: string, at: string, dir = 'w'): StoredBatch => ({ dir, opId, ops: [{ type: 'task.complete', task: 'A1' }], at, label: 'Complete A1' })

function device() {
  let clock = 1_000_000
  const backend = memoryBackend()
  const store = deviceStore(Promise.resolve(backend), () => clock)
  return { store, backend, advance: (ms: number) => void (clock += ms) }
}

describe('the device copy', () => {
  it('keeps who is signed in, each workspace’s snapshot, and its unsent batches oldest first', async () => {
    const { store } = device()
    await store.saveSession(me, list)
    expect(await store.loadSession()).toMatchObject({ me, workspaces: list })

    await store.saveSnapshot('w', snapshot(3))
    await store.addBatch(batch('02', '2026-11-11T10:00:01.000Z'))
    await store.addBatch(batch('01', '2026-11-11T10:00:00.000Z'))
    await store.addBatch(batch('03', '2026-11-11T10:00:00.000Z', 'other'))
    const w = await store.loadWorkspace('w')
    expect(w.snapshot?.version).toBe(3)
    expect(w.batches.map(b => b.opId)).toEqual(['01', '02'])

    await store.removeBatch('01')
    expect((await store.loadWorkspace('w')).batches.map(b => b.opId)).toEqual(['02'])
    expect(store.persistent()).toBe(true)
  })

  it('does not use a copy older than a session, or one saved under other file versions', async () => {
    const { store, backend, advance } = device()
    await store.saveSession(me, list)
    await store.saveSnapshot('w', snapshot(3))
    await store.addBatch(batch('01', '2026-11-11T10:00:00.000Z'))
    advance(MAX_AGE_MS + 1)
    expect(await store.loadSession()).toBeNull()
    // A batch is never dropped for age: it is unsent work.
    expect(await store.loadWorkspace('w')).toMatchObject({ snapshot: null, savedAt: null, batches: [{ opId: '01' }] })
    expect(backend.dump().snapshots).toEqual([])

    await backend.put('snapshots', { dir: 'w', snapshot: snapshot(4), savedAt: 1_000_000 + MAX_AGE_MS, contract: JSON.stringify({ ...CURRENT_VERSION, tasks: 999 }) })
    expect((await store.loadWorkspace('w')).snapshot).toBeNull()
  })

  it('clears everything at sign-out, and all but unsent batches when the session is over', async () => {
    const { store, backend } = device()
    await store.saveSession(me, list)
    await store.saveSnapshot('w', snapshot(3))
    await store.addBatch(batch('01', '2026-11-11T10:00:00.000Z'))
    await store.forget()
    expect(backend.dump()).toMatchObject({ session: [], snapshots: [], batches: [{ opId: '01' }] })
    await store.clear()
    expect(backend.dump()).toEqual({ session: [], snapshots: [], batches: [] })
  })

  it('answers as if nothing were kept when storage is missing or fails, and says the copy is not working', async () => {
    const none = noDeviceCopy()
    await none.saveSession(me, list)
    expect(await none.loadSession()).toBeNull()
    expect(await none.loadWorkspace('w')).toEqual({ snapshot: null, savedAt: null, batches: [] })
    await Promise.resolve()
    expect(none.persistent()).toBe(false)

    const broken: Backend = { ...memoryBackend(), put: () => Promise.reject(new Error('QuotaExceededError')) }
    const failing = deviceStore(Promise.resolve(broken))
    expect(failing.persistent()).toBe(true)
    await failing.addBatch(batch('01', '2026-11-11T10:00:00.000Z'))
    expect(failing.persistent()).toBe(false)

    const refused = deviceStore(Promise.reject(new Error('blocked')))
    expect(await refused.loadSession()).toBeNull()
    expect(refused.persistent()).toBe(false)
  })
})
