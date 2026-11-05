/**
 * The planning skills' real workflows, as batches. Each must apply in full,
 * and every file it changes must survive a write and a re-read unchanged.
 */
import { describe, expect, it } from 'vitest'
import { applyBatch, type ApplySuccess } from './apply.ts'
import { prepareBatch } from './batch.ts'
import { changedFiles, filesFromState, stateFromFiles, type WorkspaceState } from './state.ts'
import { AT, baseState, ok, run } from './__fixtures__/workspace.ts'

function roundTrips(result: ApplySuccess): void {
  const files = filesFromState(result.state)
  for (const [path, content] of Object.entries(changedFiles(result.state, result.changed))) {
    expect(content, path).toBe(files[path])
  }
  expect(stateFromFiles(files)).toEqual(result.state)
}

const meetingOps = (samId: string) => [
  { type: 'task.add', ref: '$1', kind: 'action', title: 'Draw the target view', urgency: 'high', project: 'scorecard', tags: ['reporting'] },
  { type: 'task.add', ref: '$2', kind: 'waiting', title: 'Targets for six metrics', waitingOn: { personId: samId }, urgency: 'high' },
  { type: 'task.add', ref: '$3', kind: 'action', title: 'Add targets to the view', dependsOn: ['$1', '$2'] },
  { type: 'person.upsert', name: 'Alex', role: 'Delivery lead' },
  { type: 'term.upsert', term: 'Target view', meaning: 'The scorecard module comparing actuals to targets.', project: 'scorecard' },
  {
    type: 'meeting.save', date: '2026-11-05', slug: 'scorecard-check-in', title: 'Scorecard check-in', input: 'transcript',
    people: [samId], projects: ['scorecard'], keys: ['$1', '$2', '$3'],
    body: '## Meeting Summary — Scorecard check-in (2026-11-05)\n\n### 📋 Session Overview\n\nAgreed the target view.',
  },
  { type: 'activity.log', entry: 'session', area: 'meeting', delta: 'Scorecard check-in processed — three tasks added', pointers: ['meetings/2026-11-05-scorecard-check-in.md'], keys: ['$1', '$2', '$3'] },
] as const

describe('meeting-pipeline', () => {
  it('writes tasks, a person, a term, the meeting and a log line in one batch', () => {
    const { state, samId } = baseState()
    const r = ok(run(state, [...meetingOps(samId)]))
    expect(r.keyMap).toEqual({ $1: 'A4', $2: 'B2', $3: 'A5' })
    expect(r.changed).toEqual(['glossary.json', 'meetings/2026-11-05-scorecard-check-in.md', 'people.json', 'tasks.json'])
    expect(r.state.meetings['meetings/2026-11-05-scorecard-check-in.md']?.frontmatter.keys).toEqual(['A4', 'B2', 'A5'])
    expect(r.activity.filter(e => e.type === 'session')).toHaveLength(1)
    expect(r.activity.filter(e => e.type === 'event').map(e => e.delta)).toEqual([
      'Added A4 — Draw the target view', 'Added B2 — Targets for six metrics', 'Added A5 — Add targets to the view',
    ])
    expect(r.summary.map(s => s.text)).toEqual(expect.arrayContaining([
      'Add A4 "Draw the target view" (To Do, 🔴) as $1',
      'Add person: Alex (Delivery lead)',
      'Add term: Target view',
    ]))
    roundTrips(r)
  })

  it('applies a partial confirmation: the same batch without the person', () => {
    const { state, samId } = baseState()
    const ops = meetingOps(samId).filter(op => op.type !== 'person.upsert')
    const r = ok(run(state, [...ops]))
    expect(r.keyMap).toEqual({ $1: 'A4', $2: 'B2', $3: 'A5' })
    expect(r.state.people.people).toHaveLength(1)
    roundTrips(r)
  })

  it('a dry run and the real run agree', () => {
    const { state, samId } = baseState()
    const batch = prepareBatch({ ops: [...meetingOps(samId)] }, { opId: 'meeting-1', at: AT, actor: 'claude' })
    expect(applyBatch(state, batch)).toEqual(applyBatch(state, batch))
  })
})

