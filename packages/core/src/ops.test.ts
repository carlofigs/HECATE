import { describe, expect, it } from 'vitest'
import type { WorkspaceState } from './state.ts'
import { baseState, ok, run } from './__fixtures__/workspace.ts'

const keysIn = (state: WorkspaceState, status: string): string[] =>
  state.tasks.tasks
    .filter(t => t.status === status)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.key.localeCompare(b.key)))
    .map(t => t.key)

const task = (state: WorkspaceState, key: string) => state.tasks.tasks.find(t => t.key === key)
const failsWith = (result: ReturnType<typeof run>, code: string, message?: RegExp): void => {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.errors[0]?.code).toBe(code)
  if (message) expect(result.errors[0]?.message).toMatch(message)
}

describe('task ops', () => {
  it('add: defaults to the first todo status, appends, adds new tags with a warning', () => {
    const { state } = baseState()
    const r = ok(run(state, [{ type: 'task.add', kind: 'action', title: 'New one', tags: ['Fresh Tag'] }]))
    expect(task(r.state, 'A4')).toMatchObject({ status: 'todo', kind: 'action', tags: ['fresh-tag'], completedAt: null })
    expect(keysIn(r.state, 'todo').at(-1)).toBe('A4')
    expect(r.state.workspace.tags.map(t => t.id)).toContain('fresh-tag')
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'new-tag' })])
    expect(r.changed).toEqual(['tasks.json', 'workspace.json'])
    expect(r.activity.map(e => e.delta)).toEqual(['Added A4 — New one'])
  })

  it('add: refuses waitingOn on an action and an unknown status', () => {
    const { state, samId } = baseState()
    failsWith(run(state, [{ type: 'task.add', kind: 'action', title: 'x', waitingOn: { personId: samId } }]), 'invalid')
    failsWith(run(state, [{ type: 'task.add', kind: 'action', title: 'x', status: 'someday' }]), 'not-found')
  })

  it('complete, drop and reopen keep completedAt and the log consistent', () => {
    const { state } = baseState()
    const done = ok(run(state, [{ type: 'task.complete', task: 'A1' }]))
    expect(task(done.state, 'A1')).toMatchObject({ status: 'done', completedAt: '2026-11-04T23:00:00.000Z' })
    expect(done.activity[0]?.delta).toBe('Completed A1 — Draft the scorecard')

    const reopened = ok(run(done.state, [{ type: 'task.reopen', task: 'A1', status: 'in-progress' }]))
    expect(task(reopened.state, 'A1')).toMatchObject({ status: 'in-progress', completedAt: null })
    failsWith(run(reopened.state, [{ type: 'task.reopen', task: 'A1' }]), 'conflict', /already open/)

    const dropped = ok(run(state, [{ type: 'task.drop', task: 'A3' }]))
    expect(task(dropped.state, 'A3')).toMatchObject({ status: 'not-doing' })
    expect(dropped.activity[0]?.delta).toMatch(/^Dropped A3/)
  })

  it('update: changes only what the patch names and checks references', () => {
    const { state } = baseState()
    const r = ok(run(state, [{ type: 'task.update', task: 'A3', patch: { title: 'Tidy it', due: '2026-11-20', project: 'scorecard' } }]))
    expect(task(r.state, 'A3')).toMatchObject({ title: 'Tidy it', due: '2026-11-20', urgency: null, tags: [] })
    failsWith(run(state, [{ type: 'task.update', task: 'A1', patch: { waitingOn: { text: 'Someone' } } }]), 'invalid', /only waiting/)
    failsWith(run(state, [{ type: 'task.update', task: 'A1', patch: { dependsOn: ['A1'] } }]), 'invalid', /itself/)
  })

  it('delete: refused while other tasks depend on it; keys are never reused', () => {
    const { state } = baseState()
    failsWith(run(state, [{ type: 'task.delete', task: 'B1' }]), 'conflict', /A2 depend/)
    const r = ok(run(state, [{ type: 'task.delete', task: 'A3' }, { type: 'task.add', kind: 'action', title: 'After delete' }]))
    expect(task(r.state, 'A3')).toBeUndefined()
    expect(task(r.state, 'A4')?.title).toBe('After delete')
  })
})

