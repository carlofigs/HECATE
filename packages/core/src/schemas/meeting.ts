import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Instant, IsoDate, Keys, Line, Ulid } from '../primitives.ts'

/**
 * Front matter of `meetings/{date}-{slug}.md`, a processed meeting summary.
 * The body is markdown. Not allowed in sanitised workspaces (ADR 0005).
 */
export const meetingFrontmatterSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_VERSION.meetingFrontmatter),
  id: Ulid,
  date: IsoDate,
  title: Line,
  input: z.enum(['transcript', 'notes', 'multi-source']),
  sources: z.array(Line),
  /** How many conflicts between sources were surfaced for review. */
  conflicts: z.int().min(0),
  projectIds: z.array(Ulid),
  personIds: z.array(Ulid),
  /** Tasks created or referenced. */
  keys: Keys,
  processedAt: Instant,
})
