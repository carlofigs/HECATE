import { applyBatch, briefing, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import {
  canMove, closeOps, draftClose, emptyItemForm, emptyOutcome, itemFormFor, itemName, listsOf, moveOps, removeOps, restoreOps, saveItemOps,
  validateClose, validateItem, type Lists,
} from './focus.ts'

const MONDAY = '2026-11-09'
const NOW = new Date('2026-11-09T09:00:00.000Z')

/** Ops are only right if the engine accepts them. */
function applies(state: WorkspaceState, ops: unknown[], at = '2026-11-09T10:00:00.000Z'): WorkspaceState {
  const result = applyBatch(state, prepareBatch({ ops }, { opId: 'test', at, actor: 'app' }))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.state
}

/** A1 open, A2 done; a plan of two items; three priorities over two tiers; a callout; a keep-in-mind note. */
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
  return applies(emptyState(settings, '2026-11-09T00:00:00.000Z'), [
    { type: 'project.create', slug: 'scorecard', name: 'Scorecard', status: 'active' },
    { type: 'task.add', kind: 'action', title: 'Draft' },
    { type: 'task.add', kind: 'action', title: 'Tidy' },
    { type: 'task.complete', task: 'A2' },
    { type: 'focus.setPlan', date: MONDAY, items: [{ lead: 'Write the draft', keys: ['A1'], urgency: 'high' }, { lead: 'Tidy up', keys: ['A2'] }] },
    { type: 'focus.setPriorities', weekOf: MONDAY, items: [{ tier: 'focus', lead: 'Ship' }, { tier: 'next', lead: 'Plan' }, { tier: 'focus', lead: 'Hire' }] },
    { type: 'focus.setCallouts', weekOf: MONDAY, items: [{ lead: 'Review Tuesday.', text: 'Bring numbers.' }] },
    { type: 'keepInMind.add', lead: 'Leave', text: 'Alex is away next week.' },
  ], '2026-11-09T08:00:00.000Z')
}

const lists = (state: WorkspaceState): Lists => listsOf(briefing(state, NOW))
const ids = <T extends { id: string }>(list: readonly T[]): string[] => list.map(x => x.id)
let counter = 0
const newId = (): string => `01KQ${String(counter++).padStart(22, '0')}`

