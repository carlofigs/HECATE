/**
 * primitives.ts — the field types every file schema is built from.
 *
 * Expressed as patterns wherever possible (rather than refinements) so the
 * generated JSON Schemas carry the same rules the zod schemas enforce.
 */

import { z } from 'zod'

/** Entity id: a ULID, so ids sort by creation time. Generate with ulid.ts. */
export const Ulid = z.ulid().brand<'Ulid'>().meta({ id: 'Ulid' })
export type Ulid = z.infer<typeof Ulid>

/** A calendar date with no time or zone: `YYYY-MM-DD`. Leap years are checked. */
export const IsoDate = z.iso.date().brand<'IsoDate'>().meta({ id: 'IsoDate' })
export type IsoDate = z.infer<typeof IsoDate>

/** A moment in time, in UTC (`…Z`), any sub-second precision. */
export const Instant = z.iso.datetime().meta({ id: 'Instant' })
export type Instant = z.infer<typeof Instant>

/** A wall-clock time in the workspace's zone: `HH:MM`, 24-hour. */
export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24-hour)').meta({ id: 'Time' })

/** A kebab-case identifier: statuses, tags, areas, section ids, project slugs. */
export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Expected a kebab-case slug').meta({ id: 'Slug' })

/**
 * Plain single-line text with no leading or trailing whitespace. Titles, names,
 * leads. Not markdown: renderers add any emphasis.
 */
export const LINE_PATTERN = /^\S(?:[^\r\n]*\S)?$/
export const LINE_MESSAGE = 'Expected a single line of text without leading or trailing spaces'
export const Line = z.string().max(500).regex(LINE_PATTERN, LINE_MESSAGE).meta({ id: 'Line' })

/** Free-form markdown: notes, details, retro text. */
export const Markdown = z.string().meta({ id: 'Markdown', contentMediaType: 'text/markdown' })

/** A task key: `A` series for my actions, `B` for things I am waiting on. */
export const TaskKey = z
  .string()
  .regex(/^[AB][1-9]\d*$/, 'Expected a task key such as A12 or B3')
  .brand<'TaskKey'>()
  .meta({ id: 'TaskKey' })
export type TaskKey = z.infer<typeof TaskKey>

/** One urgency scale everywhere: 🔴 high · 🟡 med · 🟢 low. */
export const Urgency = z.enum(['high', 'med', 'low']).meta({ id: 'Urgency' })
export type Urgency = z.infer<typeof Urgency>

/** A titled block of free-form markdown, for anything without its own field. */
export const Section = z
  .strictObject({
    id: Slug,
    title: Line,
    content: Markdown,
  })
  .meta({ id: 'Section' })
export type Section = z.infer<typeof Section>

/** Task keys referenced by an item (rendered as chips). */
export const Keys = z.array(TaskKey).meta({ id: 'Keys' })
