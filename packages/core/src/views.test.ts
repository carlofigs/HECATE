import { describe, expect, it } from 'vitest'
import type { FileData } from './files.ts'
import { isoDate } from './dates.ts'
import {
  blockedTasks, blockers, boardColumns, briefing, completedSince, cutoffs, dueSoon, findTask, inProgress, sprintPosition, todayView, waitingOn,
} from './views/selectors.ts'
import { baseState, ok, run } from './__fixtures__/workspace.ts'

const d = isoDate
const WED_4_NOV = '2026-11-04T06:00:00.000Z' // 17:00 in Sydney

describe('blocking', () => {
  it('counts only open dependencies', () => {
    const { state } = baseState()
    const a2 = findTask(state, 'A2')
    if (!a2) throw new Error('fixture changed')
    expect(blockers(state, a2.task).map(t => t.key)).toEqual(['A1', 'B1'])

    const b1Done = ok(run(state, [{ type: 'task.complete', task: 'B1' }])).state
    expect(blockers(b1Done, findTask(b1Done, 'A2')!.task).map(t => t.key)).toEqual(['A1'])
    expect(blockedTasks(b1Done).map(t => [t.key, t.blockedBy])).toEqual([['A2', ['A1']]])
  })

  it('no longer counts a dependency once it is archived', () => {
    const { state } = baseState()
    const closed = ok(run(state, [{ type: 'task.complete', task: 'A1' }, { type: 'task.complete', task: 'B1' }, { type: 'sprint.close', n: 7 }])).state
    const a2 = findTask(closed, 'A2')!.task
    expect(blockers(closed, a2)).toEqual([])
    expect(findTask(closed, 'A1')).toMatchObject({ where: 'archived', sprint: 7 })
    expect(findTask(closed, 't-a7')).toMatchObject({ where: 'open', task: { key: 'A2' } })
  })
})

describe('boardColumns', () => {
  it('lists every status in workspace order, each task once, in board order', () => {
    const { state } = baseState()
    const columns = boardColumns(state)
    expect(columns.map(c => c.status.id)).toEqual(state.workspace.statuses.map(s => s.id))
    const keys = columns.flatMap(c => c.cards.map(k => k.key))
    expect([...keys].sort()).toEqual(state.tasks.tasks.map(t => t.key).sort())
    for (const column of columns) {
      const orders = column.cards.map(card => state.tasks.tasks.find(t => t.key === card.key)!.order)
      expect(orders).toEqual([...orders].sort())
    }
  })

  it('carries what a card shows: kind, tags, dependencies, blockers and who a B task waits on', () => {
    const { state } = baseState()
    const cards = boardColumns(state).flatMap(c => c.cards)
    expect(cards.find(c => c.key === 'A1')).toMatchObject({ kind: 'action', tags: ['reporting'], projectSlug: 'scorecard', urgency: 'high' })
    expect(cards.find(c => c.title === 'Publish the scorecard')).toMatchObject({ dependsOn: ['A1', 'B1'], blockedBy: ['A1', 'B1'] })
    expect(cards.find(c => c.key === 'B1')?.waitingOn).toBe(waitingOn(state, d('2026-11-04')).find(w => w.key === 'B1')?.who)
  })

  it('follows a move: the moved task sits where the op put it', () => {
    const { state } = baseState()
    const todo = boardColumns(state).find(c => c.status.category === 'todo')!
    const [first, second] = todo.cards
    if (!first || !second) throw new Error('fixture changed')
    const moved = ok(run(state, [{ type: 'task.move', task: second.key, status: todo.status.id, after: null }])).state
    expect(boardColumns(moved).find(c => c.status.id === todo.status.id)!.cards.slice(0, 2).map(c => c.key)).toEqual([second.key, first.key])
    const done = ok(run(state, [{ type: 'task.complete', task: first.key }])).state
    const doneColumn = boardColumns(done).find(c => c.status.category === 'done')!
    expect(doneColumn.cards.at(-1)).toMatchObject({ key: first.key, completedAt: expect.any(String) })
  })
})