function weekDraft(state: WorkspaceState): ApplySuccess {
  return ok(run(state, [
    {
      type: 'focus.setSchedule', weekOf: '2026-11-02', rows: [
        { date: '2026-11-04', start: '10:00', end: '10:15', title: 'Stand-up' },
        { date: '2026-11-05', start: '13:30', end: '14:00', title: '1:1', relevance: 'high', note: 'Target sign-off', keys: ['B1'], important: true },
        { date: '2026-11-05', start: '18:00', end: '19:00', personal: true },
        { date: '2026-11-06', title: 'Focus day', relevance: 'low' },
      ],
    },
    { type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Draft the target view', keys: ['A1'], urgency: 'high' }, { lead: 'Prep the 1:1', keys: ['B1'] }] },
    { type: 'focus.setCallouts', weekOf: '2026-11-02', items: [{ lead: 'Sprint 7 closes Tue 10 Nov', text: 'Review, retro and planning.' }] },
    {
      type: 'focus.setPriorities', weekOf: '2026-11-02', items: [
        { tier: 'focus', lead: 'Draft the scorecard', detail: 'Gates the publish.', keys: ['A1'] },
        { tier: 'next', lead: 'Publish', keys: ['A2'] },
        { tier: 'ongoing', lead: 'Tidy the backlog', keys: ['A3'] },
      ],
    },
    { type: 'focus.setLastWeek', weekOf: '2026-11-02', items: [{ text: 'Layout agreed in principle.' }] },
    { type: 'task.add', kind: 'waiting', title: 'Owner for open definitions', waitingOn: { text: 'Product manager to assign' } },
    { type: 'keepInMind.add', lead: 'Definitions are handed over, not carried.', text: 'Raise and hand over.' },
  ]))
}

describe('focus-drafter', () => {
  it('standard mode: drafts a whole week', () => {
    const r = weekDraft(baseState().state)
    const week = r.state.focusWeeks['2026-11-02']
    expect(week?.schedule).toHaveLength(4)
    expect(week?.days.map(d => d.date)).toEqual(['2026-11-05'])
    expect(week?.priorities.map(p => p.tier)).toEqual(['focus', 'next', 'ongoing'])
    expect(r.changed).toEqual(['focus/2026-11-02.json', 'focus/keep-in-mind.json', 'tasks.json'])
    roundTrips(r)
  })

  it('EOD mode: closes the day, refreshes priorities and adds a blocker', () => {
    const drafted = weekDraft(baseState().state)
    const [draft, prep] = drafted.state.focusWeeks['2026-11-02']?.days[0]?.plan ?? []
    const r = ok(run(drafted.state, [
      {
        type: 'focus.closeDay', date: '2026-11-05', outcomes: [
          { planItemId: draft?.id, result: 'carried', lead: 'Draft the target view', note: 'Needs targets first', keys: ['A1'] },
          { planItemId: prep?.id, result: 'done', lead: 'Prep the 1:1', keys: ['B1'] },
        ],
      },
      { type: 'task.add', ref: '$1', kind: 'waiting', title: 'Target values for two metrics', waitingOn: { text: 'Commercial analyst' } },
      { type: 'task.update', task: 'A1', patch: { dependsOn: ['$1'] } },
      { type: 'focus.setPriorities', weekOf: '2026-11-02', items: [{ tier: 'focus', lead: 'Chase target values', keys: ['$1'] }, { tier: 'next', lead: 'Draft', keys: ['A1'] }] },
    ], { at: '2026-11-05T07:00:00.000Z' }))
    expect(r.state.focusWeeks['2026-11-02']?.days[0]?.closedAt).toBe('2026-11-05T07:00:00.000Z')
    expect(r.state.tasks.tasks.find(t => t.key === 'A1')?.dependsOn).toEqual(['B3'])
    roundTrips(r)
  })
})

describe('sanitised workspace', () => {
  it('refuses a named person and meeting notes, and warns about names in prose', () => {
    const { state } = baseState('sanitised')
    const named = run(state, [{ type: 'person.upsert', name: 'Jane', role: 'Analyst' }])
    expect(named).toMatchObject({ ok: false, errors: [{ code: 'policy' }] })

    const meeting = run(state, [{ type: 'meeting.save', date: '2026-11-05', slug: 'x', title: 'X', input: 'notes', body: 'x' }])
    expect(meeting).toMatchObject({ ok: false, errors: [{ code: 'policy' }] })

    const prose = ok(run(state, [{ type: 'task.add', kind: 'waiting', title: 'Feedback from Jane Doe on the Scorecard', waitingOn: { text: 'Product manager' } }]))
    expect(prose.warnings).toEqual([expect.objectContaining({ code: 'possible-name', message: expect.stringContaining('Jane Doe') })])
  })

  it('accepts role-only people', () => {
    const r = ok(run(baseState('sanitised').state, [{ type: 'person.upsert', role: 'Commercial analyst' }]))
    expect(r.state.people.people.map(p => p.role)).toEqual(['Product manager', 'Commercial analyst'])
  })
})
