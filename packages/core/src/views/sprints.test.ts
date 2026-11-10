import { describe, expect, it } from 'vitest'
import { isoDate } from '../dates.ts'
import { baseState, ok, run } from '../__fixtures__/workspace.ts'
import { sprintList, sprintView } from './sprints.ts'

// The fixture cadence: sprint 7 runs Wed 28 Oct – Tue 10 Nov (Sydney).
const THU_5_NOV = new Date(Date.UTC(2026, 10, 4, 23, 0))
const keys = (tasks: readonly { key: string }[]): string[] => tasks.map(t => t.key)

/** A3 done, B1 dropped, A1 in progress: what a close of sprint 7 has to sort. */
function midSprint() {
  const { state } = baseState()
  return ok(run(state, [{ type: 'task.complete', task: 'A3' }, { type: 'task.drop', task: 'B1' }])).state
}

describe('sprintView', () => {
  it('previews an open sprint exactly as closing it would leave it, and says the close is early', () => {
    const state = midSprint()
    const view = sprintView(state, 7, THU_5_NOV)
    expect(view).toMatchObject({ n: 7, start: '2026-10-28', end: '2026-11-10', current: true, closed: false, stored: false, closable: { ok: true, early: true } })
    expect(view?.position).toMatchObject({ n: 7, day: 9 })

    const closed = ok(run(state, [{ type: 'sprint.close', n: 7 }], { at: THU_5_NOV.toISOString() })).state.sprints[7]
    expect(keys(view?.done ?? [])).toEqual(closed?.done.map(t => t.key))
    expect(keys(view?.dropped ?? [])).toEqual(closed?.dropped.map(t => t.key))
    expect(keys(view?.carried ?? [])).toEqual(closed?.carried)
    expect(view?.velocity).toEqual(closed?.velocity)
    expect(keys(view?.done ?? [])).toEqual(['A3'])
    expect(keys(view?.carried ?? [])).toEqual(['A1'])
    // The preview changed nothing.
    expect(state.sprints[7]).toBeUndefined()
  })

  it('reads a closed sprint from its file, carried tasks included', () => {
    const state = ok(run(midSprint(), [{ type: 'sprint.close', n: 7, retro: 'Steady.' }], { at: THU_5_NOV.toISOString() })).state
    const view = sprintView(state, 7, THU_5_NOV)
    expect(view).toMatchObject({ closed: true, closable: null, retro: 'Steady.', velocity: { done: 1, carried: 1, dropped: 1 } })
    expect(keys(view?.done ?? [])).toEqual(['A3'])
    expect(keys(view?.dropped ?? [])).toEqual(['B1'])
    expect(view?.carried).toMatchObject([{ key: 'A1', title: 'Draft the scorecard' }])
  })

  it('says why a sprint cannot be closed yet', () => {
    expect(sprintView(midSprint(), 9, THU_5_NOV)?.closable).toEqual({ ok: false, reason: expect.stringMatching(/has not started yet/) })
  })

  it('is null without a cadence or a file', () => {
    const state = ok(run(midSprint(), [{ type: 'workspace.update', patch: { sprint: null } }])).state
    expect(sprintView(state, 7, THU_5_NOV)).toBeNull()
  })
})

describe('sprintList', () => {
  it('lists every sprint with a file, and the current one without, newest first', () => {
    const started = ok(run(midSprint(), [{ type: 'sprint.start', n: 5, goal: 'Ship the draft.' }])).state
    expect(sprintList(started, isoDate('2026-11-05')).map(s => [s.n, s.current, s.closed])).toEqual([[7, true, false], [5, false, false]])
    const closed = ok(run(started, [{ type: 'sprint.close', n: 7 }], { at: THU_5_NOV.toISOString() })).state
    expect(sprintList(closed, isoDate('2026-11-05'))[0]).toMatchObject({ n: 7, current: true, closed: true, velocity: { done: 1, carried: 1, dropped: 1 } })
  })
})
