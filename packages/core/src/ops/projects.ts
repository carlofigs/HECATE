import { z } from 'zod'
import { IsoDate, Line, Markdown, Section, Slug, Ulid } from '../primitives.ts'
import { CURRENT_VERSION } from '../kinds.ts'
import { projectPath } from '../state.ts'
import { OpFailure, resolveKeys, withIds, type OpContext } from './context.ts'
import { TaskRef } from './tasks.ts'

const Keys = z.array(TaskRef)
const ProjectStatus = z.enum(['planned', 'active', 'paused', 'blocked', 'done', 'dropped'])

const DeadlineInput = z.strictObject({ id: Ulid.optional(), date: IsoDate, title: Line, hard: z.boolean().optional(), keys: Keys.optional(), note: Line.nullable().optional() })
const CutoffInput = z.strictObject({ id: Ulid.optional(), date: IsoDate, personId: Ulid.nullable().optional(), who: Line, what: Line, keys: Keys.optional() })
const QuestionInput = z.strictObject({
  id: Ulid.optional(),
  /** OQ number; the next free one when left out. */
  n: z.int().min(1).optional(),
  question: Markdown,
  blocker: z.boolean().optional(),
  status: z.enum(['open', 'resolved', 'deferred']).optional(),
  resolution: Markdown.nullable().optional(),
  keys: Keys.optional(),
})
const NextActionInput = z.strictObject({ id: Ulid.optional(), text: Line, keys: Keys.optional() })
const TimelineInput = z.strictObject({
  id: Ulid.optional(), phase: Line, start: IsoDate.nullable().optional(), end: IsoDate.nullable().optional(),
  status: z.enum(['done', 'active', 'pending', 'deferred']),
})

const projectFields = {
  name: Line,
  subtitle: Line.nullable(),
  summary: Markdown.nullable(),
  status: ProjectStatus,
  phase: Line.nullable(),
  currentFocus: Markdown.nullable(),
  owner: Line.nullable(),
  refs: z.array(z.strictObject({ label: Line, value: Line })),
  deadlines: z.array(DeadlineInput),
  cutoffs: z.array(CutoffInput),
  openQuestions: z.array(QuestionInput),
  /** In order: the sequence to work through. */
  nextActions: z.array(NextActionInput),
  timeline: z.array(TimelineInput),
  sections: z.array(Section),
}

export const projectCreate = z.strictObject({
  type: z.literal('project.create'),
  id: Ulid.optional(),
  /** Also the file name: projects/{slug}.json. Cannot change later. */
  slug: Slug,
  name: Line,
  ...z.strictObject(projectFields).omit({ name: true }).partial().shape,
})

export const projectUpdate = z.strictObject({
  type: z.literal('project.update'),
  slug: Slug,
  /** Lists are replaced whole. */
  patch: z.strictObject(projectFields).partial(),
})

export const projectAddOpenQuestion = z.strictObject({
  type: z.literal('project.addOpenQuestion'),
  slug: Slug,
  id: Ulid.optional(),
  question: Markdown,
  blocker: z.boolean().optional(),
  keys: Keys.optional(),
})

export const projectResolveOpenQuestion = z.strictObject({
  type: z.literal('project.resolveOpenQuestion'),
  slug: Slug,
  /** The OQ number. */
  n: z.int().min(1),
  status: z.enum(['resolved', 'deferred']),
  resolution: Markdown.nullable().optional(),
})

type Create = z.infer<typeof projectCreate>
type Patch = z.infer<typeof projectUpdate>['patch']

const LISTS = ['deadlines', 'cutoffs', 'openQuestions', 'nextActions', 'timeline'] as const

function prepareLists<T extends Partial<Pick<Patch, (typeof LISTS)[number]>>>(fields: T, newId: () => Ulid): T {
  const out = { ...fields }
  for (const list of LISTS) {
    const items = fields[list] as { id?: string }[] | undefined
    if (items) (out as Record<string, unknown>)[list] = withIds(items, newId)
  }
  return out
}

export const prepareProjectCreate = (op: Create, newId: () => Ulid): Create => ({ ...prepareLists(op, newId), id: op.id ?? newId() })
export const prepareProjectUpdate = (op: z.infer<typeof projectUpdate>, newId: () => Ulid) => ({ ...op, patch: prepareLists(op.patch, newId) })
export const prepareAddQuestion = (op: z.infer<typeof projectAddOpenQuestion>, newId: () => Ulid) => ({ ...op, id: op.id ?? newId() })

function project(ctx: OpContext, slug: string) {
  const p = ctx.state.projects[slug]
  if (!p) throw new OpFailure('not-found', `No project "${slug}"`, Object.keys(ctx.state.projects))
  return p
}

function personRef(ctx: OpContext, id: string | null | undefined): string | null {
  if (id === null || id === undefined) return null
  if (!ctx.state.people.people.some(p => p.id === id)) throw new OpFailure('not-found', `No person with id ${id}`, ctx.state.people.people.map(p => `${p.id} (${p.role})`))
  return id
}

