/**
 * Today's editable parts as forms, and the ops they save as. Pure, so the
 * rules are tested without a browser; the components only render them.
 *
 * The plan, priorities and callouts are written whole (focus.setPlan,
 * setPriorities, setCallouts): every change sends the full list with each
 * item's id, so ids survive and outcomes keep pointing at their plan items.
 * Keep-in-mind has an op per item. These are the ops the hecate-focus skill
 * sends, so the app and Claude write the same thing.
 */
import { findTask, formatDay, projectSlug, ulid, type Briefing, type TodayView, type WorkspaceState } from '@hecate/core'
import { checkKeys, checkLine, keysIn, nullable, sameList } from '../forms.ts'
import { canMoveIn, moved, upsert, without } from '../lists.ts'

type PlanItem = TodayView['plan'][number]
type Outcome = TodayView['outcomes'][number]
type Priority = Briefing['week']['priorities'][number]
type Callout = Briefing['week']['callouts'][number]
export type KeepItem = Briefing['keepInMind'][number]
type Tier = Priority['tier']
type Urgency = NonNullable<PlanItem['urgency']>
type Result = Outcome['result']

/** Today's lists, as the page shows them. */
export interface Lists {
  date: Briefing['today']
  weekOf: Briefing['week']['weekOf']
  plan: readonly PlanItem[]
  priorities: readonly Priority[]
  callouts: readonly Callout[]
  keep: readonly KeepItem[]
}

export const listsOf = (b: Briefing): Lists => ({
  date: b.today, weekOf: b.week.weekOf, plan: b.todayView.plan, priorities: b.week.priorities, callouts: b.week.callouts, keep: b.keepInMind,
})

// ─── Lists ──────────────────────────────────────────────────────────────────

type Identified = { id: string }
const sameTier = (a: Priority, b: Priority): boolean => a.tier === b.tier

// ─── Ops for the whole lists ────────────────────────────────────────────────

export type ListKind = 'plan' | 'priority' | 'callout'
export type ItemKind = ListKind | 'keep'

const planOp = (date: string, items: readonly PlanItem[]) => ({
  type: 'focus.setPlan', date, items: items.map(p => ({ id: p.id, lead: p.lead, detail: p.detail, keys: p.keys, urgency: p.urgency })),
})
const prioritiesOp = (weekOf: string, items: readonly Priority[]) => ({
  type: 'focus.setPriorities', weekOf, items: items.map(p => ({ id: p.id, tier: p.tier, lead: p.lead, detail: p.detail, keys: p.keys })),
})
const calloutsOp = (weekOf: string, items: readonly Callout[]) => ({
  type: 'focus.setCallouts', weekOf, items: items.map(c => ({ id: c.id, lead: c.lead, text: c.text, keys: c.keys })),
})

/** The op that writes one of the lists as given. */
function listOp(lists: Lists, kind: ListKind, items: readonly Identified[]): unknown {
  if (kind === 'plan') return planOp(lists.date, items as PlanItem[])
  if (kind === 'priority') return prioritiesOp(lists.weekOf, items as Priority[])
  return calloutsOp(lists.weekOf, items as Callout[])
}

const listFor = (lists: Lists, kind: ListKind): readonly Identified[] =>
  kind === 'plan' ? lists.plan : kind === 'priority' ? lists.priorities : lists.callouts

/** Puts a list back as it is now: the exact undo of any change to it. */
export const restoreOps = (lists: Lists, kind: ListKind): unknown[] => [listOp(lists, kind, listFor(lists, kind))]

export function removeOps(lists: Lists, kind: ItemKind, id: string): unknown[] {
  if (kind === 'keep') return [{ type: 'keepInMind.remove', id }]
  return [listOp(lists, kind, without(listFor(lists, kind), id))]
}

/** Whether an item can move that way: a priority stays within its tier. */
export function canMove(lists: Lists, kind: ListKind, id: string, delta: -1 | 1): boolean {
  return kind === 'priority' ? canMoveIn(lists.priorities, id, delta, sameTier) : canMoveIn(listFor(lists, kind), id, delta)
}

export function moveOps(lists: Lists, kind: ListKind, id: string, delta: -1 | 1): unknown[] {
  if (!canMove(lists, kind, id, delta)) return []
  const items = kind === 'priority' ? moved(lists.priorities, id, delta, sameTier) : moved(listFor(lists, kind), id, delta)
  return [listOp(lists, kind, items)]
}

// ─── The item form ──────────────────────────────────────────────────────────

/** One form for every kind; each kind uses the fields it has (ItemEditor shows only those). */
export interface ItemForm {
  /** Plan item and priority: required. Callout and keep-in-mind: an optional short opening. */
  lead: string
  /** Plan item and priority: the detail. Callout and keep-in-mind: the text, required. */
  text: string
  keys: string
  urgency: '' | Urgency
  tier: Tier
  /** A project slug, keep-in-mind only. */
  project: string
}