describe('ordering', () => {
  it('moves relative to a neighbour, or to the top', () => {
    const { state } = baseState()
    expect(keysIn(state, 'todo')).toEqual(['B1', 'A2', 'A3'])
    const a = ok(run(state, [{ type: 'task.move', task: 'A3', status: 'todo', after: 'B1' }]))
    expect(keysIn(a.state, 'todo')).toEqual(['B1', 'A3', 'A2'])
    const b = ok(run(a.state, [{ type: 'task.move', task: 'A2', status: 'todo', after: null }]))
    expect(keysIn(b.state, 'todo')).toEqual(['A2', 'B1', 'A3'])
    const c = ok(run(b.state, [{ type: 'task.move', task: 'A1', status: 'todo', after: 'B1' }]))
    expect(keysIn(c.state, 'todo')).toEqual(['A2', 'B1', 'A1', 'A3'])
    expect(keysIn(c.state, 'in-progress')).toEqual([])
  })

  it('can always insert between two adjacent tasks', () => {
    let { state } = baseState()
    for (let i = 0; i < 30; i++) {
      state = ok(run(state, [{ type: 'task.add', kind: 'action', title: `Squeeze ${i}`, after: 'B1' }])).state
    }
    const order = keysIn(state, 'todo')
    expect(order[0]).toBe('B1')
    expect(order[1]).toBe('A33')
    expect(order.at(-2)).toBe('A2')
  })

  it('re-spreads a column whose orders collide instead of failing', () => {
    const { state } = baseState()
    const tied = JSON.parse(JSON.stringify(state)) as WorkspaceState
    for (const t of tied.tasks.tasks) if (t.status === 'todo') t.order = 'a1'
    const r = ok(run(tied, [{ type: 'task.move', task: 'A3', status: 'todo', after: 'B1' }]))
    const order = keysIn(r.state, 'todo')
    expect(order.indexOf('A3')).toBe(order.indexOf('B1') + 1)
  })

  it('refuses to place after a task in another status', () => {
    const { state } = baseState()
    failsWith(run(state, [{ type: 'task.move', task: 'A3', status: 'todo', after: 'A1' }]), 'not-found', /not in "todo"/)
  })
})