/** Turn validated list inputs into stored items. */
function lists(ctx: OpContext, p: Partial<Pick<Patch, (typeof LISTS)[number]>>, existingQuestions: { n: number }[] = []) {
  const out: Record<string, unknown> = {}
  if (p.deadlines) out.deadlines = p.deadlines.map(d => ({ id: d.id, date: d.date, title: d.title, hard: d.hard ?? false, keys: resolveKeys(ctx, d.keys), note: d.note ?? null }))
  if (p.cutoffs) out.cutoffs = p.cutoffs.map(c => ({ id: c.id, date: c.date, personId: personRef(ctx, c.personId), who: c.who, what: c.what, keys: resolveKeys(ctx, c.keys) }))
  if (p.openQuestions) {
    let next = Math.max(0, ...existingQuestions.map(q => q.n), ...p.openQuestions.map(q => q.n ?? 0)) + 1
    out.openQuestions = p.openQuestions.map(q => ({
      id: q.id, n: q.n ?? next++, question: q.question, blocker: q.blocker ?? false, status: q.status ?? 'open',
      resolution: q.resolution ?? null, keys: resolveKeys(ctx, q.keys),
    }))
  }
  if (p.nextActions) out.nextActions = p.nextActions.map(a => ({ id: a.id, text: a.text, keys: resolveKeys(ctx, a.keys) }))
  if (p.timeline) out.timeline = p.timeline.map(t => ({ id: t.id, phase: t.phase, start: t.start ?? null, end: t.end ?? null, status: t.status }))
  return out
}

export function applyProjectCreate(op: Create, ctx: OpContext): void {
  if (!op.id) throw new OpFailure('invalid', 'project.create has no id; run the batch through prepareBatch first')
  if (ctx.state.projects[op.slug]) throw new OpFailure('conflict', `Project "${op.slug}" already exists`, Object.keys(ctx.state.projects))
  ctx.state.projects[op.slug] = {
    schemaVersion: CURRENT_VERSION.project,
    id: op.id,
    slug: op.slug,
    name: op.name,
    subtitle: op.subtitle ?? null,
    summary: op.summary ?? null,
    status: op.status ?? 'active',
    phase: op.phase ?? null,
    currentFocus: op.currentFocus ?? null,
    owner: op.owner ?? null,
    refs: op.refs ?? [],
    deadlines: [],
    cutoffs: [],
    openQuestions: [],
    nextActions: [],
    timeline: [],
    sections: op.sections ?? [],
    updatedAt: ctx.at,
    ...lists(ctx, op),
  }
  ctx.touch(projectPath(op.slug))
  ctx.summary(`Create project "${op.name}" (${op.slug})`)
}

export function applyProjectUpdate(op: z.infer<typeof projectUpdate>, ctx: OpContext): void {
  const p = project(ctx, op.slug)
  const patch = op.patch
  for (const field of ['name', 'subtitle', 'summary', 'status', 'phase', 'currentFocus', 'owner', 'refs', 'sections'] as const) {
    if (patch[field] !== undefined) (p as Record<string, unknown>)[field] = patch[field]
  }
  Object.assign(p, lists(ctx, patch))
  p.updatedAt = ctx.at
  ctx.touch(projectPath(op.slug))
  ctx.summary(`Update project "${p.name}": ${Object.keys(patch).join(', ') || 'nothing'}`)
}

export function applyProjectAddOpenQuestion(op: z.infer<typeof projectAddOpenQuestion>, ctx: OpContext): void {
  if (!op.id) throw new OpFailure('invalid', 'project.addOpenQuestion has no id; run the batch through prepareBatch first')
  const p = project(ctx, op.slug)
  const n = Math.max(0, ...p.openQuestions.map(q => q.n)) + 1
  p.openQuestions.push({
    id: op.id, n, question: op.question, blocker: op.blocker ?? false, status: 'open', resolution: null, keys: resolveKeys(ctx, op.keys),
  } as never)
  p.updatedAt = ctx.at
  ctx.touch(projectPath(op.slug))
  ctx.summary(`Add OQ-${String(n).padStart(2, '0')} to "${p.name}"${op.blocker ? ' (blocker)' : ''}`)
}

export function applyProjectResolveOpenQuestion(op: z.infer<typeof projectResolveOpenQuestion>, ctx: OpContext): void {
  const p = project(ctx, op.slug)
  const q = p.openQuestions.find(x => x.n === op.n)
  if (!q) throw new OpFailure('not-found', `No OQ-${String(op.n).padStart(2, '0')} in "${p.name}"`, p.openQuestions.map(x => `OQ-${String(x.n).padStart(2, '0')}`))
  if (op.status === 'resolved' && !op.resolution) throw new OpFailure('invalid', 'Resolving a question needs its resolution')
  q.status = op.status
  q.resolution = op.resolution ?? null
  p.updatedAt = ctx.at
  ctx.touch(projectPath(op.slug))
  ctx.summary(`${op.status === 'resolved' ? 'Resolve' : 'Defer'} OQ-${String(op.n).padStart(2, '0')} in "${p.name}"`)
}