describe('waitingOn', () => {
  it('shows who, the next meeting about it, and what it unblocks', () => {
    const { state } = baseState()
    const s = ok(run(state, [
      { type: 'focus.setSchedule', weekOf: '2026-11-02', rows: [
        { date: '2026-11-03', start: '09:00', end: '09:30', title: 'Earlier chat', keys: ['B1'] },
        { date: '2026-11-05', start: '13:30', end: '14:00', title: '1:1', keys: ['B1'] },
      ] },
      { type: 'task.add', kind: 'waiting', title: 'Access request', waitingOn: { text: 'Platform team' }, urgency: 'high' },
    ])).state
    const items = waitingOn(s, d('2026-11-04'))
    expect(items.map(w => [w.key, w.who, w.meeting])).toEqual([
      ['B2', 'Platform team', null],
      ['B1', 'Sam', 'Thu 13:30'],
    ])
    expect(items[1]?.unblocks).toEqual([{ key: 'A2', title: 'Publish the scorecard' }])
  })

  it('combines person and text, and uses the role in a sanitised workspace', () => {
    const { state, samId } = baseState('sanitised')
    const s = ok(run(state, [{ type: 'task.update', task: 'B1', patch: { waitingOn: { personId: samId, text: 'chasing by Friday' } } }])).state
    expect(waitingOn(s, d('2026-11-04'))[0]?.who).toBe('Product manager — chasing by Friday')
  })
})

describe('sprintPosition (sprint 7: Wed 28 Oct – Tue 10 Nov)', () => {
  it('reports first, middle and last days, with the external label', () => {
    const { state } = baseState()
    expect(sprintPosition(state, d('2026-10-28'))).toMatchObject({ n: 7, day: 1, length: 14, daysLeft: 13, isFirstDay: true, isLastDay: false, externalLabel: 'Tracker sprint 9' })
    expect(sprintPosition(state, d('2026-11-05'))).toMatchObject({ n: 7, day: 9, daysLeft: 5, isFirstDay: false })
    expect(sprintPosition(state, d('2026-11-10'))).toMatchObject({ n: 7, day: 14, daysLeft: 0, isLastDay: true })
  })

  it('is null without a sprint cadence', () => {
    const s = ok(run(baseState().state, [{ type: 'workspace.update', patch: { sprint: null } }])).state
    expect(sprintPosition(s, d('2026-11-05'))).toBeNull()
  })
})

