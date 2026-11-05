import { z } from 'zod'
import { formatDay, formatWeekOf, mondayOf } from '../dates.ts'
import { Instant, IsoDate, Line, Markdown, Slug, Time, Ulid, Urgency } from '../primitives.ts'
import { PriorityTier } from '../schemas/focus.ts'
import { focusPath } from '../state.ts'
import { focusDay, focusWeek, OpFailure, resolveKeys, slugify, withIds, type OpContext } from './context.ts'
import { TaskRef } from './tasks.ts'

const Keys = z.array(TaskRef)

const ScheduleRowInput = z.strictObject({
  id: Ulid.optional(),
  date: IsoDate,
  start: Time.nullable().optional(),
  end: Time.nullable().optional(),
  /** Leave out for a personal entry: only its time slot is kept. */
  title: Line.nullable().optional(),
  personal: z.boolean().optional(),
  relevance: Urgency.nullable().optional(),
  note: Line.nullable().optional(),
  keys: Keys.optional(),
  important: z.boolean().optional(),
})

const PlanItemInput = z.strictObject({
  id: Ulid.optional(),
  lead: Line,
  detail: Markdown.nullable().optional(),
  keys: Keys.optional(),
  urgency: Urgency.nullable().optional(),
})

const OutcomeInput = z.strictObject({
  id: Ulid.optional(),
  planItemId: Ulid.nullable().optional(),
  result: z.enum(['done', 'carried', 'dropped']),
  lead: Line,
  note: Markdown.nullable().optional(),
  keys: Keys.optional(),
})

const PriorityInput = z.strictObject({
  id: Ulid.optional(),
  tier: PriorityTier,
  lead: Line,
  detail: Markdown.nullable().optional(),
  keys: Keys.optional(),
})

const CalloutInput = z.strictObject({ id: Ulid.optional(), lead: Line.nullable().optional(), text: Markdown, keys: Keys.optional() })
const LastWeekInput = z.strictObject({ id: Ulid.optional(), text: Markdown, keys: Keys.optional() })

export const focusSetSchedule = z.strictObject({
  type: z.literal('focus.setSchedule'),
  weekOf: IsoDate,
  /** Replaces the week's whole schedule (Week at a Glance and every day's meetings). */
  rows: z.array(ScheduleRowInput),
  /** When the calendar was read; defaults to the batch time. */
  capturedAt: Instant.optional(),
})
export const focusSetPlan = z.strictObject({
  type: z.literal('focus.setPlan'),
  date: IsoDate,
  /** Replaces the day's plan ("Today's tasks"). */
  items: z.array(PlanItemInput),
})
export const focusCloseDay = z.strictObject({
  type: z.literal('focus.closeDay'),
  date: IsoDate,
  /** What happened to the day: ✅ done · 🔄 carried · ❌ dropped. Replaces any earlier outcomes. */
  outcomes: z.array(OutcomeInput),
  note: Markdown.nullable().optional(),
})
export const focusSetPriorities = z.strictObject({ type: z.literal('focus.setPriorities'), weekOf: IsoDate, items: z.array(PriorityInput) })
export const focusSetCallouts = z.strictObject({ type: z.literal('focus.setCallouts'), weekOf: IsoDate, items: z.array(CalloutInput) })
export const focusSetLastWeek = z.strictObject({ type: z.literal('focus.setLastWeek'), weekOf: IsoDate, items: z.array(LastWeekInput) })
export const focusSetSection = z.strictObject({
  type: z.literal('focus.setSection'),
  weekOf: IsoDate,
  /** Upserted by id; the id defaults to the title as a slug. */
  section: z.strictObject({ id: Slug.optional(), title: Line, content: Markdown }),
})
export const focusRemoveSection = z.strictObject({ type: z.literal('focus.removeSection'), weekOf: IsoDate, id: Slug })

export const keepInMindAdd = z.strictObject({
  type: z.literal('keepInMind.add'),
  id: Ulid.optional(),
  lead: Line.nullable().optional(),
  text: Markdown,
  keys: Keys.optional(),
  project: Slug.nullable().optional(),
})
export const keepInMindUpdate = z.strictObject({
  type: z.literal('keepInMind.update'),
  id: Ulid,
  patch: z.strictObject({ lead: Line.nullable(), text: Markdown, keys: Keys, project: Slug.nullable() }).partial(),
})
export const keepInMindRemove = z.strictObject({ type: z.literal('keepInMind.remove'), id: Ulid })

