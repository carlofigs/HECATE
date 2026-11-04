import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Line, Markdown, Ulid } from '../primitives.ts'
import { checkUnique } from './refine.ts'

/** `glossary.json` — acronyms, codenames and terms, so a session need not ask. */
export const glossarySchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.glossary),
    terms: z.array(
      z.strictObject({
        id: Ulid,
        term: Line,
        aliases: z.array(Line),
        meaning: Markdown,
        projectId: Ulid.nullable(),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    checkUnique(ctx, file.terms, t => t.id, ['terms'], 'id')
    checkUnique(ctx, file.terms, t => t.term.toLowerCase(), ['terms'], 'term')
  })
