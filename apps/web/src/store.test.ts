import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import type { ApplyAnswer, Outcome, Snapshot } from './api.ts'
import { deviceStore, memoryBackend } from './offline.ts'
import { createAppStore, type Notice, type StoreServer as Api } from './store.ts'

const snapshot = (version: number): Snapshot => ({ version, state: {} as Snapshot['state'], pending: 0, lastError: null })

/** A real workspace with A1 in To Do, built through core's ops as the Worker would. */
function workspace(): WorkspaceState {
  const settings = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Test', timezone: 'UTC', policy: 'open', workdays: [1, 2, 3, 4, 5], sprint: null, tags: [], areas: [],
    statuses: [
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'dropped', name: 'Dropped', category: 'dropped' },
    ],
  })
  const at = '2026-11-09T00:00:00.000Z'
  const result = applyBatch(emptyState(settings, at), prepareBatch({ ops: [{ type: 'task.add', kind: 'action', title: 'First' }] }, { opId: 'seed', at, actor: 'app' }))
  if (!result.ok) throw new Error('fixture')
  return result.state
}

const statusOf = (state: WorkspaceState | null | undefined, key: string): string | undefined => state?.tasks.tasks.find(t => t.key === key)?.status

/** An API over a real workspace, whose ops answers come from a queue (applied by default). */
function writeApi(answers: ApplyAnswer[] = [], version = 1) {
  const sent: { ops: unknown[]; opId: string }[] = []
  let snapshots = 0
  const api: Api = {
    me: () => Promise.resolve({ kind: 'ok', data: { userId: 42, login: 'owner' } }),
    workspaces: () => Promise.resolve({ kind: 'ok', data: { workspaces: [], default: null } }),
    snapshot: () => {
      snapshots++
      return Promise.resolve({ kind: 'ok', data: { version, state: workspace(), pending: 0, lastError: null } })
    },
    signOut: () => Promise.resolve({ kind: 'ok', data: null }),
    applyOps: (_dir, body) => {
      sent.push(body)
      return Promise.resolve(answers.shift() ?? { kind: 'applied', version: version + sent.length, keyMap: {}, duplicate: false })
    },
  }
  return { api, sent, snapshots: () => snapshots }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

/** An API whose snapshot answers come from a queue. */
function fakeApi(answers: Outcome<Snapshot>[]): Api {
  return {
    me: () => Promise.resolve({ kind: 'ok', data: { userId: 42, login: 'owner' } }),
    workspaces: () => Promise.resolve({ kind: 'ok', data: { workspaces: [{ dir: 'a', hidden: false, name: null, policy: 'open' }], default: null } }),
    snapshot: () => Promise.resolve(answers.shift() ?? { kind: 'network' }),
    signOut: () => Promise.resolve({ kind: 'ok', data: null }),
    applyOps: () => Promise.resolve({ kind: 'network' }),
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
    const store = createAppStore(fakeApi([{ kind: 'ok', data: snapshot(1) }, { kind: 'network' }, { kind: 'ok', data: snapshot(2) }]), { now: () => clock })
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
    const store = createAppStore(api, { now: () => clock })
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

describe('writing', () => {
  it('shows a change at once, sends it with an opId, and keeps it when the Worker applies it next', async () => {
    const { api, sent, snapshots } = writeApi()
    const store = createAppStore(api)
    await store.getState().openWorkspace('w')
    const result = store.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    expect(result).toMatchObject({ ok: true })
    expect(statusOf(store.getState().open?.view, 'A1')).toBe('doing')
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.opId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    const open = store.getState().open
    expect(open).toMatchObject({ queue: [], sending: false, snapshot: { version: 2 } })
    expect(statusOf(open?.snapshot?.state, 'A1')).toBe('doing')
    expect(snapshots()).toBe(1)
  })

  it('gives a new task its id before sending, so the Worker keeps the same task', async () => {
    const { api, sent } = writeApi()
    const store = createAppStore(api)
    await store.getState().openWorkspace('w')
    const result = store.getState().apply([{ type: 'task.add', ref: '$1', kind: 'action', title: 'Second' }], 'Add a task')
    expect(result).toEqual({ ok: true, keyMap: { $1: 'A2' } })
    await settle()
    const id = (sent[0]?.ops[0] as { id?: string }).id
    expect(id).toBeTruthy()
    expect(store.getState().open?.view?.tasks.tasks.find(t => t.key === 'A2')?.id).toBe(id)
  })

  it('fixes every generated id before sending, so a later change can refer to it', async () => {
    const { api, sent } = writeApi()
    const store = createAppStore(api)
    await store.getState().openWorkspace('w')
    store.getState().apply([{ type: 'focus.setPlan', date: '2026-11-09', items: [{ lead: 'Write the draft' }, { lead: 'Tidy up' }] }], 'Set the plan')
    await settle()
    const planned = (sent[0]?.ops[0] as { items: { id?: string }[] }).items.map(i => i.id)
    const view = store.getState().open?.view?.focusWeeks['2026-11-09']?.days[0]?.plan.map(p => p.id)
    expect(planned).toHaveLength(2)
    expect(planned.every(Boolean)).toBe(true)
    expect(view).toEqual(planned)

    // The Worker kept the same ids, so outcomes that point at them apply there as they did here.
    const outcomes = planned.map(id => ({ planItemId: id, result: 'done', lead: 'Done' }))
    const result = store.getState().apply([{ type: 'focus.closeDay', date: '2026-11-09', outcomes }], 'Close Mon 9 Nov')
    expect(result).toMatchObject({ ok: true })
    await settle()
    const worker = applyBatch(workspace(), prepareBatch({ ops: sent[0]?.ops }, { opId: 'a', at: '2026-11-09T01:00:00.000Z', actor: 'app' }))
    if (!worker.ok) throw new Error('first batch')
    const closed = applyBatch(worker.state, prepareBatch({ ops: sent[1]?.ops }, { opId: 'b', at: '2026-11-09T02:00:00.000Z', actor: 'app' }))
    expect(closed.ok).toBe(true)
  })

  it('refetches when someone else wrote in between', async () => {
    const { api, snapshots } = writeApi([{ kind: 'applied', version: 7, keyMap: {}, duplicate: false }])
    const store = createAppStore(api)
    await store.getState().openWorkspace('w')
    store.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    expect(snapshots()).toBe(2)
  })

  it('drops a refused batch, says why, and shows the Worker’s state again', async () => {
    const notices: Notice[] = []
    const { api } = writeApi([{ kind: 'rejected', message: 'A1 is archived' }])
    const store = createAppStore(api, { notify: n => notices.push(n) })
    await store.getState().openWorkspace('w')
    store.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    expect(notices).toEqual([{ tone: 'danger', title: "Couldn't move A1", description: 'A1 is archived. Nothing was changed.' }])
    expect(store.getState().open?.queue).toEqual([])
    expect(statusOf(store.getState().open?.view, 'A1')).toBe('to-do')
  })

  it('keeps a change while offline and sends it once the Worker answers', async () => {
    let wake: () => void = () => {}
    const { api, sent } = writeApi([{ kind: 'network' }])
    const store = createAppStore(api, { sleep: () => new Promise(resolve => { wake = resolve }) })
    await store.getState().openWorkspace('w')
    store.getState().apply([{ type: 'task.complete', task: 'A1' }], 'Complete A1')
    await settle()
    expect(store.getState().open).toMatchObject({ sendFailure: { kind: 'network' }, sending: false })
    expect(store.getState().open?.queue).toHaveLength(1)
    expect(statusOf(store.getState().open?.view, 'A1')).toBe('done')
    wake()
    await settle()
    expect(sent).toHaveLength(2)
    expect(sent[0]?.opId).toBe(sent[1]?.opId)
    expect(store.getState().open).toMatchObject({ queue: [], sendFailure: null })
  })

  it('ignores a refresh that answers with an older version than a change it just confirmed', async () => {
    let release: (o: Outcome<Snapshot>) => void = () => {}
    const { api } = writeApi()
    const store = createAppStore(api)
    await store.getState().openWorkspace('w')
    const original = api.snapshot
    api.snapshot = () => new Promise(resolve => { release = resolve })
    const slow = store.getState().refresh()
    store.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    expect(store.getState().open?.snapshot?.version).toBe(2)
    release(await original('w'))
    await slow
    expect(store.getState().open?.snapshot?.version).toBe(2)
    expect(statusOf(store.getState().open?.view, 'A1')).toBe('doing')
  })

  it('sends at once when the connection is back, instead of waiting out the backoff', async () => {
    const { api, sent } = writeApi([{ kind: 'network' }])
    // A backoff that never ends on its own: only retryNow can end it.
    const store = createAppStore(api, { sleep: () => new Promise(() => {}) })
    await store.getState().openWorkspace('w')
    store.getState().apply([{ type: 'task.complete', task: 'A1' }], 'Complete A1')
    await settle()
    expect(sent).toHaveLength(1)
    expect(store.getState().open?.queue).toHaveLength(1)
    store.getState().retryNow()
    await settle()
    expect(sent).toHaveLength(2)
    expect(store.getState().open).toMatchObject({ queue: [], sendFailure: null })
  })

  it('refuses at once what cannot apply, and sends nothing', async () => {
    const { api, sent } = writeApi()
    const store = createAppStore(api)
    await store.getState().openWorkspace('w')
    const result = store.getState().apply([{ type: 'task.move', task: 'A9', status: 'doing' }], 'Move A9')
    expect(result).toMatchObject({ ok: false })
    await settle()
    expect(sent).toEqual([])
    expect(store.getState().open?.queue).toEqual([])
  })
})

describe('live changes', () => {
  /** An API whose snapshot version the test moves, as other tabs and Claude would. */
  function liveApi() {
    let version = 1
    let snapshots = 0
    let release: (() => void) | null = null
    const api: Api = {
      me: () => Promise.resolve({ kind: 'ok', data: { userId: 42, login: 'owner' } }),
      workspaces: () => Promise.resolve({ kind: 'ok', data: { workspaces: [], default: null } }),
      snapshot: () => {
        snapshots++
        return Promise.resolve({ kind: 'ok', data: { version, state: workspace(), pending: 0, lastError: null, activity: { unread: 0 } } })
      },
      signOut: () => Promise.resolve({ kind: 'ok', data: null }),
      // Held until the test releases it, so a change can be heard while this one is in flight.
      applyOps: () => new Promise(resolve => {
        release = () => resolve({ kind: 'applied', version: 2, keyMap: {}, duplicate: false })
      }),
    }
    return { api, snapshots: () => snapshots, setVersion: (v: number) => void (version = v), release: () => release?.() }
  }

  it('refetches on a newer version, updates the counts in place on the same one, and ignores an older one', async () => {
    const server = liveApi()
    const store = createAppStore(server.api)
    await store.getState().openWorkspace('w')
    store.getState().setLive('w', 'open')
    expect(store.getState().open?.live).toBe('open')

    store.getState().onLive('w', { version: 1, pending: 2, unread: 3 })
    expect(store.getState().open?.snapshot).toMatchObject({ version: 1, pending: 2, activity: { unread: 3 } })
    expect(server.snapshots()).toBe(1)

    server.setVersion(4)
    store.getState().onLive('w', { version: 4, pending: 1, unread: 0 })
    await settle()
    expect(store.getState().open?.snapshot?.version).toBe(4)
    expect(server.snapshots()).toBe(2)

    store.getState().onLive('w', { version: 3, pending: 9, unread: 9 })
    store.getState().onLive('other', { version: 9, pending: 9, unread: 9 })
    await settle()
    // For version 4 the socket's counts stand (pending 1): the snapshot carries the same version, not newer counts.
    expect(store.getState().open?.snapshot).toMatchObject({ version: 4, pending: 1 })
    expect(server.snapshots()).toBe(2)
  })

  it('fetches a change heard while its own was in flight, once the answer is in', async () => {
    const server = liveApi()
    const store = createAppStore(server.api)
    await store.getState().openWorkspace('w')
    store.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    // Its own change (2), then another tab's (3), heard before the Worker's answer arrives.
    server.setVersion(3)
    store.getState().onLive('w', { version: 2, pending: 1, unread: 0 })
    store.getState().onLive('w', { version: 3, pending: 2, unread: 0 })
    await settle()
    expect(server.snapshots()).toBe(1)
    server.release()
    await settle()
    await settle()
    expect(store.getState().open).toMatchObject({ queue: [], snapshot: { version: 3 } })
    expect(server.snapshots()).toBe(2)
  })

  /** An API whose snapshot answers the test releases one at a time, each with its own version and counts. */
  function heldSnapshots() {
    const waiting: ((answer: { version: number; pending: number; unread: number }) => void)[] = []
    let asked = 0
    const api: Api = {
      me: () => Promise.resolve({ kind: 'ok', data: { userId: 42, login: 'owner' } }),
      workspaces: () => Promise.resolve({ kind: 'ok', data: { workspaces: [], default: null } }),
      snapshot: () => {
        asked++
        return new Promise(resolve => {
          waiting.push(a => resolve({ kind: 'ok', data: { version: a.version, state: workspace(), pending: a.pending, lastError: null, activity: { unread: a.unread } } }))
        })
      },
      signOut: () => Promise.resolve({ kind: 'ok', data: null }),
      applyOps: () => Promise.resolve({ kind: 'network' }),
    }
    /** Answers the oldest request, once it has been made. */
    const answer = async (a: { version: number; pending: number; unread: number }): Promise<void> => {
      while (waiting.length === 0) await settle()
      waiting.shift()?.(a)
    }
    return { api, asked: () => asked, answer }
  }

  it('keeps a live count heard while a refresh is on its way, rather than the older one that refresh brings', async () => {
    const server = heldSnapshots()
    const store = createAppStore(server.api)
    const opening = store.getState().openWorkspace('w')
    await server.answer({ version: 1, pending: 1, unread: 7 })
    await opening
    // A refresh sets off; meanwhile the socket says the app has read everything and the commit went through.
    const refreshing = store.getState().refresh()
    store.getState().onLive('w', { version: 1, pending: 0, unread: 0 })
    expect(store.getState().open?.snapshot).toMatchObject({ pending: 0, activity: { unread: 0 } })
    // The refresh's snapshot was taken before that: same version, the old counts.
    await server.answer({ version: 1, pending: 1, unread: 7 })
    await refreshing
    expect(store.getState().open?.snapshot).toMatchObject({ version: 1, pending: 0, activity: { unread: 0 } })
  })

  it('fetches once more when a newer version is announced while a refresh is on its way', async () => {
    const server = heldSnapshots()
    const store = createAppStore(server.api)
    const opening = store.getState().openWorkspace('w')
    await server.answer({ version: 1, pending: 0, unread: 0 })
    await opening
    const refreshing = store.getState().refresh()
    store.getState().onLive('w', { version: 2, pending: 1, unread: 0 })
    await server.answer({ version: 1, pending: 0, unread: 0 })
    await server.answer({ version: 2, pending: 1, unread: 0 })
    await refreshing
    await settle()
    expect(store.getState().open?.snapshot?.version).toBe(2)
    // Nothing newer was announced during those: no more fetching.
    const asked = server.asked()
    await settle()
    await settle()
    expect(server.asked()).toBe(asked)
    expect(store.getState().open?.snapshot?.version).toBe(2)
  })

  it('checks the session when the socket ends with it', async () => {
    let signedIn = true
    const store = createAppStore({
      ...fakeApi([]),
      snapshot: () => Promise.resolve(signedIn ? { kind: 'ok', data: snapshot(1) } : { kind: 'signed-out' }),
    })
    await store.getState().start()
    await store.getState().openWorkspace('a')
    signedIn = false
    store.getState().setLive('a', 'ended')
    await settle()
    expect(store.getState().session).toEqual({ status: 'signed-out' })
  })
})

describe('the device copy', () => {
  const me = { userId: 42, login: 'owner' }
  const list = { workspaces: [{ dir: 'w', hidden: false, name: null, policy: 'open' as const }], default: null }

  /** An API that is online or not, over a real workspace at `version`. */
  function server() {
    let online = true
    let signedIn = true
    let version = 1
    let signOuts = 0
    const sent: string[] = []
    const api: Api = {
      me: () => Promise.resolve(!online ? { kind: 'network' } : signedIn ? { kind: 'ok', data: me } : { kind: 'signed-out' }),
      workspaces: () => Promise.resolve(online ? { kind: 'ok', data: list } : { kind: 'network' }),
      snapshot: () => Promise.resolve(!online ? { kind: 'network' } : signedIn ? { kind: 'ok', data: { version, state: workspace(), pending: 0, lastError: null } } : { kind: 'signed-out' }),
      signOut: () => {
        if (!online) return Promise.resolve({ kind: 'network' })
        signOuts++
        signedIn = false
        return Promise.resolve({ kind: 'ok', data: null })
      },
      applyOps: (_dir, body) => {
        if (!online) return Promise.resolve({ kind: 'network' })
        sent.push(body.opId)
        version++
        return Promise.resolve({ kind: 'applied', version, keyMap: {}, duplicate: false })
      },
    }
    return {
      api, sent,
      setOnline: (on: boolean) => void (online = on),
      setSignedIn: (on: boolean) => void (signedIn = on),
      setVersion: (v: number) => void (version = v),
      signOuts: () => signOuts,
    }
  }

  function device() {
    const backend = memoryBackend()
    let flag = false
    const flagStore = { get: () => flag, set: (on: boolean) => void (flag = on) }
    return { backend, offline: deviceStore(Promise.resolve(backend)), flag: flagStore }
  }

  /** A reload: a new store over the same device. */
  const tab = (s: ReturnType<typeof server>, d: ReturnType<typeof device>) =>
    createAppStore(s.api, { offline: d.offline, signOutPending: d.flag, sleep: () => new Promise(() => {}) })

  it('keeps a change made offline through a reload, then sends it once the Worker answers', async () => {
    const s = server()
    const d = device()
    const first = tab(s, d)
    await first.getState().start()
    await first.getState().openWorkspace('w')
    await settle()
    expect(d.backend.dump().snapshots).toHaveLength(1)

    s.setOnline(false)
    first.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    expect(d.backend.dump().batches).toHaveLength(1)
    expect(first.getState().keepsChanges()).toBe(true)

    // Reload while offline: signed in from the copy, the workspace and its change on show.
    const second = tab(s, d)
    await second.getState().start()
    expect(second.getState().session).toEqual({ status: 'signed-in', me, offline: true })
    expect(second.getState().workspaces).toEqual({ status: 'ready', list })
    await second.getState().openWorkspace('w')
    expect(second.getState().open).toMatchObject({ status: 'stale', failure: { kind: 'network' }, fromDevice: true, queue: [{ label: 'Move A1' }] })
    expect(statusOf(second.getState().open?.view, 'A1')).toBe('doing')

    // Back online: confirmed, sent, and let go of.
    s.setOnline(true)
    await second.getState().start()
    expect(second.getState().session).toEqual({ status: 'signed-in', me })
    await second.getState().refresh()
    await settle()
    await settle()
    expect(s.sent).toHaveLength(1)
    expect(second.getState().open).toMatchObject({ queue: [], fromDevice: false })
    expect(d.backend.dump().batches).toEqual([])
  })

  it('takes the Worker’s answer over a device copy, even at a lower version', async () => {
    const s = server()
    const d = device()
    s.setVersion(57)
    const first = tab(s, d)
    await first.getState().start()
    await first.getState().openWorkspace('w')
    await settle()
    s.setVersion(1)
    const second = tab(s, d)
    await second.getState().start()
    await second.getState().openWorkspace('w')
    expect(second.getState().open).toMatchObject({ status: 'ready', snapshot: { version: 1 }, fromDevice: false })
  })

  it('forgets the session when it is over, but keeps unsent changes for the next sign-in', async () => {
    const s = server()
    const d = device()
    const first = tab(s, d)
    await first.getState().start()
    await first.getState().openWorkspace('w')
    s.setOnline(false)
    first.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    s.setOnline(true)
    s.setSignedIn(false)
    const second = tab(s, d)
    await second.getState().start()
    await settle()
    expect(second.getState().session).toEqual({ status: 'signed-out' })
    expect(d.backend.dump()).toMatchObject({ session: [], snapshots: [], batches: [{ label: 'Move A1' }] })
  })

  it('signs out clearing the device, and finishes an offline sign-out at the next start', async () => {
    const s = server()
    const d = device()
    const first = tab(s, d)
    await first.getState().start()
    await first.getState().openWorkspace('w')
    s.setOnline(false)
    first.getState().apply([{ type: 'task.move', task: 'A1', status: 'doing' }], 'Move A1')
    await settle()
    await first.getState().signOut()
    expect(first.getState().session).toEqual({ status: 'signed-out' })
    expect(d.backend.dump()).toEqual({ session: [], snapshots: [], batches: [] })
    expect(d.flag.get()).toBe(true)
    expect(s.signOuts()).toBe(0)

    s.setOnline(true)
    const second = tab(s, d)
    await second.getState().start()
    expect(second.getState().session).toEqual({ status: 'signed-out' })
    expect(s.signOuts()).toBe(1)
    expect(d.flag.get()).toBe(false)
  })

  it('without a copy, an offline start still says what is wrong', async () => {
    const s = server()
    s.setOnline(false)
    const store = tab(s, device())
    await store.getState().start()
    expect(store.getState().session).toEqual({ status: 'error', failure: { kind: 'network' } })
    expect(createAppStore(s.api).getState().keepsChanges()).toBe(false)
  })
})