// ─── Preparation: fill item ids ─────────────────────────────────────────────

export function prepareListOp<T extends { items: { id?: string | undefined }[] }>(op: T, newId: () => Ulid): T {
  return { ...op, items: withIds(op.items, newId) }
}
export const prepareSchedule = (op: z.infer<typeof focusSetSchedule>, newId: () => Ulid) => ({ ...op, rows: withIds(op.rows, newId) ?? [] })
export const prepareCloseDay = (op: z.infer<typeof focusCloseDay>, newId: () => Ulid) => ({ ...op, outcomes: withIds(op.outcomes, newId) ?? [] })
export const prepareKeepInMindAdd = (op: z.infer<typeof keepInMindAdd>, newId: () => Ulid) => ({ ...op, id: op.id ?? newId() })

// ─── Handlers ───────────────────────────────────────────────────────────────

const count = (items: readonly unknown[]): string => items.length === 1 ? '1 item' : `${items.length} items`

function projectId(ctx: OpContext, slug: string | null | undefined): string | null {
  if (slug === null || slug === undefined) return null
  const project = ctx.state.projects[slug]
  if (!project) throw new OpFailure('not-found', `No project "${slug}"`, Object.keys(ctx.state.projects))
  return project.id
}

export function applyFocusSetSchedule(op: z.infer<typeof focusSetSchedule>, ctx: OpContext): void {
  const week = focusWeek(ctx, op.weekOf)
  week.schedule = op.rows.map(r => {
    const personal = r.personal ?? false
    return {
      id: r.id,
      date: r.date,
      start: r.start ?? null,
      end: r.end ?? null,
      title: personal ? null : (r.title ?? null),
      personal,
      relevance: personal ? null : (r.relevance ?? null),
      note: personal ? null : (r.note ?? null),
      keys: personal ? [] : resolveKeys(ctx, r.keys),
      important: personal ? false : (r.important ?? false),
    }
  }).sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? ''))) as never
  week.scheduleCapturedAt = op.capturedAt ?? ctx.at
  ctx.summary(`Set the schedule for the week of ${formatWeekOf(op.weekOf)} (${count(op.rows)})`)
}

export function applyFocusSetPlan(op: z.infer<typeof focusSetPlan>, ctx: OpContext): void {
  const day = focusDay(ctx, op.date)
  day.plan = op.items.map(i => ({
    id: i.id, lead: i.lead, detail: i.detail ?? null, keys: resolveKeys(ctx, i.keys), urgency: i.urgency ?? null,
  })) as never
  ctx.summary(`Set the plan for ${formatDay(op.date)} (${count(op.items)})`)
}

export function applyFocusCloseDay(op: z.infer<typeof focusCloseDay>, ctx: OpContext): void {
  const day = focusDay(ctx, op.date)
  const planIds = new Set(day.plan.map(p => p.id))
  day.outcomes = op.outcomes.map(o => {
    const planItemId = o.planItemId ?? null
    if (planItemId !== null && !planIds.has(planItemId)) {
      throw new OpFailure('not-found', `Outcome "${o.lead}" refers to a plan item that is not in ${formatDay(op.date)}`, [...planIds])
    }
    return { id: o.id, planItemId, result: o.result, lead: o.lead, note: o.note ?? null, keys: resolveKeys(ctx, o.keys) }
  }) as never
  if (op.note !== undefined) day.note = op.note
  day.closedAt = ctx.at
  const n = (r: string) => op.outcomes.filter(o => o.result === r).length
  ctx.summary(`Close ${formatDay(op.date)}: ✅ ${n('done')} · 🔄 ${n('carried')} · ❌ ${n('dropped')}`)
}

export function applyFocusSetPriorities(op: z.infer<typeof focusSetPriorities>, ctx: OpContext): void {
  const week = focusWeek(ctx, op.weekOf)
  week.priorities = op.items.map(i => ({ id: i.id, tier: i.tier, lead: i.lead, detail: i.detail ?? null, keys: resolveKeys(ctx, i.keys) })) as never
  ctx.summary(`Set priorities for the week of ${formatWeekOf(op.weekOf)} (${count(op.items)})`)
}

