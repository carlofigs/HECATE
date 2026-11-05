import { z } from 'zod'
import { CURRENT_VERSION } from '../kinds.ts'
import { pathFor } from '../files.ts'
import { IsoDate, Line, Markdown, Slug, Ulid } from '../primitives.ts'
import { referencePath } from '../state.ts'
import { ensureArea, OpFailure, resolveKeys, type OpContext } from './context.ts'
import { TaskRef } from './tasks.ts'

export const referencePut = z.strictObject({
  type: z.literal('reference.put'),
  /** File name without extension: references/{name}.md. */
  name: Slug,
  content: Markdown,
})
export const referenceRemove = z.strictObject({ type: z.literal('reference.remove'), name: Slug })

export const meetingSave = z.strictObject({
  type: z.literal('meeting.save'),
  id: Ulid.optional(),
  date: IsoDate,
  /** With the date, the file name: meetings/{date}-{slug}.md. Saving again replaces it. */
  slug: Slug,
  title: Line,
  input: z.enum(['transcript', 'notes', 'multi-source']),
  sources: z.array(Line).optional(),
  conflicts: z.int().min(0).optional(),
  /** Person ids. */
  people: z.array(Ulid).optional(),
  /** Project slugs. */
  projects: z.array(Slug).optional(),
  keys: z.array(TaskRef).optional(),
  body: Markdown,
})

export const activityLog = z.strictObject({
  type: z.literal('activity.log'),
  id: Ulid.optional(),
  /** `flag`: something to know now. `session`: one line of an end-of-session summary. */
  entry: z.enum(['flag', 'session']),
  /** An activity area; new areas are added to the workspace. */
  area: z.string().nullable().optional(),
  /** Verb-led and specific, up to 200 characters. */
  delta: Line,
  pointers: z.array(Line).optional(),
  keys: z.array(TaskRef).optional(),
})

export const prepareMeetingSave = (op: z.infer<typeof meetingSave>, newId: () => Ulid) => ({ ...op, id: op.id ?? newId() })
export const prepareActivityLog = (op: z.infer<typeof activityLog>, newId: () => Ulid) => ({ ...op, id: op.id ?? newId() })

export function applyReferencePut(op: z.infer<typeof referencePut>, ctx: OpContext): void {
  const existed = op.name in ctx.state.references
  ctx.state.references[op.name] = op.content.endsWith('\n') ? op.content : `${op.content}\n`
  ctx.touch(referencePath(op.name))
  ctx.summary(`${existed ? 'Update' : 'Add'} reference ${op.name}`)
}

export function applyReferenceRemove(op: z.infer<typeof referenceRemove>, ctx: OpContext): void {
  if (!(op.name in ctx.state.references)) throw new OpFailure('not-found', `No reference "${op.name}"`, Object.keys(ctx.state.references))
  delete ctx.state.references[op.name]
  ctx.remove(referencePath(op.name))
  ctx.summary(`Remove reference ${op.name}`)
}

export function applyMeetingSave(op: z.infer<typeof meetingSave>, ctx: OpContext): void {
  if (ctx.state.workspace.policy === 'sanitised') {
    throw new OpFailure('policy', 'This workspace is sanitised: meeting summaries stay on the work side and are not stored here')
  }
  if (!op.id) throw new OpFailure('invalid', 'meeting.save has no id; run the batch through prepareBatch first')
  const projectIds = (op.projects ?? []).map(slug => {
    const project = ctx.state.projects[slug]
    if (!project) throw new OpFailure('not-found', `No project "${slug}"`, Object.keys(ctx.state.projects))
    return project.id
  })
  for (const id of op.people ?? []) {
    if (!ctx.state.people.people.some(p => p.id === id)) {
      throw new OpFailure('not-found', `No person with id ${id}`, ctx.state.people.people.map(p => `${p.id} (${p.name ?? p.role})`))
    }
  }
  const path = pathFor('meetingFrontmatter', { date: op.date, slug: op.slug })
  const existing = ctx.state.meetings[path]
  ctx.state.meetings[path] = {
    frontmatter: {
      schemaVersion: CURRENT_VERSION.meetingFrontmatter,
      id: existing?.frontmatter.id ?? op.id,
      date: op.date,
      title: op.title,
      input: op.input,
      sources: op.sources ?? [],
      conflicts: op.conflicts ?? 0,
      projectIds,
      personIds: op.people ?? [],
      keys: resolveKeys(ctx, op.keys),
      processedAt: ctx.at,
    },
    // Stored with a trailing newline, exactly as the file holds it.
    body: op.body.endsWith('\n') ? op.body : `${op.body}\n`,
  }
  ctx.touch(path)
  ctx.summary(`${existing ? 'Replace' : 'Save'} meeting notes: ${op.title} (${op.date})`)
}

export function applyActivityLog(op: z.infer<typeof activityLog>, ctx: OpContext, append: (entry: never) => void): void {
  if (!op.id) throw new OpFailure('invalid', 'activity.log has no id; run the batch through prepareBatch first')
  if (op.delta.length > 200) throw new OpFailure('invalid', `An activity line is at most 200 characters (this one is ${op.delta.length})`)
  const area = op.area ? ensureArea(ctx, op.area) : null
  append({
    schemaVersion: CURRENT_VERSION.activityEntry,
    id: op.id,
    at: ctx.at,
    date: ctx.today,
    actor: ctx.actor,
    type: op.entry,
    area,
    delta: op.delta,
    pointers: op.pointers ?? [],
    keys: resolveKeys(ctx, op.keys),
    opId: ctx.opId,
  } as never)
  ctx.summary(`Log (${op.entry}${area ? `, ${area}` : ''}): ${op.delta}`)
}
