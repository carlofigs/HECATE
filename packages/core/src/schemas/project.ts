import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { Instant, IsoDate, Keys, Line, Markdown, Section, Slug, Ulid } from '../primitives.ts'
import { checkRange, checkUnique } from './refine.ts'

/** `projects/{slug}.json` — one project. Tasks link to it by `projectId`. */
export const projectSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_VERSION.project),
    id: Ulid,
    /** Also the file name. */
    slug: Slug,
    name: Line,
    subtitle: Line.nullable(),
    summary: Markdown.nullable(),
    status: z.enum(['planned', 'active', 'paused', 'blocked', 'done', 'dropped']),
    phase: Line.nullable(),
    currentFocus: Markdown.nullable(),
    owner: Line.nullable(),
    /** Labelled links or identifiers: a tracker epic, a branch, a doc. */
    refs: z.array(z.strictObject({ label: Line, value: Line })),
    /** `hard` deadlines drive the focus drafter's priorities and callouts. */
    deadlines: z.array(
      z.strictObject({ id: Ulid, date: IsoDate, title: Line, hard: z.boolean(), keys: Keys, note: Line.nullable() }),
    ),
    /** Stakeholder cutoffs, e.g. "sign-off needed before they go on leave". */
    cutoffs: z.array(
      z.strictObject({ id: Ulid, date: IsoDate, personId: Ulid.nullable(), who: Line, what: Line, keys: Keys }),
    ),
    /** `n` is the stable label: OQ-03. */
    openQuestions: z.array(
      z.strictObject({
        id: Ulid,
        n: z.int().min(1),
        question: Markdown,
        blocker: z.boolean(),
        status: z.enum(['open', 'resolved', 'deferred']),
        resolution: Markdown.nullable(),
        keys: Keys,
      }),
    ),
    /** In order: the sequence the focus drafter follows. */
    nextActions: z.array(z.strictObject({ id: Ulid, text: Line, keys: Keys })),
    timeline: z.array(
      z.strictObject({
        id: Ulid,
        phase: Line,
        start: IsoDate.nullable(),
        end: IsoDate.nullable(),
        status: z.enum(['done', 'active', 'pending', 'deferred']),
      }),
    ),
    sections: z.array(Section),
    updatedAt: Instant,
  })
  .superRefine((p, ctx) => {
    checkUnique(ctx, p.deadlines, d => d.id, ['deadlines'], 'id')
    checkUnique(ctx, p.cutoffs, c => c.id, ['cutoffs'], 'id')
    checkUnique(ctx, p.openQuestions, q => q.id, ['openQuestions'], 'id')
    checkUnique(ctx, p.openQuestions, q => q.n, ['openQuestions'], 'question number')
    checkUnique(ctx, p.nextActions, a => a.id, ['nextActions'], 'id')
    checkUnique(ctx, p.timeline, t => t.id, ['timeline'], 'id')
    checkUnique(ctx, p.sections, s => s.id, ['sections'], 'section id')
    p.timeline.forEach((t, i) => checkRange(ctx, t.start, t.end, ['timeline', i, 'end']))
    p.openQuestions.forEach((q, i) => {
      if (q.status === 'resolved' && q.resolution === null) {
        ctx.addIssue({ code: 'custom', path: ['openQuestions', i, 'resolution'], message: 'A resolved question needs its resolution' })
      }
    })
  })
