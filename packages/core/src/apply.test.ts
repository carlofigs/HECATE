import { describe, expect, it } from 'vitest'
import { applyBatch } from './apply.ts'
import { BatchInputError, prepareBatch } from './batch.ts'
import { AT, baseState, idGen, ok, run } from './__fixtures__/workspace.ts'

describe('applyBatch — all or nothing', () => {
  it('leaves the state untouched when a later op fails, and names the op', () => {
    const { state } = baseState()
    const result = run(state, [
      { type: 'task.add', kind: 'action', title: 'First' },
      { type: 'task.complete', task: 'A1' },
      { type: 'task.complete', task: 'A99' },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([expect.objectContaining({ index: 2, type: 'task.complete', code: 'not-found' })])
    expect(result.errors[0]?.available).toEqual(expect.arrayContaining(['A1', 'A2', 'A3', 'B1']))
    expect(state.tasks.tasks).toHaveLength(4)
    expect(state.tasks.tasks.find(t => t.key === 'A1')?.status).toBe('in-progress')
  })

  it('never mutates the input state, even on success', () => {
    const { state } = baseState()
    const before = JSON.stringify(state)
    ok(run(state, [{ type: 'task.complete', task: 'A1' }]))
    expect(JSON.stringify(state)).toBe(before)
  })

  it('refuses an unprepared batch', () => {
    const { state } = baseState()
    const result = applyBatch(state, { ops: [] } as never)
    expect(result).toMatchObject({ ok: false, errors: [{ index: null, code: 'invalid' }] })
  })
})

describe('determinism', () => {
  it('gives an identical result for the same state and prepared batch, automatic entry ids included', () => {
    const { state } = baseState()
    const batch = prepareBatch(
      { ops: [{ type: 'task.add', kind: 'action', title: 'Again' }, { type: 'task.complete', task: 'A1' }] },
      { opId: 'replay-me', at: AT, actor: 'app', newId: idGen() },
    )
    const a = ok(applyBatch(state, batch))
    const b = ok(applyBatch(state, batch))
    expect(b).toEqual(a)
    expect(a.activity.map(e => e.id)).toHaveLength(2)
  })

  it('stamps every change with the batch time and the workspace-local date', () => {
    const { state } = baseState()
    const result = ok(run(state, [{ type: 'activity.log', entry: 'flag', delta: 'Something happened' }], { at: '2026-11-04T23:00:00.000Z' }))
    expect(result.activity[0]).toMatchObject({ at: '2026-11-04T23:00:00.000Z', date: '2026-11-05', actor: 'claude', opId: 'test-op' })
  })
})

describe('prepareBatch', () => {
  it('fills ids and normalises tag names', () => {
    const batch = prepareBatch(
      { ops: [{ type: 'task.add', kind: 'action', title: 'Tagged', tags: ['#Monthly Report', 'ADMIN'] }] },
      { opId: 'p', at: AT, actor: 'claude', newId: idGen() },
    )
    expect(batch.ops[0]).toMatchObject({ id: expect.stringMatching(/^[0-9A-Z]{26}$/), tags: ['monthly-report', 'admin'] })
  })

  it('rejects malformed input with readable issues', () => {
    expect(() => prepareBatch({ ops: [{ type: 'task.fly' }] }, { opId: 'p', at: AT, actor: 'claude' })).toThrow(BatchInputError)
    expect(() => prepareBatch({ ops: [] }, { opId: 'p', at: AT, actor: 'claude' })).toThrow(BatchInputError)
    expect(() => prepareBatch({ ops: [{ type: 'task.add', kind: 'action', title: 'x', bogus: 1 }] }, { opId: 'p', at: AT, actor: 'claude' })).toThrow(BatchInputError)
  })

  it('rejects a placeholder declared twice', () => {
    expect(() => prepareBatch({
      ops: [{ type: 'task.add', ref: '$1', kind: 'action', title: 'a' }, { type: 'task.add', ref: '$1', kind: 'action', title: 'b' }],
    }, { opId: 'p', at: AT, actor: 'claude' })).toThrow(/\$1 is declared by more than one/)
  })
})

describe('placeholders', () => {
  it('allocates keys in batch order and resolves $n in later ops', () => {
    const { state } = baseState()
    const result = ok(run(state, [
      { type: 'task.add', ref: '$1', kind: 'action', title: 'Prepare data' },
      { type: 'task.add', ref: '$2', kind: 'waiting', title: 'Access request' },
      { type: 'task.add', ref: '$3', kind: 'action', title: 'Build the view', dependsOn: ['$1', '$2'] },
      { type: 'keepInMind.add', text: 'Build waits on access.', keys: ['$3', '$2'] },
    ]))
    expect(result.keyMap).toEqual({ $1: 'A4', $2: 'B2', $3: 'A5' })
    expect(result.state.tasks.tasks.find(t => t.key === 'A5')?.dependsOn).toEqual(['A4', 'B2'])
    expect(result.state.keepInMind.items[0]?.keys).toEqual(['A5', 'B2'])
    expect(result.state.tasks.nextKey).toEqual({ A: 6, B: 3 })
  })

  it('may name a task added later in the same batch', () => {
    const { state } = baseState()
    const result = ok(run(state, [
      { type: 'keepInMind.add', text: 'Mind the new one.', keys: ['$1'] },
      { type: 'task.add', ref: '$1', kind: 'action', title: 'The new one' },
    ]))
    expect(result.state.keepInMind.items[0]?.keys).toEqual(['A4'])
  })

  it('survives partial confirmation: dropping an op that nothing else references', () => {
    const { state } = baseState()
    const full = [
      { type: 'task.add', ref: '$1', kind: 'action', title: 'Keep me' },
      { type: 'task.add', ref: '$2', kind: 'action', title: 'Drop me' },
      { type: 'keepInMind.add', text: 'About the first.', keys: ['$1'] },
    ] as const
    const subset = ok(run(state, [full[0], full[2]]))
    expect(subset.keyMap).toEqual({ $1: 'A4' })
    expect(subset.state.keepInMind.items[0]?.keys).toEqual(['A4'])
  })

  it('fails clearly when a kept op references a dropped placeholder', () => {
    const { state } = baseState()
    const result = run(state, [
      { type: 'task.add', ref: '$1', kind: 'action', title: 'Kept' },
      { type: 'keepInMind.add', text: 'About the dropped one.', keys: ['$3'] },
    ])
    expect(result).toMatchObject({ ok: false, errors: [{ index: 1, code: 'not-found', message: '$3 is not defined in this batch', available: ['$1'] }] })
  })

  it('never substitutes inside prose', () => {
    const { state } = baseState()
    const result = ok(run(state, [{ type: 'task.add', ref: '$1', kind: 'action', title: 'Budget is $1 per seat' }]))
    expect(result.state.tasks.tasks.at(-1)?.title).toBe('Budget is $1 per seat')
  })
})

describe('lookups', () => {
  it('resolves a task by its legacy id', () => {
    const { state } = baseState()
    const result = ok(run(state, [{ type: 'task.update', task: 't-a7', patch: { urgency: 'low' } }]))
    expect(result.state.tasks.tasks.find(t => t.key === 'A2')?.urgency).toBe('low')
  })

  it('lists what exists when a project is unknown', () => {
    const { state } = baseState()
    const result = run(state, [{ type: 'task.add', kind: 'action', title: 'x', project: 'nope' }])
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'not-found', available: ['scorecard'] }] })
  })
})

describe('validation before success', () => {
  it('refuses a batch whose result breaks a cross-file rule', () => {
    const { state } = baseState()
    // A1 still depends on nothing, but deleting B1 would orphan A2's dependency.
    const result = run(state, [{ type: 'task.delete', task: 'B1' }])
    expect(result).toMatchObject({ ok: false, errors: [{ index: 0, code: 'conflict' }] })
  })

  it('reports the changed and deleted paths', () => {
    const { state } = baseState()
    const added = ok(run(state, [{ type: 'reference.put', name: 'style-guide', content: '# Style' }]))
    expect(added.changed).toEqual(['references/style-guide.md'])
    const removed = ok(run(added.state, [{ type: 'reference.remove', name: 'style-guide' }]))
    expect(removed.changed).toEqual([])
    expect(removed.deleted).toEqual(['references/style-guide.md'])
  })
})
