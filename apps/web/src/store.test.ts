import { describe, expect, it } from 'vitest'
import type { Api, Outcome, Snapshot } from './api.ts'
import { createAppStore } from './store.ts'

const snapshot = (version: number): Snapshot => ({ version, state: {} as Snapshot['state'], pending: 0, lastError: null })

/** An API whose snapshot answers come from a queue. */
function fakeApi(answers: Outcome<Snapshot>[]): Api {
  return {
    me: () => Promise.resolve({ kind: 'ok', data: { userId: 42, login: 'owner' } }),
    workspaces: () => Promise.resolve({ kind: 'ok', data: { workspaces: [{ dir: 'a', hidden: false, name: null, policy: 'open' }], default: null } }),
    snapshot: () => Promise.resolve(answers.shift() ?? { kind: 'network' }),
    signOut: () => Promise.resolve({ kind: 'ok', data: null }),
  }
}

describe('the app store', () => {
  it('signs in and lists the workspaces', async () => {
    const store = createAppStore(fakeApi([]))
    await store.getState().start()
    expect(store.getState().session).toEqual({ status: 'signed-in', me: { userId: 42, login: 'owner' } })
    expect(store.getState().workspaces.status).toBe('ready')
  })

  it('loads a workspace, then keeps the last good snapshot when a refresh fails', async () => {
    let clock = 1000
    const store = createAppStore(fakeApi([{ kind: 'ok', data: snapshot(1) }, { kind: 'network' }, { kind: 'ok', data: snapshot(2) }]), () => clock)
    await store.getState().openWorkspace('a')
    expect(store.getState().open).toMatchObject({ dir: 'a', status: 'ready', fetchedAt: 1000, snapshot: { version: 1 } })

    clock = 2000
    await store.getState().refresh()
    expect(store.getState().open).toMatchObject({ status: 'stale', fetchedAt: 1000, snapshot: { version: 1 }, failure: { kind: 'network' } })

    clock = 3000
    await store.getState().refresh()
    expect(store.getState().open).toMatchObject({ status: 'ready', fetchedAt: 3000, snapshot: { version: 2 }, failure: null })
  })

  it('reports an error when nothing has loaded yet', async () => {
    const store = createAppStore(fakeApi([{ kind: 'not-found', message: 'No workspace "a"' }]))
    await store.getState().openWorkspace('a')
    expect(store.getState().open).toMatchObject({ status: 'error', snapshot: null, failure: { kind: 'not-found' } })
  })

  it('drops an answer for a workspace that is no longer open', async () => {
    let release: (v: Outcome<Snapshot>) => void = () => {}
    const api = fakeApi([])
    api.snapshot = dir => (dir === 'a' ? new Promise(resolve => { release = resolve }) : Promise.resolve({ kind: 'ok', data: snapshot(9) }))
    const store = createAppStore(api)
    const first = store.getState().openWorkspace('a')
    await store.getState().openWorkspace('b')
    release({ kind: 'ok', data: snapshot(1) })
    await first
    expect(store.getState().open).toMatchObject({ dir: 'b', snapshot: { version: 9 } })
  })

  it('skips a refresh while one is running or the snapshot is fresh', async () => {
    let clock = 0
    let calls = 0
    const api = fakeApi([])
    api.snapshot = () => {
      calls++
      return Promise.resolve({ kind: 'ok', data: snapshot(calls) })
    }
    const store = createAppStore(api, () => clock)
    await store.getState().openWorkspace('a')
    clock = 1000
    await store.getState().refreshIfStale(5000)
    expect(calls).toBe(1)
    clock = 6000
    await store.getState().refreshIfStale(5000)
    expect(calls).toBe(2)
  })

  it('signs out when the session has ended', async () => {
    const store = createAppStore(fakeApi([{ kind: 'signed-out' }]))
    await store.getState().start()
    await store.getState().openWorkspace('a')
    expect(store.getState().session).toEqual({ status: 'signed-out' })
    expect(store.getState().open).toBeNull()
  })
})
