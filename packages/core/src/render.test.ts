/**
 * Golden files: the exact markdown the skills will read. They are committed
 * under __fixtures__/rendered/ so a change in output shows up in review.
 * Every expectation holds under both UTC and Australia/Sydney.
 */
import { describe, expect, it } from 'vitest'
import { applyBatch } from './apply.ts'
import { prepareBatch } from './batch.ts'
import { isoDate } from './dates.ts'
import { renderBriefing, renderErrors, renderFocusWeek, renderPreview } from './views/render.ts'
import { briefing } from './views/selectors.ts'
import type { WorkspaceState } from './state.ts'
import { AT, baseState, ok, run } from './__fixtures__/workspace.ts'

const d = isoDate
const golden = (name: string) => `./__fixtures__/rendered/${name}.md`
const MON_9AM = '2026-11-01T22:00:00.000Z'
const WED_5PM = '2026-11-04T06:00:00.000Z'

/** The week drafted on Monday morning: schedule, plans, priorities, waiting items. */
function drafted(policy: 'open' | 'sanitised' = 'open'): WorkspaceState {
  const { state } = baseState(policy)
  return ok(run(state, [
    {
      type: 'focus.setSchedule', weekOf: '2026-11-02', rows: [
        { date: '2026-11-02', start: '09:30', end: '09:45', title: 'Stand-up' },
        { date: '2026-11-04', start: '09:30', end: '09:45', title: 'Stand-up' },
        { date: '2026-11-05', start: '13:30', end: '14:00', title: '1:1 with the product manager', relevance: 'high', note: 'Layout sign-off', keys: ['B1'], important: true },
        { date: '2026-11-05', start: '18:00', end: '19:00', personal: true },
        { date: '2026-11-06', title: 'Focus day', relevance: 'low', note: 'Best day for deep work' },
        { date: '2026-11-07', start: '10:00', end: '12:00', personal: true },
      ],
    },
    { type: 'focus.setPlan', date: '2026-11-02', items: [{ lead: 'Draft the scorecard', detail: 'Start with the target view.', keys: ['A1'], urgency: 'high' }] },
    { type: 'focus.setPlan', date: '2026-11-04', items: [{ lead: 'Draft the scorecard', keys: ['A1'], urgency: 'high' }, { lead: 'Tidy the backlog', keys: ['A3'] }] },
    { type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Prep the 1:1', detail: 'Bring the two layout options.', keys: ['B1'], urgency: 'high' }, { lead: 'Draft the scorecard', keys: ['A1'] }] },
    { type: 'focus.setCallouts', weekOf: '2026-11-02', items: [{ lead: 'Sprint 7 closes Tue 10 Nov.', text: 'Review, retro and planning that day.' }] },
    {
      type: 'focus.setPriorities', weekOf: '2026-11-02', items: [
        { tier: 'focus', lead: 'Draft the scorecard', detail: 'Gates the publish step.', keys: ['A1'] },
        { tier: 'next', lead: 'Publish the scorecard', keys: ['A2'] },
        { tier: 'ongoing', lead: 'Tidy the backlog', keys: ['A3'] },
      ],
    },
    { type: 'focus.setLastWeek', weekOf: '2026-11-02', items: [{ text: 'Layout agreed in principle.' }, { text: 'Backlog cut to live work.' }] },
    { type: 'task.add', kind: 'waiting', title: 'Owner for the open definitions', waitingOn: { text: 'Product manager to assign' } },
    { type: 'keepInMind.add', lead: 'Definitions are handed over, not carried.', text: 'Raise them and hand them to the owner.' },
    { type: 'focus.setSection', weekOf: '2026-11-02', section: { title: 'Notes', content: 'Anything that does not fit above.' } },
  ], { at: MON_9AM })).state
}

/** Wednesday evening: the day closed with outcomes. */
function wednesdayClosed(): WorkspaceState {
  const state = drafted()
  const [draft, tidy] = state.focusWeeks['2026-11-02']?.days.find(x => x.date === '2026-11-04')?.plan ?? []
  return ok(run(state, [
    {
      type: 'focus.closeDay', date: '2026-11-04', outcomes: [
        { planItemId: draft?.id, result: 'carried', lead: 'Draft the scorecard', note: 'Waiting on the layout sign-off', keys: ['A1'] },
        { planItemId: tidy?.id, result: 'done', lead: 'Tidy the backlog', note: 'Cut to live work', keys: ['A3'] },
      ],
    },
    { type: 'task.complete', task: 'A3' },
  ], { at: WED_5PM })).state
}

describe('renderFocusWeek', () => {
  it('Thursday, after Wednesday closed: Today, the Done day, and every section', async () => {
    await expect(renderFocusWeek(wednesdayClosed(), d('2026-11-02'), { today: d('2026-11-05') })).toMatchFileSnapshot(golden('focus-week-thursday'))
  })

  it('Monday morning, nothing closed yet', async () => {
    await expect(renderFocusWeek(drafted(), d('2026-11-02'), { today: d('2026-11-02') })).toMatchFileSnapshot(golden('focus-week-monday'))
  })

  it('a sanitised workspace shows roles, never names', async () => {
    const text = renderFocusWeek(drafted('sanitised'), d('2026-11-02'), { today: d('2026-11-05') })
    expect(text).not.toContain('Sam')
    await expect(text).toMatchFileSnapshot(golden('focus-week-sanitised'))
  })

  it('leaves out Today when today is outside the week, and Today once the day is closed', () => {
    const later = renderFocusWeek(wednesdayClosed(), d('2026-11-02'), { today: d('2026-11-12') })
    expect(later).not.toContain('## Today')
    expect(later).toContain('## Wed 4 Nov — Done')
    const eod = renderFocusWeek(wednesdayClosed(), d('2026-11-02'), { today: d('2026-11-04') })
    expect(eod).not.toContain('## Today')
  })

  it('renders a week that does not exist yet as empty, not broken', () => {
    const text = renderFocusWeek(baseState().state, d('2026-11-09'), { today: d('2026-11-09') })
    expect(text).toContain('# Week of 9 Nov 2026')
    expect(text).toContain('## Waiting On')
    expect(text).toContain('## Keep in Mind\n\nNothing.')
    expect(text).not.toContain('## Week at a Glance')
  })

  it('keeps tables intact when a title contains a pipe or a line break', () => {
    const { state } = baseState()
    const s = ok(run(state, [
      { type: 'task.add', kind: 'waiting', title: 'Numbers | targets', waitingOn: { text: 'Finance' } },
      { type: 'focus.setSchedule', weekOf: '2026-11-02', rows: [{ date: '2026-11-05', start: '10:00', title: 'Plan | review', note: 'Two | parts' }] },
    ])).state
    const text = renderFocusWeek(s, d('2026-11-02'), { today: d('2026-11-05') })
    expect(text).toContain('| **B2** Numbers \\| targets | Finance | — |')
    expect(text).toContain('| Thu 5 Nov | 10:00 | Plan \\| review | Two \\| parts |')
  })
})

describe('previews and errors', () => {
  it('a dry run of a meeting batch', async () => {
    const { state, samId } = baseState()
    const batch = prepareBatch({
      ops: [
        { type: 'task.add', ref: '$1', kind: 'action', title: 'Draw the target view', urgency: 'high', project: 'scorecard', tags: ['#Targets'] },
        { type: 'task.add', ref: '$2', kind: 'waiting', title: 'Targets for six metrics', waitingOn: { personId: samId } },
        { type: 'task.update', task: 'A2', patch: { dependsOn: ['A1', 'B1', '$1'] } },
        { type: 'term.upsert', term: 'Target view', meaning: 'Actuals against targets.' },
        { type: 'activity.log', entry: 'session', area: 'meeting', delta: 'Check-in processed', keys: ['$1', '$2'] },
      ],
    }, { opId: 'preview', at: AT, actor: 'claude' })
    const result = applyBatch(state, batch)
    if (!result.ok) throw new Error('expected success')
    await expect(renderPreview(result)).toMatchFileSnapshot(golden('preview-meeting'))
    expect(renderPreview(result, { dryRun: false })).toMatch(/^\*\*Applied\.\*\*/)
  })

  it('a refused batch', async () => {
    const result = run(baseState().state, [{ type: 'task.add', kind: 'action', title: 'Fine' }, { type: 'task.complete', task: 'A99' }])
    if (result.ok) throw new Error('expected failure')
    await expect(renderErrors(result)).toMatchFileSnapshot(golden('errors'))
  })
})

describe('renderBriefing', () => {
  it('summarises the day for a session', async () => {
    const state = wednesdayClosed()
    const b = briefing(state, new Date(Date.parse('2026-11-04T22:00:00.000Z')))
    await expect(renderBriefing(b)).toMatchFileSnapshot(golden('briefing'))
  })
})
