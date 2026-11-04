import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Instant, IsoDate, Keys, LINE_MESSAGE, LINE_PATTERN, Line, Slug, Ulid } from '../primitives.ts'

/** A Line capped at 200 characters. Its own schema (not Line.max) so the JSON Schema stays self-contained. */
const Delta = z.string().max(200).regex(LINE_PATTERN, LINE_MESSAGE)

/**
 * One line of `activity/{YYYY-Www}.jsonl`. Replaces the session log
 * (`date | area | delta | pointer`): `flag` for an immediate entry, `session`
 * for an end-of-session summary line, `event` for something the system
 * recorded (a task completed, a sprint closed).
 */
export const activityEntrySchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_VERSION.activityEntry),
  id: Ulid,
  at: Instant,
  /** The workspace-local date; decides which weekly file the entry lives in. */
  date: IsoDate,
  actor: z.enum(['app', 'claude', 'bot', 'import']),
  type: z.enum(['flag', 'session', 'event']),
  /** An area id from workspace.json. */
  area: Slug.nullable(),
  /** Verb-led and specific: what changed. */
  delta: Delta,
  /** Where the detail lives: a file, a meeting, a project. */
  pointers: z.array(Line),
  keys: Keys,
  /** The op batch that produced it, for system events. */
  opId: z.string().min(1).nullable(),
})
