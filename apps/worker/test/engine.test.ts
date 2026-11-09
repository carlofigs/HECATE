import { describe, expect, it } from 'vitest'
import { stateFromFiles } from '@hecate/core'
import type { Fetch } from '@hecate/github-store'
import type { FakeGitHub } from '@hecate/github-store/testing'
import { WorkspaceEngine, type ApplyOutcome, type Snapshot } from '../src/engine.ts'
import { DIR, START, addTask, harness, pushOps } from './helpers.ts'

const ok = (s: Snapshot) => {
  if (s.status !== 'ok') throw new Error(s.message)
  return s
}
const applied = (o: ApplyOutcome) => {
  if (o.status !== 'applied') throw new Error(`expected applied, got ${JSON.stringify(o)}`)
  return o
}
const keys = (s: Snapshot) => ok(s).state.tasks.tasks.map(t => t.key)
const workFiles = (fake: FakeGitHub) =>
  Object.fromEntries(Object.entries(fake.files()).filter(([p]) => p.startsWith(`${DIR}/`)).map(([p, c]) => [p.slice(DIR.length + 1), c]))
const commits = (fake: FakeGitHub) => fake.log().length - 1

describe('loading', () => {
  it('reads the workspace from git once, then from storage', async () => {
    const h = await harness()
    const first = ok(await h.engine.snapshot())
    expect(first).toMatchObject({ version: 1, head: h.fake.head(), pending: 0, lastError: null })
    expect(keys(first)).toEqual(['A1', 'A2', 'B1'])
    const before = h.requests().length
    expect(keys(await h.restart().snapshot())).toEqual(['A1', 'A2', 'B1'])
    expect(h.requests().length).toBe(before)
  })

  it('reports a missing or invalid workspace instead of guessing', async () => {
    const missing = await harness({ dir: 'nowhere' })
    expect(await missing.engine.snapshot()).toEqual({ status: 'unavailable', message: 'There is no workspace at nowhere/ on the branch' })
    expect(await missing.engine.apply({ ops: [addTask('x')], actor: 'claude' })).toMatchObject({ status: 'unavailable' })

    const broken = await harness({ dir: 'club' })
    expect(await broken.engine.snapshot()).toMatchObject({ status: 'unavailable', message: expect.stringContaining('club/ is not a valid v2 workspace') })
  })
})