describe('sprint.close', () => {
  // Sprint 7 runs Wed 28 Oct – Tue 10 Nov 2026 (Sydney).
  const TUE_10_NOV_0900 = '2026-11-09T22:00:00.000Z'
  const WED_11_NOV_0100 = '2026-11-10T14:00:00.000Z'
  const WED_11_NOV_1000 = '2026-11-10T23:00:00.000Z'

  function closable() {
    const { state } = baseState()
    const a = ok(run(state, [{ type: 'task.complete', task: 'A3' }, { type: 'task.drop', task: 'B1' }], { at: TUE_10_NOV_0900 }))
    const b = ok(run(a.state, [{ type: 'task.add', kind: 'action', title: 'Late finish', status: 'done' }], { at: WED_11_NOV_0100 }))
    return b.state
  }

  it('on planning day, closes the sprint that just ended and moves exactly its finished tasks', () => {
    const r = ok(run(closable(), [{ type: 'sprint.close', retro: 'Steady.' }], { at: WED_11_NOV_1000 }))
    const sprint = r.state.sprints[7]
    expect(sprint).toMatchObject({ n: 7, start: '2026-10-28', end: '2026-11-10', closedAt: WED_11_NOV_1000, retro: 'Steady.', carried: ['A1'] })
    expect(sprint?.done.map(t => t.key)).toEqual(['A3'])
    expect(sprint?.dropped.map(t => t.key)).toEqual(['B1'])
    expect(sprint?.velocity).toEqual({ done: 1, carried: 1, dropped: 1 })
    expect(r.state.tasks.tasks.map(t => t.key).sort()).toEqual(['A1', 'A2', 'A4'])
    expect(r.changed).toEqual(['sprints/7.json', 'tasks.json'])
    expect(r.activity[0]?.delta).toBe('Closed sprint 7: 1 done, 1 carried, 1 dropped')
  })

  it('keeps a dependency on an archived task valid', () => {
    const r = ok(run(closable(), [{ type: 'sprint.close' }], { at: WED_11_NOV_1000 }))
    expect(task(r.state, 'A2')?.dependsOn).toEqual(['A1', 'B1'])
  })

  it('refuses to close twice, to close a future sprint, or to change an archived task', () => {
    const closed = ok(run(closable(), [{ type: 'sprint.close', n: 7 }], { at: WED_11_NOV_1000 })).state
    failsWith(run(closed, [{ type: 'sprint.close', n: 7 }], { at: WED_11_NOV_1000 }), 'conflict', /already closed/)
    failsWith(run(closed, [{ type: 'sprint.close', n: 9 }], { at: WED_11_NOV_1000 }), 'invalid', /not started/)
    failsWith(run(closed, [{ type: 'task.reopen', task: 'A3' }], { at: WED_11_NOV_1000 }), 'conflict', /archived when sprint 7 closed/)
  })

  it('warns when closing before the last day', () => {
    const r = ok(run(baseState().state, [{ type: 'sprint.close', n: 7 }]))
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'early-close' })])
  })

  it('start and update create and edit a sprint', () => {
    const { state } = baseState()
    const r = ok(run(state, [{ type: 'sprint.start', goal: 'Ship it.' }]))
    expect(r.state.sprints[7]).toMatchObject({ n: 7, goal: 'Ship it.', closedAt: null })
    failsWith(run(r.state, [{ type: 'sprint.start', n: 7 }]), 'conflict')
    failsWith(run(state, [{ type: 'sprint.update', n: 3, goal: 'x' }]), 'not-found')
  })
})

describe('workspace and profile', () => {
  it('refuses to remove a status or tag in use, an unknown zone, or going sanitised with named people', () => {
    const { state } = baseState()
    const statuses = state.workspace.statuses.filter(s => s.id !== 'in-progress')
    failsWith(run(state, [{ type: 'workspace.update', patch: { statuses } }]), 'conflict', /in-progress/)
    failsWith(run(state, [{ type: 'workspace.update', patch: { tags: [] } }]), 'conflict', /reporting/)
    failsWith(run(state, [{ type: 'workspace.update', patch: { timezone: 'Mars/Base' } }]), 'invalid')
    failsWith(run(state, [{ type: 'workspace.update', patch: { policy: 'sanitised' } }]), 'policy')
  })

  it('updates settings and the profile', () => {
    const { state } = baseState()
    const r = ok(run(state, [
      { type: 'workspace.update', patch: { name: 'Renamed', workdays: [5, 1, 2, 3, 4, 1] } },
      { type: 'profile.update', patch: { me: 'Analyst.', responsibilities: [{ name: 'Weekly run', cadence: 'Mondays' }] } },
    ]))
    expect(r.state.workspace).toMatchObject({ name: 'Renamed', workdays: [1, 2, 3, 4, 5] })
    expect(r.state.profile.responsibilities[0]).toMatchObject({ name: 'Weekly run', notes: null })
  })
})

