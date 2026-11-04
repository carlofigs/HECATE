import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Instant, IsoDate, Keys, Markdown, Section } from '../primitives.ts'
import { taskSchema } from './tasks.ts'
import { checkRange, checkUnique } from './refine.ts'

/**
 * `sprints/{n}.json` — a sprint and, once closed, its review. Closing moves the
 * finished tasks here whole (nothing is lost) and records what carried over.
 */
export const sprintSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.sprint),
    n: z.int(),
    start: IsoDate,
    end: IsoDate,
    goal: Markdown.nullable(),
    closedAt: Instant.nullable(),
    done: z.array(taskSchema),
    dropped: z.array(taskSchema),
    /** Keys still open at close; the tasks themselves stay in tasks.json. */
    carried: Keys,
    retro: Markdown.nullable(),
    /** Counts at close. */
    velocity: z
      .strictObject({ done: z.int().min(0), carried: z.int().min(0), dropped: z.int().min(0) })
      .nullable(),
    sections: z.array(Section),
    /** Imported from v1's week log or archive rather than closed in v2. */
    legacy: z.boolean(),
  })
  .superRefine((s, ctx) => {
    checkRange(ctx, s.start, s.end, ['end'])
    const all = [...s.done.map(t => t.key), ...s.dropped.map(t => t.key), ...s.carried]
    checkUnique(ctx, all, k => k, ['carried'], 'task key across done, dropped and carried')
    checkUnique(ctx, s.sections, x => x.id, ['sections'], 'section id')
  })