describe('todayView and inProgress', () => {
  it("gathers today's meetings in time order, all-day entries apart, and the plan", () => {
    const { state } = baseState()
    const s = ok(run(state, [
      { type: 'focus.setSchedule', weekOf: '2026-11-02', rows: [
        { date: '2026-11-05', start: '15:00', title: 'Review' },
        { date: '2026-11-05', title: 'Release day' },
        { date: '2026-11-05', start: '09:00', title: 'Stand-up' },
        { date: '2026-11-06', start: '09:00', title: 'Tomorrow' },
      ] },
      { type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Draft' }] },
    ])).state
    const t = todayView(s, d('2026-11-05'))
    expect(t.label).toBe('Thu 5 Nov')
    expect(t.meetings.map(m => m.title)).toEqual(['Stand-up', 'Review'])
    expect(t.allDay.map(m => m.title)).toEqual(['Release day'])
    expect(t.plan.map(p => p.lead)).toEqual(['Draft'])
    expect(t.closed).toBe(false)
    expect(t.note).toBeNull()
    expect(inProgress(s).map(x => x.key)).toEqual(['A1'])
  })

  it('shows a closed day with its outcomes and note', () => {
    const { state } = baseState()
    const planned = ok(run(state, [{ type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Draft' }] }])).state
    const id = todayView(planned, d('2026-11-05')).plan[0]?.id
    const s = ok(run(planned, [{ type: 'focus.closeDay', date: '2026-11-05', outcomes: [{ planItemId: id, result: 'done', lead: 'Draft' }], note: 'A good day.' }])).state
    const t = todayView(s, d('2026-11-05'))
    expect(t.closed).toBe(true)
    expect(t.outcomes).toMatchObject([{ planItemId: id, result: 'done' }])
    expect(t.note).toBe('A good day.')
  })
})

describe('dueSoon and cutoffs', () => {
  it('includes overdue tasks and the window edge, but not beyond it', () => {
    const { state } = baseState()
    const s = ok(run(state, [
      { type: 'task.update', task: 'A3', patch: { due: '2026-11-01' } },
      { type: 'task.update', task: 'A2', patch: { due: '2026-11-19' } },
      { type: 'task.update', task: 'A1', patch: { due: '2026-11-20' } },
      { type: 'project.update', slug: 'scorecard', patch: { deadlines: [{ date: '2026-11-12', title: 'First publish', hard: true }] } },
    ])).state
    const items = dueSoon(s, d('2026-11-05'))
    expect(items.map(i => [i.date, i.kind, i.key, i.overdue, i.hard])).toEqual([
      ['2026-11-01', 'task', 'A3', true, false],
      ['2026-11-12', 'deadline', null, false, true],
      ['2026-11-19', 'task', 'A2', false, false],
    ])
  })

  it('includes leave that straddles the window and cutoffs inside it', () => {
    const { state, samId } = baseState()
    const s = ok(run(state, [
      { type: 'person.upsert', id: samId, ooo: [{ start: '2026-11-01', end: '2026-11-06', note: 'Leave' }, { start: '2026-12-20', end: '2027-01-05' }] },
      { type: 'project.update', slug: 'scorecard', patch: { cutoffs: [{ date: '2026-11-13', personId: samId, who: 'Product manager', what: 'Sign-off before leave' }] } },
    ])).state
    expect(cutoffs(s, d('2026-11-05')).map(c => [c.kind, c.start, c.who, c.what])).toEqual([
      ['ooo', '2026-11-01', 'Sam', 'Leave'],
      ['cutoff', '2026-11-13', 'Sam', 'Sign-off before leave'],
    ])
  })
})

describe('completedSince', () => {
  it('lists finished work, archived or not, newest first', () => {
    const { state } = baseState()
    const a = ok(run(state, [{ type: 'task.complete', task: 'A3' }], { at: '2026-11-02T01:00:00.000Z' })).state
    const b = ok(run(a, [{ type: 'sprint.close', n: 7 }, { type: 'task.drop', task: 'B1' }], { at: '2026-11-03T01:00:00.000Z' })).state
    expect(completedSince(b, d('2026-11-01')).map(c => [c.key, c.result, c.completedOn, c.sprint])).toEqual([
      ['B1', 'dropped', '2026-11-03', null],
      ['A3', 'done', '2026-11-02', 7],
    ])
    expect(completedSince(b, d('2026-11-03')).map(c => c.key)).toEqual(['B1'])
  })
})

describe('briefing', () => {
  const entry = (i: number): FileData<'activityEntry'> => ({
    schemaVersion: 1, id: `01JZ0000000000000000000${String(i).padStart(3, '0')}` as never, at: `2026-11-0${1 + (i % 4)}T0${i % 10}:00:00.000Z`,
    date: '2026-11-01' as never, actor: 'claude', type: 'flag', area: null, delta: `Entry ${i}`, pointers: [], keys: [], opId: null,
  })

  it('answers for the workspace-local date and caps activity, newest first', () => {
    const { state } = baseState()
    const b = briefing(state, new Date(Date.parse(WED_4_NOV)), { activity: Array.from({ length: 30 }, (_, i) => entry(i)) })
    expect(b.today).toBe('2026-11-04')
    expect(b.todayLabel).toBe('Wed 4 Nov')
    expect(b.week).toMatchObject({ weekOf: '2026-11-02', label: 'Week of 2 Nov 2026', exists: false })
    expect(b.sprint).toMatchObject({ n: 7, day: 8 })
    expect(b.inProgress.map(t => t.key)).toEqual(['A1'])
    expect(b.waitingOn.map(w => w.key)).toEqual(['B1'])
    expect(b.blocked.map(t => t.key)).toEqual(['A2'])
    expect(b.activity).toHaveLength(20)
    const ats = b.activity.map(a => a.at)
    expect([...ats].sort().reverse()).toEqual(ats)
  })

  it('carries no name in a sanitised workspace', () => {
    const { state } = baseState('sanitised')
    const text = JSON.stringify(briefing(state, new Date(Date.parse(WED_4_NOV))))
    expect(text).not.toContain('Sam')
    expect(text).toContain('Product manager')
  })
})
