import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { addDays, weekdayOf } from '../dates.ts'
import { Instant, IsoDate, Keys, Line, Markdown, Section, Time, Ulid, Urgency } from '../primitives.ts'
import { checkRange, checkUnique } from './refine.ts'

/**
 * One calendar entry for the week, captured by a skill from the calendar
 * connector (ADR 0006). The same list feeds Week at a Glance and today's
 * meetings. A personal entry keeps only its time slot.
 */
export const ScheduleRow = z
  .strictObject({
    id: Ulid,
    date: IsoDate,
    /** Null for an all-day entry. */
    start: Time.nullable(),
    end: Time.nullable(),
    /** Null only for personal entries, which render as "[Personal — blocked]". */
    title: Line.nullable(),
    personal: z.boolean(),
    /** 🔴 gate / needs prep · 🟡 useful context · null when routine. */
    relevance: Urgency.nullable(),
    note: Line.nullable(),
    keys: Keys,
    /** The meeting whose outcome matters most today. */
    important: z.boolean(),
  })
  .superRefine((row, ctx) => {
    if (row.personal) {
      const leaked = (['title', 'note', 'relevance'] as const).filter(f => row[f] !== null)
      for (const field of leaked) {
        ctx.addIssue({ code: 'custom', path: [field], message: `A personal entry keeps only its time slot; ${field} must be null` })
      }
      if (row.keys.length > 0 || row.important) {
        ctx.addIssue({ code: 'custom', path: ['personal'], message: 'A personal entry cannot link tasks or be marked important' })
      }
    } else if (row.title === null) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Only personal entries may omit the title' })
    }
    if (row.start === null && row.end !== null) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'An entry with an end time needs a start time' })
    }
    checkRange(ctx, row.start, row.end, ['end'])
  })

/** One thing planned for a day ("Today's tasks"). */
export const PlanItem = z.strictObject({
  id: Ulid,
  lead: Line,
  detail: Markdown.nullable(),
  keys: Keys,
  urgency: Urgency.nullable(),
})

/** What happened to a planned item: ✅ done · 🔄 carried · ❌ dropped. */
export const Outcome = z.strictObject({
  id: Ulid,
  /** The plan item this resolves; null for something done that was not planned. */
  planItemId: Ulid.nullable(),
  result: z.enum(['done', 'carried', 'dropped']),
  lead: Line,
  note: Markdown.nullable(),
  keys: Keys,
})

/** One working day: its plan, and once it is over, its outcomes. A closed day renders as "… — Done". */
export const Day = z
  .strictObject({
    date: IsoDate,
    plan: z.array(PlanItem),
    outcomes: z.array(Outcome),
    closedAt: Instant.nullable(),
    note: Markdown.nullable(),
  })
  .superRefine((day, ctx) => {
    const planIds = new Set(day.plan.map(p => p.id))
    day.outcomes.forEach((o, i) => {
      if (o.planItemId !== null && !planIds.has(o.planItemId)) {
        ctx.addIssue({ code: 'custom', path: ['outcomes', i, 'planItemId'], message: 'Refers to a plan item that is not in this day' })
      }
    })
  })

/** 🎯 focus · 🟡 next · 🟢 ongoing. */
export const PriorityTier = z.enum(['focus', 'next', 'ongoing'])

/** `focus/{monday}.json` — one week's focus. Weeks run Monday to Sunday, independent of sprints. */
export const focusWeekSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.focusWeek),
    /** The Monday that starts the week; also the file name. */
    weekOf: IsoDate,
    updatedAt: Instant,
    /** When `schedule` was last captured from the calendar; null if never. */
    scheduleCapturedAt: Instant.nullable(),
    schedule: z.array(ScheduleRow),
    days: z.array(Day),
    /** The `>` blocks at the top of This Week's Priorities: ceremonies, deadlines, cutoffs. */
    callouts: z.array(z.strictObject({ id: Ulid, lead: Line.nullable(), text: Markdown, keys: Keys })),
    priorities: z.array(
      z.strictObject({ id: Ulid, tier: PriorityTier, lead: Line, detail: Markdown.nullable(), keys: Keys }),
    ),
    lastWeek: z.array(z.strictObject({ id: Ulid, text: Markdown, keys: Keys })),
    /** Anything the structured fields do not cover. */
    sections: z.array(Section),
  })
  .superRefine((week, ctx) => {
    // Refinements run even when weekOf failed its date check; that issue is already reported.
    if (!IsoDate.safeParse(week.weekOf).success) return
    if (weekdayOf(week.weekOf) !== 1) {
      ctx.addIssue({ code: 'custom', path: ['weekOf'], message: `${week.weekOf} is not a Monday` })
      return
    }
    const sunday = addDays(week.weekOf, 6)
    const inWeek = (d: string): boolean => d >= week.weekOf && d <= sunday
    week.schedule.forEach((row, i) => {
      if (!inWeek(row.date)) ctx.addIssue({ code: 'custom', path: ['schedule', i, 'date'], message: `${row.date} is outside the week of ${week.weekOf}` })
    })
    week.days.forEach((day, i) => {
      if (!inWeek(day.date)) ctx.addIssue({ code: 'custom', path: ['days', i, 'date'], message: `${day.date} is outside the week of ${week.weekOf}` })
    })
    checkUnique(ctx, week.days, d => d.date, ['days'], 'day')
    // Ops address items by id, so ids must be unique across the whole file.
    const ids: { id: string; path: (string | number)[] }[] = [
      ...week.schedule.map((r, i) => ({ id: r.id, path: ['schedule', i] })),
      ...week.days.flatMap((d, i) => [
        ...d.plan.map((p, j) => ({ id: p.id, path: ['days', i, 'plan', j] })),
        ...d.outcomes.map((o, j) => ({ id: o.id, path: ['days', i, 'outcomes', j] })),
      ]),
      ...week.callouts.map((c, i) => ({ id: c.id, path: ['callouts', i] })),
      ...week.priorities.map((p, i) => ({ id: p.id, path: ['priorities', i] })),
      ...week.lastWeek.map((l, i) => ({ id: l.id, path: ['lastWeek', i] })),
    ]
    const seen = new Set<string>()
    for (const { id, path } of ids) {
      if (seen.has(id)) ctx.addIssue({ code: 'custom', path, message: `Duplicate id ${id}` })
      seen.add(id)
    }
    checkUnique(ctx, week.sections, s => s.id, ['sections'], 'section id')
  })

/** `focus/keep-in-mind.json` — standing reminders that carry from week to week. */
export const keepInMindSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.keepInMind),
    updatedAt: Instant,
    items: z.array(
      z.strictObject({
        id: Ulid,
        lead: Line.nullable(),
        text: Markdown,
        keys: Keys,
        projectId: Ulid.nullable(),
        createdAt: Instant,
      }),
    ),
  })
  .superRefine((file, ctx) => {
    checkUnique(ctx, file.items, i => i.id, ['items'], 'id')
  })
