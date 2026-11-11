import { z } from 'zod'
import { IsoDate, Line, LINE_MAX, Markdown, Slug, Ulid } from '../primitives.ts'
import { sprintPath } from '../state.ts'
import { OpFailure, type OpContext } from './context.ts'

const Ooo = z.strictObject({ start: IsoDate, end: IsoDate, note: Line.nullable().optional() })

export const personUpsert = z.strictObject({
  type: z.literal('person.upsert'),
  /** Updates the person with this id; adds a new person when it is new or left out. */
  id: Ulid.optional(),
  /** Must stay unset in a sanitised workspace: record the role only. */
  name: Line.nullable().optional(),
  aliases: z.array(Line).optional(),
  /** Required when adding a person. */
  role: Line.optional(),
  notes: Markdown.nullable().optional(),
  /** Replaces the person's leave and travel ranges. */
  ooo: z.array(Ooo).optional(),
})
export const personRemove = z.strictObject({ type: z.literal('person.remove'), id: Ulid })

export const termUpsert = z.strictObject({
  type: z.literal('term.upsert'),
  /** Updates this term; without an id, a term with the same name (any case) is updated, otherwise one is added. */
  id: Ulid.optional(),
  term: Line,
  aliases: z.array(Line).optional(),
  /** Required when adding a term. */
  meaning: Markdown.optional(),
  project: Slug.nullable().optional(),
})
export const termRemove = z.strictObject({ type: z.literal('term.remove'), id: Ulid })

export const preparePersonUpsert = (op: z.infer<typeof personUpsert>, newId: () => Ulid) => ({ ...op, id: op.id ?? newId() })
export const prepareTermUpsert = (op: z.infer<typeof termUpsert>, newId: () => Ulid) => ({ ...op, id: op.id ?? newId() })

const describe = (p: { name: string | null; role: string }): string => (p.name ? `${p.name} (${p.role})` : p.role)

export function applyPersonUpsert(op: z.infer<typeof personUpsert>, ctx: OpContext): void {
  if (!op.id) throw new OpFailure('invalid', 'person.upsert has no id; run the batch through prepareBatch first')
  const file = ctx.state.people
  const existing = file.people.find(p => p.id === op.id)
  const ooo = op.ooo?.map(r => ({ start: r.start, end: r.end, note: r.note ?? null }))
  if (existing) {
    if (op.name !== undefined) existing.name = op.name
    if (op.aliases !== undefined) existing.aliases = op.aliases
    if (op.role !== undefined) existing.role = op.role
    if (op.notes !== undefined) existing.notes = op.notes
    if (ooo !== undefined) existing.ooo = ooo
    ctx.summary(`Update person: ${describe(existing)}`)
  } else {
    if (!op.role) throw new OpFailure('invalid', 'A new person needs a role')
    file.people.push({ id: op.id, name: op.name ?? null, aliases: op.aliases ?? [], role: op.role, notes: op.notes ?? null, ooo: ooo ?? [] })
    ctx.summary(`Add person: ${describe({ name: op.name ?? null, role: op.role })}`)
  }
  file.updatedAt = ctx.at
  ctx.touch('people.json')
}

export function applyPersonRemove(op: z.infer<typeof personRemove>, ctx: OpContext): void {
  const file = ctx.state.people
  const person = file.people.find(p => p.id === op.id)
  if (!person) throw new OpFailure('not-found', `No person with id ${op.id}`, file.people.map(p => `${p.id} (${describe(p)})`))
  const refs = [
    ...ctx.state.tasks.tasks.filter(t => t.waitingOn?.personId === op.id).map(t => `task ${t.key}`),
    ...Object.values(ctx.state.projects).flatMap(p => p.cutoffs.filter(c => c.personId === op.id).map(() => `project ${p.slug} cutoff`)),
    ...Object.entries(ctx.state.meetings).filter(([, m]) => m.frontmatter.personIds.includes(op.id as never)).map(([path]) => path),
  ]
  if (refs.length > 0) throw new OpFailure('conflict', `${describe(person)} is still referenced by ${refs.join(', ')}`, refs)

  // Archived tasks can never be edited to drop the link, so the archive keeps
  // who they waited on as text instead (ADR 0004): it reads exactly as before.
  const label = person.name ?? person.role
  const detached: string[] = []
  for (const sprint of Object.values(ctx.state.sprints)) {
    const tasks = [...sprint.done, ...sprint.dropped].filter(t => t.waitingOn?.personId === op.id)
    for (const t of tasks) {
      t.waitingOn = { personId: null, text: asText(label, t.waitingOn?.text ?? null) }
      detached.push(t.key)
    }
    if (tasks.length > 0) ctx.touch(sprintPath(sprint.n))
  }

  file.people.splice(file.people.indexOf(person), 1)
  file.updatedAt = ctx.at
  ctx.touch('people.json')
  ctx.summary(`Remove person: ${describe(person)}${detached.length > 0 ? ` (${detached.join(', ')} keep${detached.length === 1 ? 's' : ''} them as text)` : ''}`)
}

/** Who a task waited on, as one line: the person's label and any text, joined as every view shows them. */
function asText(label: string, text: string | null): string {
  const line = text ? `${label} — ${text}` : label
  if (line.length <= LINE_MAX) return line
  // Cut on a character boundary, never inside a surrogate pair or after a space.
  return `${line.slice(0, LINE_MAX - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd()}…`
}

export function applyTermUpsert(op: z.infer<typeof termUpsert>, ctx: OpContext): void {
  const terms = ctx.state.glossary.terms
  // prepareBatch always fills the id, so a new id still matches an existing term by name.
  const existing = terms.find(t => t.id === op.id) ?? terms.find(t => t.term.toLowerCase() === op.term.toLowerCase())
  let projectId: string | null | undefined
  if (op.project !== undefined) {
    if (op.project === null) projectId = null
    else {
      const project = ctx.state.projects[op.project]
      if (!project) throw new OpFailure('not-found', `No project "${op.project}"`, Object.keys(ctx.state.projects))
      projectId = project.id
    }
  }
  if (existing) {
    existing.term = op.term
    if (op.aliases !== undefined) existing.aliases = op.aliases
    if (op.meaning !== undefined) existing.meaning = op.meaning
    if (projectId !== undefined) existing.projectId = projectId as never
    ctx.summary(`Update term: ${op.term}`)
  } else {
    if (op.meaning === undefined) throw new OpFailure('invalid', `A new term needs its meaning ("${op.term}")`)
    if (!op.id) throw new OpFailure('invalid', 'term.upsert adding a term has no id; run the batch through prepareBatch first')
    terms.push({ id: op.id, term: op.term, aliases: op.aliases ?? [], meaning: op.meaning, projectId: projectId ?? null } as never)
    ctx.summary(`Add term: ${op.term}`)
  }
  ctx.touch('glossary.json')
}

export function applyTermRemove(op: z.infer<typeof termRemove>, ctx: OpContext): void {
  const terms = ctx.state.glossary.terms
  const term = terms.find(t => t.id === op.id)
  if (!term) throw new OpFailure('not-found', `No term with id ${op.id}`, terms.map(t => `${t.id} (${t.term})`))
  terms.splice(terms.indexOf(term), 1)
  ctx.touch('glossary.json')
  ctx.summary(`Remove term: ${term.term}`)
}
