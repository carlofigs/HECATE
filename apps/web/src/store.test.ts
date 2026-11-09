import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import type { Api, ApplyAnswer, Outcome, Snapshot } from './api.ts'
import { createAppStore, type Notice } from './store.ts'

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