describe('applying', () => {
  it('applies a batch at once (read-your-writes) and commits it when the alarm fires', async () => {
    const h = await harness()
    const result = applied(await h.engine.apply({ ops: [addTask('Draw the target view')], actor: 'claude', opId: 'op-1' }))
    expect(result).toMatchObject({ version: 2, opId: 'op-1', keyMap: { $1: 'A3' }, duplicate: false })
    expect(result.preview).toMatch(/^\*\*Applied\.\*\*/)
    expect(keys(await h.engine.snapshot())).toEqual(['A1', 'A2', 'B1', 'A3'])
    expect(commits(h.fake)).toBe(0)
    expect(h.alarmAt()).toBe(START + 30_000)

    await h.tick(30_000)
    expect(commits(h.fake)).toBe(1)
    expect(h.fake.log()[0]).toMatch(/^work: .+\n\n- .+\n\nActor: claude\nOp-Id: op-1$/)
    const committed = stateFromFiles(workFiles(h.fake))
    expect(committed.tasks.tasks.map(t => t.key)).toEqual(['A1', 'A2', 'B1', 'A3'])
    expect(ok(await h.engine.snapshot())).toMatchObject({ version: 2, pending: 0, head: h.fake.head() })
    expect(h.alarmAt()).toBeNull()
  })

  it('treats the same opId as the same change', async () => {
    const h = await harness()
    const first = applied(await h.engine.apply({ ops: [addTask('Once')], actor: 'app', opId: 'same' }))
    const again = applied(await h.engine.apply({ ops: [addTask('Once')], actor: 'app', opId: 'same' }))
    expect(again).toMatchObject({ duplicate: true, keyMap: first.keyMap, version: first.version })
    expect(keys(await h.engine.snapshot())).toEqual(['A1', 'A2', 'B1', 'A3'])
  })

  it('refuses a stale ifVersion, previews a dry run, and reports invalid or failing batches', async () => {
    const h = await harness()
    expect(await h.engine.apply({ ops: [addTask('x')], actor: 'claude', ifVersion: 7 })).toEqual({ status: 'version-conflict', version: 1, expected: 7 })

    const dry = await h.engine.apply({ ops: [addTask('Maybe')], actor: 'claude', dryRun: true })
    expect(dry).toMatchObject({ status: 'dry-run', version: 1, keyMap: { $1: 'A3' }, changed: expect.arrayContaining(['tasks.json']) })
    expect(dry.status === 'dry-run' && dry.preview).toMatch(/^\*\*Dry run — nothing has been written\.\*\*/)
    expect(keys(await h.engine.snapshot())).toEqual(['A1', 'A2', 'B1'])
    expect(h.alarmAt()).toBeNull()

    expect(await h.engine.apply({ ops: [{ type: 'no.such.op' }], actor: 'claude' })).toMatchObject({ status: 'invalid', version: 1 })
    const rejected = await h.engine.apply({ ops: [{ type: 'task.complete', task: 'A99' }], actor: 'claude' })
    expect(rejected).toMatchObject({ status: 'rejected', version: 1, errors: [{ index: 0, code: 'not-found' }] })
    expect(rejected.status === 'rejected' && rejected.message).toMatch(/^\*\*Not applied/)
    expect(ok(await h.engine.snapshot()).version).toBe(1)
  })

  it('renders each focus week a dry run would change, as it would look', async () => {
    const h = await harness()
    const dry = await h.engine.apply({
      ops: [{ type: 'focus.setPriorities', weekOf: '2026-11-02', items: [{ tier: 'focus', lead: 'Draft the scorecard', keys: ['A1'] }] }],
      actor: 'claude', dryRun: true,
    })
    if (dry.status !== 'dry-run') throw new Error(JSON.stringify(dry))
    expect(dry.focus).toHaveLength(1)
    expect(dry.focus[0]?.weekOf).toBe('2026-11-02')
    expect(dry.focus[0]?.markdown).toMatch(/^# Week of 2 Nov 2026[\s\S]*## This Week's Priorities\n\n- 🎯 \*\*Draft the scorecard\*\* \(A1\)/)
    expect(ok(await h.engine.snapshot()).state.focusWeeks).toEqual({})
    const plain = await h.engine.apply({ ops: [addTask('No week here')], actor: 'claude', dryRun: true })
    expect(plain.status === 'dry-run' && plain.focus).toEqual([])
  })

  it('coalesces 20 ops in a minute into at most two commits', async () => {
    const h = await harness()
    for (let i = 0; i < 20; i++) {
      applied(await h.engine.apply({ ops: [addTask(`Task ${i}`)], actor: 'app' }))
      await h.tick(3_000)
    }
    await h.tick(60_000)
    expect(commits(h.fake)).toBe(2)
    expect(stateFromFiles(workFiles(h.fake) as Record<string, string>).tasks.tasks).toHaveLength(23)
  })

  it('keeps everything pending across a restart', async () => {
    const h = await harness()
    applied(await h.engine.apply({ ops: [addTask('Survives eviction')], actor: 'claude' }))
    const engine = h.restart()
    expect(ok(await engine.snapshot())).toMatchObject({ version: 2, pending: 1 })
    expect(await engine.flush()).toMatchObject({ status: 'committed', batches: 1 })
    expect(stateFromFiles(workFiles(h.fake) as Record<string, string>).tasks.tasks.at(-1)?.title).toBe('Survives eviction')
  })

  it('keeps a change made while a commit is in flight for the next commit', async () => {
    let release: () => void = () => undefined
    let reached: () => void = () => undefined
    const atRefUpdate = new Promise<void>(resolve => { reached = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const gated = (fake: FakeGitHub): Fetch => async (url, init) => {
      if (init?.method === 'PATCH') {
        reached()
        await gate
      }
      return fake.fetch(url, init)
    }
    const h = await harness({ fetch: gated })
    applied(await h.engine.apply({ ops: [addTask('First')], actor: 'app' }))
    const flushing = h.engine.flush()
    await atRefUpdate
    applied(await h.engine.apply({ ops: [{ type: 'task.update', task: 'A3', patch: { note: 'Edited mid-commit' } }], actor: 'app' }))
    release()
    expect(await flushing).toMatchObject({ status: 'committed', batches: 1 })
    expect(ok(await h.engine.snapshot()).pending).toBe(1)
    expect(await h.engine.flush()).toMatchObject({ status: 'committed', batches: 1 })
    const tasks = stateFromFiles(workFiles(h.fake)).tasks.tasks
    expect(tasks.find(t => t.key === 'A3')?.note).toBe('Edited mid-commit')
  })
})

describe('another writer moved the branch', () => {
  it('rebuilds on the new head when they changed other files', async () => {
    const h = await harness()
    applied(await h.engine.apply({ ops: [addTask('Mine')], actor: 'claude' }))
    await h.fake.push({ 'work/references/notes.md': '# Notes\n', 'club/notes.md': 'Changed elsewhere\n' })
    expect(await h.engine.flush()).toMatchObject({ status: 'committed', rebased: true, replayed: null })
    const files = workFiles(h.fake)
    expect(files['references/notes.md']).toBe('# Notes\n')
    expect(stateFromFiles(files as Record<string, string>).tasks.tasks.map(t => t.title)).toContain('Mine')
    expect(h.fake.files()['club/notes.md']).toBe('Changed elsewhere\n')
    expect(ok(await h.engine.snapshot()).state.references).toEqual({ notes: '# Notes\n' })
  })

  it('replays its batches on their state when they changed the same files, renumbering new keys', async () => {
    const h = await harness()
    applied(await h.engine.apply({ ops: [addTask('Mine')], actor: 'claude', opId: 'mine' }))
    await pushOps(h.fake, [addTask('Theirs')])
    const outcome = await h.engine.flush()
    expect(outcome).toMatchObject({
      status: 'committed', rebased: true,
      replayed: { renumbered: [{ opId: 'mine', from: { $1: 'A3' }, to: { $1: 'A4' } }], dropped: [] },
    })
    const tasks = stateFromFiles(workFiles(h.fake)).tasks.tasks
    expect(tasks.map(t => [t.key, t.title])).toEqual(expect.arrayContaining([['A3', 'Theirs'], ['A4', 'Mine']]))
    expect(await h.engine.apply({ ops: [addTask('Mine')], actor: 'claude', opId: 'mine' })).toMatchObject({ duplicate: true, keyMap: { $1: 'A4' } })
    expect(ok(await h.engine.snapshot()).lastReplay?.renumbered).toHaveLength(1)
  })

  it('drops a batch that no longer applies, and says so', async () => {
    const h = await harness()
    applied(await h.engine.apply({ ops: [{ type: 'task.update', task: 'A2', patch: { note: 'Too late' } }], actor: 'app', opId: 'late' }))
    // They removed A2 by hand.
    const tasks = JSON.parse(h.fake.files()['work/tasks.json'] ?? '') as { tasks: { key: string }[] }
    tasks.tasks = tasks.tasks.filter(t => t.key !== 'A2')
    await h.fake.push({ 'work/tasks.json': `${JSON.stringify(tasks, null, 2)}\n` })

    const outcome = await h.engine.flush()
    expect(outcome).toMatchObject({ status: 'clean', replayed: { dropped: [{ opId: 'late', actor: 'app', errors: [{ code: 'not-found' }] }] } })
    expect(keys(await h.engine.snapshot())).toEqual(['A1', 'B1'])
    expect(await h.engine.apply({ ops: [], actor: 'app', opId: 'late' })).toMatchObject({ status: 'rejected', message: expect.stringContaining('dropped') })
  })

  it('never adopts a head that is not a valid workspace, and commits once it is fixed', async () => {
    const h = await harness()
    const good = h.fake.files()['work/tasks.json'] ?? ''
    applied(await h.engine.apply({ ops: [addTask('Kept safe')], actor: 'claude' }))
    await h.fake.push({ 'work/tasks.json': '{ "broken": ' })

    const deferred = await h.engine.flush()
    expect(deferred).toMatchObject({ status: 'deferred', message: expect.stringContaining('not a valid workspace') })
    expect(h.alarmAt()).toBe(START + 60_000)
    expect(ok(await h.engine.snapshot())).toMatchObject({ pending: 1, lastError: { message: expect.stringContaining('not a valid workspace') } })

    await h.fake.push({ 'work/tasks.json': good }, 'Fix by hand')
    await h.tick(60_000)
    expect(h.fake.log()[0]).toMatch(/^work: /)
    expect(stateFromFiles(workFiles(h.fake) as Record<string, string>).tasks.tasks.map(t => t.title)).toContain('Kept safe')
    expect(ok(await h.engine.snapshot()).lastError).toBeNull()
  })
})

describe('refresh', () => {
  it('picks up an external push; an unchanged head costs one request', async () => {
    const h = await harness()
    await h.engine.snapshot()
    await h.fake.push({ 'work/references/notes.md': '# Notes\n' })
    expect(await h.engine.refresh()).toMatchObject({ status: 'updated', version: 2, head: h.fake.head() })
    expect(ok(await h.engine.snapshot()).state.references).toEqual({ notes: '# Notes\n' })
    const before = h.requests().length
    expect(await h.engine.refresh()).toMatchObject({ status: 'unchanged', version: 2 })
    expect(h.requests().length - before).toBe(1)
  })

  it('checks for changes on read once the last check is stale', async () => {
    const h = await harness()
    await h.engine.snapshot()
    await h.fake.push({ 'work/references/notes.md': '# Notes\n' })
    expect(ok(await h.engine.snapshot()).version).toBe(1)
    await h.tick(31_000)
    expect(ok(await h.engine.snapshot()).version).toBe(2)
  })

  it('keeps its state when the pushed head is broken', async () => {
    const h = await harness()
    await h.engine.snapshot()
    await h.fake.push({ 'work/tasks.json': 'not json' })
    expect(await h.engine.refresh()).toMatchObject({ status: 'error', version: 1 })
    expect(keys(await h.engine.snapshot())).toEqual(['A1', 'A2', 'B1'])
  })

  it('leaves reconciling to the commit when changes are pending', async () => {
    const h = await harness()
    applied(await h.engine.apply({ ops: [addTask('Mine')], actor: 'claude' }))
    await h.fake.push({ 'work/references/notes.md': '# Notes\n' })
    expect(await h.engine.refresh()).toMatchObject({ status: 'deferred' })
    await expect.poll(() => commits(h.fake)).toBe(2)
  })
})

describe('reading', () => {
  it('skips an activity log that does not parse instead of failing the read', async () => {
    const h = await harness()
    await h.engine.snapshot()
    await h.fake.push({ 'work/activity/2026-W45.jsonl': 'not json\n' })
    await h.engine.refresh()
    expect(await h.engine.read({ kind: 'activity', cursor: 'claude' })).toMatchObject({ status: 'ok', data: { unread: 0 } })
    expect(await h.engine.read({ kind: 'briefing', cursor: 'Not A Cursor' })).toMatchObject({ status: 'not-found' })
    expect(await h.engine.ackActivity('claude')).toMatchObject({ status: 'ok', acknowledged: 0 })
  })
})

describe('GitHub limits', () => {
  it('defers a commit until a spent rate limit resets', async () => {
    const h = await harness()
    applied(await h.engine.apply({ ops: [addTask('Later')], actor: 'claude' }))
    await h.engine.snapshot()
    const reset = Math.floor(START / 1000) + 600
    h.fake.failNext({ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }, body: { message: 'API rate limit exceeded' } })
    expect(await h.engine.flush()).toMatchObject({ status: 'deferred', retryAt: reset * 1000 + 1000 })
    expect(h.alarmAt()).toBe(reset * 1000 + 1000)
    await h.tick(601_000)
    expect(commits(h.fake)).toBe(1)
  })
})

describe('storage', () => {
  it('is only ever the files of one workspace', async () => {
    const h = await harness()
    await h.engine.snapshot()
    const other = new WorkspaceEngine({ dir: 'club', store: undefined as never, blobs: new Map(), persistence: h.persistence, alarm: { get: () => Promise.resolve(null), set: () => Promise.resolve() } })
    await expect(other.snapshot()).rejects.toThrow('holds "work", not "club"')
  })
})
