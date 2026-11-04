import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { KEY_SERIES, type KeyPrefix } from '../constants.ts'
import { Instant, IsoDate, Keys, Line, Markdown, Slug, TaskKey, Ulid, Urgency } from '../primitives.ts'
import { checkUnique } from './refine.ts'

const KEY_RE = /^([AB])([1-9]\d*)$/

export const TaskKind = z.enum(['action', 'waiting'])
export type TaskKind = z.infer<typeof TaskKind>

/** Fractional-index sort key: compare as strings; insert between two by generating a key between them. */
export const OrderKey = z.string().regex(/^[0-9A-Za-z]+$/, 'Expected a fractional-index order key ([0-9A-Za-z]+)')

/**
 * One task. `key` (A12 / B3) is how everything refers to it — immutable and
 * never reused. `id` exists so a retried "add" is recognised as the same task.
 */
export const taskSchema = z
  .strictObject({
    id: Ulid,
    key: TaskKey,
    /** Ids this task had before v2 (`t-a12`, `w-05`, …) so old references still resolve. */
    legacyIds: z.array(Line),
    /** `action` for A keys, `waiting` for B keys. */
    kind: TaskKind,
    title: Line,
    note: Markdown.nullable(),
    /** A status id from workspace.json. */
    status: Slug,
    order: OrderKey,
    urgency: Urgency.nullable(),
    tags: z.array(Slug),
    projectId: Ulid.nullable(),
    /** Who or what a `waiting` task waits on. A person, a free-text role, or both. Null for actions. */
    waitingOn: z.strictObject({ personId: Ulid.nullable(), text: Line.nullable() }).nullable(),
    /** Tasks that must finish first. A task is blocked while any of these is open. */
    dependsOn: Keys,
    due: IsoDate.nullable(),
    createdAt: Instant,
    updatedAt: Instant,
    completedAt: Instant.nullable(),
  })
  .superRefine((t, ctx) => {
    // zod runs refinements even when a field failed only a format check, so
    // re-check the key's shape before using it (the regex issue is already reported).
    const prefix = KEY_RE.exec(t.key)?.[1] as KeyPrefix | undefined
    const series = prefix ? KEY_SERIES[prefix] : undefined
    if (series && t.kind !== series.kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message: `${t.key} is in the ${prefix} series, which holds "${series.kind}" tasks, not "${t.kind}"`,
      })
    }
    if (t.kind === 'action' && t.waitingOn !== null) {
      ctx.addIssue({ code: 'custom', path: ['waitingOn'], message: 'Only waiting (B) tasks have waitingOn' })
    }
    if (t.dependsOn.includes(t.key)) {
      ctx.addIssue({ code: 'custom', path: ['dependsOn'], message: `${t.key} cannot depend on itself` })
    }
    checkUnique(ctx, t.dependsOn, k => k, ['dependsOn'], 'dependency')
  })
  .meta({ id: 'Task' })

export type Task = z.infer<typeof taskSchema>

export const NextKey = z.strictObject({
  A: z.int().min(1),
  B: z.int().min(1),
})
export type NextKey = z.infer<typeof NextKey>

/** `tasks.json` — every open and recently finished task, flat. Closed sprints move theirs to sprints/{n}.json. */
export const tasksSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.tasks),
    /** The next number to hand out in each series. Never decreases, so keys are never reused. */
    nextKey: NextKey,
    tasks: z.array(taskSchema),
  })
  .superRefine((file, ctx) => {
    checkUnique(ctx, file.tasks, t => t.id, ['tasks'], 'task id')
    checkUnique(ctx, file.tasks, t => t.key, ['tasks'], 'task key')
    checkUnique(
      ctx,
      file.tasks.flatMap(t => t.legacyIds),
      id => id,
      ['tasks'],
      'legacy id',
    )
    file.tasks.forEach((t, i) => {
      const m = KEY_RE.exec(t.key)
      if (!m) return
      const prefix = m[1] as KeyPrefix
      const n = Number(m[2])
      if (n >= file.nextKey[prefix]) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', i, 'key'],
          message: `${t.key} is not below nextKey.${prefix} (${file.nextKey[prefix]}); keys must be allocated, not invented`,
        })
      }
    })
  })