export type ItemErrors = Partial<Record<keyof ItemForm, string>>

export const emptyItemForm = (): ItemForm => ({ lead: '', text: '', keys: '', urgency: '', tier: 'focus', project: '' })

/** The form for an existing item, or null if it is no longer there. */
export function itemFormFor(state: WorkspaceState, lists: Lists, kind: ItemKind, id: string): ItemForm | null {
  const base = emptyItemForm()
  if (kind === 'plan') {
    const p = lists.plan.find(x => x.id === id)
    return p ? { ...base, lead: p.lead, text: p.detail ?? '', keys: p.keys.join(', '), urgency: p.urgency ?? '' } : null
  }
  if (kind === 'priority') {
    const p = lists.priorities.find(x => x.id === id)
    return p ? { ...base, lead: p.lead, text: p.detail ?? '', keys: p.keys.join(', '), tier: p.tier } : null
  }
  if (kind === 'callout') {
    const c = lists.callouts.find(x => x.id === id)
    return c ? { ...base, lead: c.lead ?? '', text: c.text, keys: c.keys.join(', ') } : null
  }
  const k = lists.keep.find(x => x.id === id)
  return k ? { ...base, lead: k.lead ?? '', text: k.text, keys: k.keys.join(', '), project: projectSlug(state, k.projectId) ?? '' } : null
}

const LEAD_REQUIRED: Record<'plan' | 'priority', string> = { plan: 'Say what to do.', priority: 'Name the priority.' }
const TEXT_REQUIRED: Record<'callout' | 'keep', string> = { callout: 'Write the callout.', keep: 'Write what to keep in mind.' }

export function validateItem(state: WorkspaceState, kind: ItemKind, form: ItemForm): ItemErrors {
  const errors: ItemErrors = {}
  const leadRequired = kind === 'plan' || kind === 'priority'
  const lead = checkLine(form.lead, {
    name: leadRequired ? 'the lead' : 'the heading',
    ...(leadRequired ? { missing: LEAD_REQUIRED[kind] } : {}),
    oneLine: `Keep the ${leadRequired ? 'lead' : 'heading'} on one line; put the rest in the ${leadRequired ? 'detail' : 'text'}.`,
  })
  if (lead) errors.lead = lead
  if ((kind === 'callout' || kind === 'keep') && form.text.trim() === '') errors.text = TEXT_REQUIRED[kind]
  const keys = checkKeys(state, form.keys)
  if (keys) errors.keys = keys
  if (kind === 'keep' && form.project && !state.projects[form.project]) errors.project = 'Choose a project from the list.'
  return errors
}

/**
 * The ops a valid form saves as: the whole list with the item in its place
 * (or added at the end), or a keep-in-mind op. Nothing when nothing changed.
 */
export function saveItemOps(state: WorkspaceState, lists: Lists, kind: ItemKind, form: ItemForm, id: string | null, newId: () => string = ulid): unknown[] {
  const keys = keysIn(form.keys)
  const lead = form.lead.trim()
  if (kind === 'plan') {
    const item: PlanItem = { id: (id ?? newId()) as PlanItem['id'], lead, detail: nullable(form.text), keys: keys as PlanItem['keys'], urgency: form.urgency === '' ? null : form.urgency }
    const before = lists.plan.find(p => p.id === id)
    if (before && before.lead === item.lead && before.detail === item.detail && before.urgency === item.urgency && sameList(before.keys, keys)) return []
    return [planOp(lists.date, upsert(lists.plan, item))]
  }
  if (kind === 'priority') {
    const item: Priority = { id: (id ?? newId()) as Priority['id'], tier: form.tier, lead, detail: nullable(form.text), keys: keys as Priority['keys'] }
    const before = lists.priorities.find(p => p.id === id)
    if (before && before.lead === item.lead && before.detail === item.detail && before.tier === item.tier && sameList(before.keys, keys)) return []
    return [prioritiesOp(lists.weekOf, upsert(lists.priorities, item))]
  }
  if (kind === 'callout') {
    const item: Callout = { id: (id ?? newId()) as Callout['id'], lead: nullable(form.lead), text: form.text.trim(), keys: keys as Callout['keys'] }
    const before = lists.callouts.find(c => c.id === id)
    if (before && before.lead === item.lead && before.text === item.text && sameList(before.keys, keys)) return []
    return [calloutsOp(lists.weekOf, upsert(lists.callouts, item))]
  }
  const fields = { lead: nullable(form.lead), text: form.text.trim(), keys, project: nullable(form.project) }
  const before = id ? lists.keep.find(k => k.id === id) : undefined
  if (!before) return [{ type: 'keepInMind.add', ...fields }]
  const patch: Record<string, unknown> = {}
  if (fields.lead !== before.lead) patch.lead = fields.lead
  if (fields.text !== before.text) patch.text = fields.text
  if (!sameList(fields.keys, before.keys)) patch.keys = fields.keys
  if (fields.project !== projectSlug(state, before.projectId)) patch.project = fields.project
  return Object.keys(patch).length > 0 ? [{ type: 'keepInMind.update', id: before.id, patch }] : []
}

