import { z } from 'zod'
import { formatDay, sprintOf, todayIn } from '../dates.ts'
import { CURRENT_VERSION } from '../kinds.ts'
import { Markdown, Section } from '../primitives.ts'
import { sprintPath } from '../state.ts'
import { cadenceOf, categoryOf, OpFailure, sprintBounds, type OpContext } from './context.ts'

export const sprintStart = z.strictObject({
  type: z.literal('sprint.start'),
  /** Defaults to the sprint containing today. */
  n: z.int().optional(),
  goal: Markdown.nullable().optional(),
})

export const sprintUpdate = z.strictObject({
  type: z.literal('sprint.update'),
  n: z.int(),
  goal: Markdown.nullable().optional(),
  retro: Markdown.nullable().optional(),
  sections: z.array(Section).optional(),
})

export const sprintClose = z.strictObject({
  type: z.literal('sprint.close'),
  /**
   * Defaults to the sprint containing today — or, on the first day of a
   * sprint (planning day), the one that just ended.
   */
  n: z.int().optional(),
  retro: Markdown.nullable().optional(),
})

function ensureSprint(ctx: OpContext, n: number) {
  let sprint = ctx.state.sprints[n]
  if (!sprint) {
    const { start, end } = sprintBounds(cadenceOf(ctx), n)
    ctx.state.sprints[n] = {
      schemaVersion: CURRENT_VERSION.sprint, n, start, end, goal: null, closedAt: null,
      done: [], dropped: [], carried: [], retro: null, velocity: null, sections: [], legacy: false,
    }
    sprint = ctx.state.sprints[n]
  }
  ctx.touch(sprintPath(n))
  return sprint
}

export function applySprintStart(op: z.infer<typeof sprintStart>, ctx: OpContext): void {
  const n = op.n ?? sprintOf(ctx.today, cadenceOf(ctx)).n
  if (ctx.state.sprints[n]) throw new OpFailure('conflict', `Sprint ${n} already exists`)
  const sprint = ensureSprint(ctx, n)
  sprint.goal = op.goal ?? null
  ctx.summary(`Start sprint ${n} (${formatDay(sprint.start)} – ${formatDay(sprint.end)})`)
}

export function applySprintUpdate(op: z.infer<typeof sprintUpdate>, ctx: OpContext): void {
  if (!ctx.state.sprints[op.n]) throw new OpFailure('not-found', `No sprint ${op.n}`, Object.keys(ctx.state.sprints))
  const sprint = ensureSprint(ctx, op.n)
  if (op.goal !== undefined) sprint.goal = op.goal
  if (op.retro !== undefined) sprint.retro = op.retro
  if (op.sections !== undefined) sprint.sections = op.sections
  ctx.summary(`Update sprint ${op.n}`)
}

/**
 * Close a sprint in one step. Done and dropped tasks finished on or before the
 * sprint's last day (workspace-local) move whole from tasks.json into the
 * sprint file; anything finished after the end waits for the next close.
 * Open tasks in an `active` status are recorded as carried and stay put.
 */
export function applySprintClose(op: z.infer<typeof sprintClose>, ctx: OpContext): void {
  const cadence = cadenceOf(ctx)
  const current = sprintOf(ctx.today, cadence)
  const n = op.n ?? (current.start === ctx.today ? current.n - 1 : current.n)
  const { start, end } = sprintBounds(cadence, n)
  if (start > ctx.today) throw new OpFailure('invalid', `Sprint ${n} has not started yet (it starts ${formatDay(start)})`)
  if (ctx.state.sprints[n]?.closedAt) throw new OpFailure('conflict', `Sprint ${n} is already closed`)

  const tz = ctx.state.workspace.timezone
  const finishedBy = (completedAt: string): boolean => todayIn(tz, new Date(Date.parse(completedAt))) <= end
  const tasks = ctx.state.tasks.tasks
  const moving = tasks.filter(t => t.completedAt !== null && finishedBy(t.completedAt))
  const carried = tasks.filter(t => t.completedAt === null && categoryOf(ctx, t) === 'active').map(t => t.key)

  const sprint = ensureSprint(ctx, n)
  const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  for (const task of moving) {
    const target = categoryOf(ctx, task) === 'done' ? sprint.done : sprint.dropped
    target.push(plain(task))
  }
  ctx.state.tasks.tasks = tasks.filter(t => !moving.includes(t))
  sprint.carried = carried
  sprint.velocity = { done: sprint.done.length, carried: carried.length, dropped: sprint.dropped.length }
  if (op.retro !== undefined) sprint.retro = op.retro
  sprint.closedAt = ctx.at
  ctx.touch('tasks.json')

  if (ctx.today < end) ctx.warn('early-close', `Sprint ${n} runs until ${formatDay(end)}; closing it early`)
  const v = sprint.velocity
  ctx.event(`Closed sprint ${n}: ${v.done} done, ${v.carried} carried, ${v.dropped} dropped`, carried)
  ctx.summary(`Close sprint ${n} (${formatDay(start)} – ${formatDay(end)}): ✅ ${v.done} · 🔄 ${v.carried} carried · ❌ ${v.dropped}`)
}