export function applyFocusSetCallouts(op: z.infer<typeof focusSetCallouts>, ctx: OpContext): void {
  const week = focusWeek(ctx, op.weekOf)
  week.callouts = op.items.map(i => ({ id: i.id, lead: i.lead ?? null, text: i.text, keys: resolveKeys(ctx, i.keys) })) as never
  ctx.summary(`Set callouts for the week of ${formatWeekOf(op.weekOf)} (${count(op.items)})`)
}

export function applyFocusSetLastWeek(op: z.infer<typeof focusSetLastWeek>, ctx: OpContext): void {
  const week = focusWeek(ctx, op.weekOf)
  week.lastWeek = op.items.map(i => ({ id: i.id, text: i.text, keys: resolveKeys(ctx, i.keys) })) as never
  ctx.summary(`Set "Last week" for the week of ${formatWeekOf(op.weekOf)} (${count(op.items)})`)
}

export function applyFocusSetSection(op: z.infer<typeof focusSetSection>, ctx: OpContext): void {
  const week = focusWeek(ctx, op.weekOf)
  const id = op.section.id ?? slugify(op.section.title)
  if (id === '') throw new OpFailure('invalid', `Section "${op.section.title}" needs an id`)
  const existing = week.sections.find(s => s.id === id)
  if (existing) {
    existing.title = op.section.title
    existing.content = op.section.content
  } else {
    week.sections.push({ id, title: op.section.title, content: op.section.content })
  }
  ctx.summary(`${existing ? 'Update' : 'Add'} section "${op.section.title}" in the week of ${formatWeekOf(op.weekOf)}`)
}

export function applyFocusRemoveSection(op: z.infer<typeof focusRemoveSection>, ctx: OpContext): void {
  const week = ctx.state.focusWeeks[op.weekOf]
  const i = week?.sections.findIndex(s => s.id === op.id) ?? -1
  if (!week || i < 0) throw new OpFailure('not-found', `No section "${op.id}" in the week of ${op.weekOf}`, week?.sections.map(s => s.id) ?? [])
  week.sections.splice(i, 1)
  week.updatedAt = ctx.at
  ctx.touch(focusPath(mondayOf(op.weekOf)))
  ctx.summary(`Remove section "${op.id}" from the week of ${formatWeekOf(op.weekOf)}`)
}

export function applyKeepInMindAdd(op: z.infer<typeof keepInMindAdd>, ctx: OpContext): void {
  if (!op.id) throw new OpFailure('invalid', 'keepInMind.add has no id; run the batch through prepareBatch first')
  const file = ctx.state.keepInMind
  file.items.push({
    id: op.id, lead: op.lead ?? null, text: op.text, keys: resolveKeys(ctx, op.keys), projectId: projectId(ctx, op.project), createdAt: ctx.at,
  } as never)
  file.updatedAt = ctx.at
  ctx.touch('focus/keep-in-mind.json')
  ctx.summary(`Keep in mind: ${op.lead ?? op.text.split('\n')[0]}`)
}

function keepInMindItem(ctx: OpContext, id: string) {
  const item = ctx.state.keepInMind.items.find(i => i.id === id)
  if (!item) throw new OpFailure('not-found', `No keep-in-mind item ${id}`, ctx.state.keepInMind.items.map(i => `${i.id} (${i.lead ?? i.text.slice(0, 40)})`))
  return item
}

export function applyKeepInMindUpdate(op: z.infer<typeof keepInMindUpdate>, ctx: OpContext): void {
  const item = keepInMindItem(ctx, op.id)
  const p = op.patch
  if (p.lead !== undefined) item.lead = p.lead
  if (p.text !== undefined) item.text = p.text
  if (p.keys !== undefined) item.keys = resolveKeys(ctx, p.keys)
  if (p.project !== undefined) item.projectId = projectId(ctx, p.project) as never
  ctx.state.keepInMind.updatedAt = ctx.at
  ctx.touch('focus/keep-in-mind.json')
  ctx.summary(`Update keep-in-mind item: ${item.lead ?? item.text.split('\n')[0]}`)
}

export function applyKeepInMindRemove(op: z.infer<typeof keepInMindRemove>, ctx: OpContext): void {
  const item = keepInMindItem(ctx, op.id)
  ctx.state.keepInMind.items.splice(ctx.state.keepInMind.items.indexOf(item), 1)
  ctx.state.keepInMind.updatedAt = ctx.at
  ctx.touch('focus/keep-in-mind.json')
  ctx.summary(`Remove keep-in-mind item: ${item.lead ?? item.text.split('\n')[0]}`)
}