describe('the plan, priorities and callouts', () => {
  it('adds an item at the end and sends the whole list with every id kept', () => {
    const state = workspace()
    const l = lists(state)
    const ops = saveItemOps(state, l, 'plan', { ...emptyItemForm(), lead: ' Call Sam ', keys: 'a1', urgency: 'low' }, null, newId)
    expect(ops).toHaveLength(1)
    const items = (ops[0] as { items: { id: string; lead: string }[] }).items
    expect(items.map(i => i.lead)).toEqual(['Write the draft', 'Tidy up', 'Call Sam'])
    expect(items.slice(0, 2).map(i => i.id)).toEqual(ids(l.plan))
    const after = lists(applies(state, ops))
    expect(after.plan.at(-1)).toMatchObject({ lead: 'Call Sam', keys: ['A1'], urgency: 'low', detail: null })
    expect(ids(after.plan).slice(0, 2)).toEqual(ids(l.plan))
  })

  it('edits an item in place, and saves nothing when nothing changed', () => {
    const state = workspace()
    const l = lists(state)
    const first = l.plan[0]?.id ?? ''
    const form = itemFormFor(state, l, 'plan', first)
    expect(form).toMatchObject({ lead: 'Write the draft', keys: 'A1', urgency: 'high', text: '' })
    if (!form) throw new Error('form')
    expect(saveItemOps(state, l, 'plan', form, first)).toEqual([])
    const ops = saveItemOps(state, l, 'plan', { ...form, urgency: 'med', text: 'Use the template.' }, first)
    const after = lists(applies(state, ops))
    expect(after.plan[0]).toMatchObject({ id: first, urgency: 'med', detail: 'Use the template.' })
    expect(ids(after.plan)).toEqual(ids(l.plan))
  })

  it('moves an item, and Undo puts the list back exactly', () => {
    const state = workspace()
    const l = lists(state)
    const [a, b] = ids(l.plan)
    expect(canMove(l, 'plan', a ?? '', -1)).toBe(false)
    expect(canMove(l, 'plan', a ?? '', 1)).toBe(true)
    const after = applies(state, moveOps(l, 'plan', a ?? '', 1))
    expect(ids(lists(after).plan)).toEqual([b, a])
    expect(ids(lists(applies(after, restoreOps(l, 'plan'))).plan)).toEqual([a, b])
  })

  it('moves a priority within its tier only', () => {
    const state = workspace()
    const l = lists(state)
    const [ship, plan, hire] = ids(l.priorities)
    expect(canMove(l, 'priority', plan ?? '', 1)).toBe(false)
    expect(canMove(l, 'priority', ship ?? '', 1)).toBe(true)
    const after = lists(applies(state, moveOps(l, 'priority', ship ?? '', 1)))
    expect(ids(after.priorities)).toEqual([hire, plan, ship])
  })

  it('removes an item and keeps the rest with their ids', () => {
    const state = workspace()
    const l = lists(state)
    const [a, b] = ids(l.plan)
    expect(ids(lists(applies(state, removeOps(l, 'plan', a ?? ''))).plan)).toEqual([b])
  })

  it('saves a priority with its tier, and a callout without a lead', () => {
    const state = workspace()
    const l = lists(state)
    const priority = saveItemOps(state, l, 'priority', { ...emptyItemForm(), lead: 'Onboard Sam', tier: 'next' }, null, newId)
    const callout = saveItemOps(state, l, 'callout', { ...emptyItemForm(), text: 'Office closed **Friday**.' }, null, newId)
    const after = lists(applies(state, [...priority, ...callout]))
    expect(after.priorities.at(-1)).toMatchObject({ tier: 'next', lead: 'Onboard Sam' })
    expect(after.callouts.at(-1)).toMatchObject({ lead: null, text: 'Office closed **Friday**.' })
  })

  it('refuses what core would, in words that say how to fix it', () => {
    const state = workspace()
    expect(validateItem(state, 'plan', emptyItemForm())).toEqual({ lead: 'Say what to do.' })
    expect(validateItem(state, 'plan', { ...emptyItemForm(), lead: 'a\nb' }).lead).toMatch(/one line/)
    expect(validateItem(state, 'plan', { ...emptyItemForm(), lead: 'x'.repeat(501) }).lead).toMatch(/^Shorten the lead to 500/)
    expect(validateItem(state, 'plan', { ...emptyItemForm(), lead: 'Fine', keys: 'A9' }).keys).toBe('There is no A9 in this workspace.')
    expect(validateItem(state, 'callout', emptyItemForm())).toEqual({ text: 'Write the callout.' })
    expect(validateItem(state, 'keep', { ...emptyItemForm(), text: 'x', project: 'nope' }).project).toBe('Choose a project from the list.')
    expect(validateItem(state, 'priority', { ...emptyItemForm(), lead: 'Fine', keys: 'a1 a2' })).toEqual({})
  })
})

describe('keep in mind', () => {
  it('adds with a project, updates only what changed, and removes by id', () => {
    const state = workspace()
    const l = lists(state)
    const add = saveItemOps(state, l, 'keep', { ...emptyItemForm(), text: 'Book the room.', project: 'scorecard' }, null)
    expect(add).toEqual([{ type: 'keepInMind.add', lead: null, text: 'Book the room.', keys: [], project: 'scorecard' }])
    const added = applies(state, add)
    const item = lists(added).keep.at(-1)
    if (!item) throw new Error('item')
    const form = itemFormFor(added, lists(added), 'keep', item.id)
    expect(form).toMatchObject({ text: 'Book the room.', project: 'scorecard' })
    if (!form) throw new Error('form')
    const update = saveItemOps(added, lists(added), 'keep', { ...form, text: 'Book the big room.' }, item.id)
    expect(update).toEqual([{ type: 'keepInMind.update', id: item.id, patch: { text: 'Book the big room.' } }])
    const updated = applies(added, update)
    expect(lists(updated).keep.at(-1)).toMatchObject({ id: item.id, text: 'Book the big room.' })
    expect(lists(applies(updated, removeOps(lists(updated), 'keep', item.id))).keep.map(k => k.id)).not.toContain(item.id)
  })

  it('names items by their lead, or the first line of their text', () => {
    expect(itemName({ lead: 'Leave', text: 'x' })).toBe('Leave')
    expect(itemName({ lead: null, text: 'Book the room.\nSoon.' })).toBe('Book the room.')
  })
})

