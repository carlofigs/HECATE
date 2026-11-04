import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { isValidTimeZone } from '../dates.ts'
import { IsoDate, Line, Slug } from '../primitives.ts'
import { checkUnique } from './refine.ts'

/**
 * What a status means to automation (board order, sprint close, Waiting On).
 * Mirrors v1's column types; the names and order of statuses are the workspace's own.
 */
export const StatusCategory = z.enum(['backlog', 'todo', 'active', 'done', 'dropped'])
export type StatusCategory = z.infer<typeof StatusCategory>

/** The integer ISO weekday: 1 = Monday … 7 = Sunday. */
const IsoWeekday = z.int().min(1).max(7)

const REQUIRED_CATEGORIES = ['todo', 'active', 'done', 'dropped'] as const

export const Status = z.strictObject({
  id: Slug,
  name: Line,
  category: StatusCategory,
})

export const SprintSettings = z.strictObject({
  /** First day of sprint `anchorNumber`. Its weekday is the start day of every sprint. */
  anchor: IsoDate,
  anchorNumber: z.int().min(0),
  lengthWeeks: z.int().min(1).max(4),
  /** A second numbering shown alongside, e.g. an external tracker's sprint = ours + offset. */
  external: z.strictObject({ label: Line, offset: z.int() }).nullable(),
})

/** `workspace.json` — settings for one workspace. Changes rarely; never per task. */
export const workspaceSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.workspace),
    name: Line,
    timezone: z.string().refine(isValidTimeZone, 'Expected an IANA time zone, e.g. Australia/Sydney'),
    /** `sanitised`: roles instead of names, no meeting notes (ADR 0005). */
    policy: z.enum(['open', 'sanitised']),
    /** Days that count as working days (Done sections, Week at a Glance). */
    workdays: z.array(IsoWeekday).min(1).max(7),
    sprint: SprintSettings.nullable(),
    /** Board order is array order. */
    statuses: z.array(Status),
    tags: z.array(z.strictObject({ id: Slug, label: Line.nullable() })),
    /** Activity log areas, e.g. `bau`, `admin`. */
    areas: z.array(z.strictObject({ id: Slug, label: Line })),
  })
  .superRefine((ws, ctx) => {
    checkUnique(ctx, ws.workdays, d => d, ['workdays'], 'workday')
    checkUnique(ctx, ws.statuses, s => s.id, ['statuses'], 'status id')
    checkUnique(ctx, ws.tags, t => t.id, ['tags'], 'tag id')
    checkUnique(ctx, ws.areas, a => a.id, ['areas'], 'area id')
    for (const category of REQUIRED_CATEGORIES) {
      if (!ws.statuses.some(s => s.category === category)) {
        ctx.addIssue({ code: 'custom', path: ['statuses'], message: `Needs at least one status in the "${category}" category` })
      }
    }
  })