describe('focus ops', () => {
  it('creates the week on first use; personal schedule rows keep only their slot', () => {
    const { state } = baseState()
    const r = ok(run(state, [{
      type: 'focus.setSchedule', weekOf: '2026-11-02', rows: [
        { date: '2026-11-05', start: '13:00', end: '13:30', title: '1:1', relevance: 'high', keys: ['B1'], important: true },
        { date: '2026-11-05', start: '09:00', end: '10:00', personal: true, title: 'Dentist', note: 'private', keys: ['A1'] },
      ],
    }]))
    const week = r.state.focusWeeks['2026-11-02']
    expect(week?.schedule.map(s => s.start)).toEqual(['09:00', '13:00'])
    expect(week?.schedule[0]).toMatchObject({ personal: true, title: null, note: null, keys: [], important: false })
    expect(week?.scheduleCapturedAt).toBe('2026-11-04T23:00:00.000Z')
    expect(r.changed).toEqual(['focus/2026-11-02.json'])
  })

  it('refuses a week that does not start on Monday', () => {
    failsWith(run(baseState().state, [{ type: 'focus.setPriorities', weekOf: '2026-11-03', items: [] }]), 'invalid', /not a Monday/)
  })

  it('plans a day and closes it against its plan items', () => {
    const { state } = baseState()
    const planned = ok(run(state, [{ type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Draft', keys: ['A1'] }, { lead: 'Tidy', keys: ['A3'] }] }]))
    const [draft, tidy] = planned.state.focusWeeks['2026-11-02']?.days[0]?.plan ?? []
    const closed = ok(run(planned.state, [{
      type: 'focus.closeDay', date: '2026-11-05', note: 'Good day.', outcomes: [
        { planItemId: draft?.id, result: 'carried', lead: 'Draft', note: 'Waiting on sign-off', keys: ['A1'] },
        { planItemId: tidy?.id, result: 'done', lead: 'Tidy', keys: ['A3'] },
        { result: 'done', lead: 'Unplanned fix' },
      ],
    }]))
    const day = closed.state.focusWeeks['2026-11-02']?.days[0]
    expect(day).toMatchObject({ closedAt: '2026-11-04T23:00:00.000Z', note: 'Good day.' })
    expect(day?.outcomes.map(o => o.result)).toEqual(['carried', 'done', 'done'])
    expect(closed.summary[0]?.text).toBe('Close Thu 5 Nov: ✅ 2 · 🔄 1 · ❌ 0')
    failsWith(run(planned.state, [{ type: 'focus.closeDay', date: '2026-11-06', outcomes: [{ planItemId: draft?.id, result: 'done', lead: 'x' }] }]), 'not-found')
  })

  it('upserts and removes free-form sections', () => {
    const { state } = baseState()
    const a = ok(run(state, [{ type: 'focus.setSection', weekOf: '2026-11-02', section: { title: 'Risks', content: 'One.' } }]))
    const b = ok(run(a.state, [{ type: 'focus.setSection', weekOf: '2026-11-02', section: { title: 'Risks', content: 'Two.' } }]))
    expect(b.state.focusWeeks['2026-11-02']?.sections).toEqual([{ id: 'risks', title: 'Risks', content: 'Two.' }])
    const c = ok(run(b.state, [{ type: 'focus.removeSection', weekOf: '2026-11-02', id: 'risks' }]))
    expect(c.state.focusWeeks['2026-11-02']?.sections).toEqual([])
    failsWith(run(c.state, [{ type: 'focus.removeSection', weekOf: '2026-11-02', id: 'risks' }]), 'not-found')
  })

  it('adds, updates and removes keep-in-mind items', () => {
    const { state } = baseState()
    const a = ok(run(state, [{ type: 'keepInMind.add', lead: 'Hand over, do not carry.', text: 'Definitions go to their owner.', project: 'scorecard' }]))
    const id = a.state.keepInMind.items[0]?.id as string
    const b = ok(run(a.state, [{ type: 'keepInMind.update', id, patch: { text: 'Updated.' } }]))
    expect(b.state.keepInMind.items[0]).toMatchObject({ text: 'Updated.', lead: 'Hand over, do not carry.' })
    const c = ok(run(b.state, [{ type: 'keepInMind.remove', id }]))
    expect(c.state.keepInMind.items).toEqual([])
    failsWith(run(c.state, [{ type: 'keepInMind.remove', id }]), 'not-found')
  })
})

describe('project ops', () => {
  it('numbers open questions and requires a resolution to resolve one', () => {
    const { state } = baseState()
    const a = ok(run(state, [
      { type: 'project.addOpenQuestion', slug: 'scorecard', question: 'Targets?', blocker: true },
      { type: 'project.addOpenQuestion', slug: 'scorecard', question: 'Cadence?' },
    ]))
    expect(a.state.projects.scorecard?.openQuestions.map(q => [q.n, q.blocker, q.status])).toEqual([[1, true, 'open'], [2, false, 'open']])
    expect(a.summary[0]?.text).toBe('Add OQ-01 to "Scorecard" (blocker)')
    failsWith(run(a.state, [{ type: 'project.resolveOpenQuestion', slug: 'scorecard', n: 1, status: 'resolved' }]), 'invalid')
    const b = ok(run(a.state, [{ type: 'project.resolveOpenQuestion', slug: 'scorecard', n: 1, status: 'resolved', resolution: 'Six targets.' }]))
    expect(b.state.projects.scorecard?.openQuestions[0]).toMatchObject({ status: 'resolved', resolution: 'Six targets.' })
  })

  it('updates fields and replaces lists, and refuses a duplicate slug', () => {
    const { state, samId } = baseState()
    const r = ok(run(state, [{
      type: 'project.update', slug: 'scorecard', patch: {
        phase: 'Build',
        deadlines: [{ date: '2026-11-20', title: 'First publish', hard: true, keys: ['A2'] }],
        cutoffs: [{ date: '2026-11-13', personId: samId, who: 'Product manager', what: 'Sign-off before leave' }],
        nextActions: [{ text: 'Agree layout', keys: ['B1'] }, { text: 'Draft', keys: ['A1'] }],
      },
    }]))
    const p = r.state.projects.scorecard
    expect(p?.phase).toBe('Build')
    expect(p?.deadlines[0]).toMatchObject({ hard: true, keys: ['A2'], note: null })
    expect(p?.nextActions.map(a => a.text)).toEqual(['Agree layout', 'Draft'])
    failsWith(run(state, [{ type: 'project.create', slug: 'scorecard', name: 'Again' }]), 'conflict')
  })
})

describe('people and glossary', () => {
  it('updates a person in place and refuses to remove one still referenced', () => {
    const { state, samId } = baseState()
    const r = ok(run(state, [{ type: 'person.upsert', id: samId, ooo: [{ start: '2026-11-16', end: '2026-11-20' }] }]))
    expect(r.state.people.people[0]).toMatchObject({ name: 'Sam', role: 'Product manager', ooo: [{ start: '2026-11-16', end: '2026-11-20', note: null }] })
    failsWith(run(state, [{ type: 'person.remove', id: samId }]), 'conflict', /task B1/)
    failsWith(run(state, [{ type: 'person.upsert', name: 'Alex' }]), 'invalid', /needs a role/)
  })

  /** B1 waits on Sam, with this text; it is dropped and archived when sprint 7 closes. */
  function archivedB1(policy: 'open' | 'sanitised' = 'open', text?: string, role?: string) {
    const { state, samId } = baseState(policy)
    const before: Parameters<typeof run>[1] = [
      ...(text ? [{ type: 'task.update', task: 'B1', patch: { waitingOn: { personId: samId, text } } } as const] : []),
      ...(role ? [{ type: 'person.upsert', id: samId, role } as const] : []),
      { type: 'task.drop', task: 'B1' },
    ]
    const dropped = ok(run(state, before, { at: '2026-11-09T22:00:00.000Z' })).state
    return { state: ok(run(dropped, [{ type: 'sprint.close', n: 7 }], { at: '2026-11-10T23:00:00.000Z' })).state, samId }
  }
  const archivedWaitingOn = (s: WorkspaceState) => s.sprints[7]?.dropped.find(t => t.key === 'B1')?.waitingOn

  it('removes a person an archived task waited on, keeping who it was as text', () => {
    const { state, samId } = archivedB1('open', 'Layout pack')
    expect(archivedWaitingOn(state)).toEqual({ personId: samId, text: 'Layout pack' })
    const r = ok(run(state, [{ type: 'person.remove', id: samId }]))
    expect(r.state.people.people).toEqual([])
    expect(archivedWaitingOn(r.state)).toEqual({ personId: null, text: 'Sam — Layout pack' })
    expect(r.changed).toEqual(['people.json', 'sprints/7.json'])
    expect(r.summary.map(s => s.text)).toEqual(['Remove person: Sam (Product manager) (B1 keeps them as text)'])
  })

  it('keeps the label alone without text, and the role in a sanitised workspace', () => {
    const open = archivedB1()
    expect(archivedWaitingOn(ok(run(open.state, [{ type: 'person.remove', id: open.samId }])).state)).toEqual({ personId: null, text: 'Sam' })
    const sanitised = archivedB1('sanitised')
    expect(archivedWaitingOn(ok(run(sanitised.state, [{ type: 'person.remove', id: sanitised.samId }])).state)).toEqual({ personId: null, text: 'Product manager' })
  })

  it('cuts a label and text longer than a line to fit one', () => {
    const { state, samId } = archivedB1('sanitised', `${'Note '.repeat(60)}end`, `${'Lead '.repeat(60)}role`)
    const text = archivedWaitingOn(ok(run(state, [{ type: 'person.remove', id: samId }])).state)?.text ?? ''
    expect(text).toHaveLength(500)
    expect(text).toMatch(/^Lead Lead .* — Note .*\S…$/)
  })

  it('matches terms by name and requires a meaning for a new one', () => {
    const { state } = baseState()
    const a = ok(run(state, [{ type: 'term.upsert', term: 'BAU', meaning: 'Business as usual.' }]))
    const b = ok(run(a.state, [{ type: 'term.upsert', term: 'bau', aliases: ['Run work'] }]))
    expect(b.state.glossary.terms).toHaveLength(1)
    expect(b.state.glossary.terms[0]).toMatchObject({ term: 'bau', aliases: ['Run work'], meaning: 'Business as usual.' })
    failsWith(run(state, [{ type: 'term.upsert', term: 'OKR' }]), 'invalid', /meaning/)
  })
})

describe('meetings, references and the activity log', () => {
  it('saves meeting notes in an open workspace', () => {
    const { state, samId } = baseState()
    const r = ok(run(state, [{
      type: 'meeting.save', date: '2026-11-05', slug: 'check-in', title: 'Scorecard check-in', input: 'notes',
      people: [samId], projects: ['scorecard'], keys: ['A1'], body: '## Summary\n\nAgreed the layout.',
    }]))
    expect(r.changed).toEqual(['meetings/2026-11-05-check-in.md'])
    expect(r.state.meetings['meetings/2026-11-05-check-in.md']?.frontmatter).toMatchObject({ title: 'Scorecard check-in', keys: ['A1'], conflicts: 0 })
  })

  it('logs a line, adding a new area with a warning, and refuses an over-long line', () => {
    const { state } = baseState()
    const r = ok(run(state, [{ type: 'activity.log', entry: 'session', area: 'ES', delta: 'A1 draft shared', pointers: ['tasks.json'], keys: ['A1'] }]))
    expect(r.activity).toEqual([expect.objectContaining({ type: 'session', area: 'es', delta: 'A1 draft shared', keys: ['A1'] })])
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'new-area' })])
    expect(r.changed).toEqual(['workspace.json'])
    failsWith(run(state, [{ type: 'activity.log', entry: 'flag', delta: 'x'.repeat(201) }]), 'invalid', /200/)
  })
})