describe('closing the day', () => {
  it('starts each plan item as Carried unless its tasks are already closed', () => {
    const state = workspace()
    const view = briefing(state, NOW).todayView
    const form = draftClose(state, view)
    expect(form.planned.map(r => [r.lead, r.result])).toEqual([['Write the draft', 'carried'], ['Tidy up', 'done']])
    expect(form.planned.map(r => r.planItemId)).toEqual(ids(view.plan))
    expect(form.unplanned).toEqual([])
    expect(form.note).toBe('')
  })

  it('closes the day with outcomes linked to the plan, and completes only the tasks asked for', () => {
    const state = workspace()
    const view = briefing(state, NOW).todayView
    const form = draftClose(state, view)
    const [draft, tidy] = form.planned
    if (!draft || !tidy) throw new Error('rows')
    const ops = closeOps(state, MONDAY, {
      planned: [{ ...draft, result: 'done', complete: true, note: 'Sent to Sam.' }, tidy],
      unplanned: [{ ...emptyOutcome(), lead: 'Fixed the export', keys: 'a1' }],
      note: 'A good day.',
    })
    expect(ops.slice(1)).toEqual([{ type: 'task.complete', task: 'A1' }])
    const after = applies(state, ops)
    const closed = briefing(after, NOW).todayView
    expect(closed).toMatchObject({ closed: true, note: 'A good day.' })
    expect(closed.outcomes.map(o => [o.planItemId, o.result, o.lead])).toEqual([
      [draft.planItemId, 'done', 'Write the draft'],
      [tidy.planItemId, 'done', 'Tidy up'],
      [null, 'done', 'Fixed the export'],
    ])
    expect(after.tasks.tasks.find(t => t.key === 'A1')?.completedAt).not.toBeNull()
  })

  it('reopens a closed day with its outcomes, keeping their ids', () => {
    const state = workspace()
    const view = briefing(state, NOW).todayView
    const first = draftClose(state, view)
    const closed = applies(state, closeOps(state, MONDAY, { ...first, unplanned: [{ ...emptyOutcome(), lead: 'Extra' }], note: 'Done.' }))
    const again = draftClose(closed, briefing(closed, NOW).todayView)
    expect(again.note).toBe('Done.')
    expect(again.unplanned.map(r => r.lead)).toEqual(['Extra'])
    const outcomeIds = briefing(closed, NOW).todayView.outcomes.map(o => o.id)
    expect([...again.planned, ...again.unplanned].map(r => r.id)).toEqual(outcomeIds)
    const changed = applies(closed, closeOps(closed, MONDAY, { ...again, planned: again.planned.map(r => ({ ...r, result: 'dropped' as const })) }))
    const outcomes = briefing(changed, NOW).todayView.outcomes
    expect(outcomes.map(o => o.id)).toEqual(outcomeIds)
    expect(outcomes.slice(0, 2).map(o => o.result)).toEqual(['dropped', 'dropped'])
  })

  it('asks for what an unplanned row did', () => {
    const state = workspace()
    const errors = validateClose(state, { planned: [], unplanned: [emptyOutcome(), { ...emptyOutcome(), lead: 'Fine', keys: 'Z1' }], note: '' })
    expect(errors.unplanned).toEqual([{ lead: 'Say what you did, or remove this row.' }, { keys: expect.stringMatching(/^Z1 is not a task key/) }])
  })
})
