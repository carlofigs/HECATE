import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Instant, Line, Markdown, Ulid } from '../primitives.ts'
import { checkUnique } from './refine.ts'

/** `profile.json` — standing context about the owner, read at the start of a session. */
export const profileSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.profile),
    updatedAt: Instant,
    me: Markdown,
    preferences: Markdown,
    productivitySystem: Markdown,
    responsibilities: z.array(
      z.strictObject({
        id: Ulid,
        name: Line,
        /** Free text: "Weekly", "Monday mornings", "As needed". */
        cadence: Line,
        notes: Markdown.nullable(),
      }),
    ),
  })
  .superRefine((p, ctx) => {
    checkUnique(ctx, p.responsibilities, r => r.id, ['responsibilities'], 'id')
  })
