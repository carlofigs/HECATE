import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Instant, IsoDate, Line, Markdown, Ulid } from '../primitives.ts'
import { checkRange, checkUnique } from './refine.ts'

/**
 * One person. In a sanitised workspace (ADR 0005) people are roles only:
 * `name` stays null and `aliases` empty (see policy.ts).
 */
export const Person = z
  .strictObject({
    id: Ulid,
    name: Line.nullable(),
    aliases: z.array(Line),
    role: Line,
    notes: Markdown.nullable(),
    /** Leave or travel: the focus drafter uses these for sign-off cutoffs. */
    ooo: z.array(z.strictObject({ start: IsoDate, end: IsoDate, note: Line.nullable() })),
  })
  .superRefine((p, ctx) => {
    p.ooo.forEach((r, i) => checkRange(ctx, r.start, r.end, ['ooo', i, 'end']))
  })

/** `people.json` */
export const peopleSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.people),
    updatedAt: Instant,
    people: z.array(Person),
  })
  .superRefine((file, ctx) => {
    checkUnique(ctx, file.people, p => p.id, ['people'], 'id')
  })