/** A short name for an item, for its controls and messages. */
export function itemName(item: { lead?: string | null; text?: string }): string {
  if (item.lead) return item.lead
  const line = (item.text ?? '').split('\n')[0]?.trim() ?? ''
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

// ─── Closing the day ────────────────────────────────────────────────────────

export interface OutcomeRow {
  /** The outcome's id once saved; kept when the day's outcomes are edited. */
  id: string | null
  /** The plan item it reports on, or null for something done but not planned. */
  planItemId: string | null
  lead: string
  result: Result
  note: string
  /** Task keys as text; fixed by the plan item for a planned row. */
  keys: string
  /** Complete the row's open tasks in the same change (offered when the result is Done). */
  complete: boolean
}

export interface CloseForm {
  planned: OutcomeRow[]
  unplanned: OutcomeRow[]
  note: string
}

export interface CloseErrors {
  /** By position in `unplanned`. */
  unplanned: Partial<Record<'lead' | 'keys', string>>[]
}

/** The keys among `keys` whose tasks are open: what "Also complete" would complete. */
export function openKeys(state: WorkspaceState, keys: readonly string[]): string[] {
  return keys.filter(k => {
    const found = findTask(state, k)
    return found?.where === 'open' && found.task.completedAt === null
  })
}

const allClosed = (state: WorkspaceState, keys: readonly string[]): boolean =>
  keys.length > 0 && keys.every(k => findTask(state, k) !== null) && openKeys(state, keys).length === 0

export const emptyOutcome = (): OutcomeRow => ({ id: null, planItemId: null, lead: '', result: 'done', note: '', keys: '', complete: false })

/**
 * The form to close a day: a row per plan item, and the saved outcomes when
 * the day is already closed. An open item starts as Carried unless every task
 * it names is already closed: the form never invents a Done.
 */
export function draftClose(state: WorkspaceState, view: TodayView): CloseForm {
  const saved = new Map(view.outcomes.filter(o => o.planItemId !== null).map(o => [o.planItemId, o]))
  const planned = view.plan.map((p): OutcomeRow => {
    const o = saved.get(p.id)
    return {
      id: o?.id ?? null,
      planItemId: p.id,
      lead: p.lead,
      result: o?.result ?? (allClosed(state, p.keys) ? 'done' : 'carried'),
      note: o?.note ?? '',
      keys: p.keys.join(', '),
      complete: false,
    }
  })
  const planIds = new Set(view.plan.map(p => p.id))
  const unplanned = view.outcomes
    .filter(o => o.planItemId === null || !planIds.has(o.planItemId))
    .map((o): OutcomeRow => ({ id: o.id, planItemId: null, lead: o.lead, result: o.result, note: o.note ?? '', keys: o.keys.join(', '), complete: false }))
  return { planned, unplanned, note: view.note ?? '' }
}

export function validateClose(state: WorkspaceState, form: CloseForm): CloseErrors {
  return {
    unplanned: form.unplanned.map(row => {
      const errors: Partial<Record<'lead' | 'keys', string>> = {}
      const lead = checkLine(row.lead, { name: 'what you did', missing: 'Say what you did, or remove this row.', oneLine: 'Keep it to one line; put the rest in the note.' })
      if (lead) errors.lead = lead
      const keys = checkKeys(state, row.keys)
      if (keys) errors.keys = keys
      return errors
    }),
  }
}

export const closeProblems = (errors: CloseErrors): string[] => errors.unplanned.flatMap(e => Object.values(e))

/** The day's outcomes and note in one focus.closeDay, then the tasks the person chose to complete, in one batch. */
export function closeOps(state: WorkspaceState, date: string, form: CloseForm): unknown[] {
  const rows = [...form.planned, ...form.unplanned]
  const outcomes = rows.map(r => ({
    ...(r.id ? { id: r.id } : {}),
    planItemId: r.planItemId,
    result: r.result,
    lead: r.lead.trim(),
    note: nullable(r.note),
    keys: keysIn(r.keys),
  }))
  const complete = [...new Set(rows.filter(r => r.result === 'done' && r.complete).flatMap(r => openKeys(state, keysIn(r.keys))))]
  return [{ type: 'focus.closeDay', date, outcomes, note: nullable(form.note) }, ...complete.map(task => ({ type: 'task.complete', task }))]
}

export const closeLabel = (date: TodayView['date'], closed: boolean): string => (closed ? `Update how ${formatDay(date)} went` : `Close ${formatDay(date)}`)
