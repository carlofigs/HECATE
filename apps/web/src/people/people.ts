/**
 * People and glossary forms, and the ops they save as. Pure, so the rules
 * are tested without a browser; the components only render them.
 *
 * person.upsert patches the fields it is given, but replaces `aliases` and
 * `ooo` whole: leave is always saved as the full list, so Undo puts back the
 * previous list exactly. A sanitised workspace records people by role only,
 * so the forms never offer a name or aliases there (ADR 0005).
 */
import { personLabel, ulid, type PersonView, type WorkspaceState } from '@hecate/core'
import { checkLine, nullable, sameList } from '../forms.ts'

export type Person = PersonView['person']
export type Term = WorkspaceState['glossary']['terms'][number]
type Range = Person['ooo'][number]

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Lines typed one per line or separated by commas: trimmed, in order, each once. */
const linesIn = (text: string): string[] => [...new Set(text.split(/[\n,]/).map(s => s.trim()).filter(Boolean))]

export const isSanitised = (state: WorkspaceState): boolean => state.workspace.policy === 'sanitised'

/** People as a choice for a picker: None first, then by label (name, or role in a sanitised workspace). */
export function personOptions(state: WorkspaceState): { value: string; label: string }[] {
  const people = state.people.people
    .map(p => ({ value: p.id, label: p.name ? `${p.name} (${p.role})` : p.role, sort: personLabel(state, p.id) ?? p.role }))
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(({ value, label }) => ({ value, label }))
  return [{ value: '', label: 'None' }, ...people]
}

// ─── A person ───────────────────────────────────────────────────────────────

export interface PersonForm {
  role: string
  name: string
  aliases: string
  notes: string
}

export type PersonErrors = Partial<Record<keyof PersonForm, string>>

export const emptyPersonForm = (): PersonForm => ({ role: '', name: '', aliases: '', notes: '' })

export const personForm = (p: Person): PersonForm => ({ role: p.role, name: p.name ?? '', aliases: p.aliases.join(', '), notes: p.notes ?? '' })

export function validatePerson(state: WorkspaceState, form: PersonForm): PersonErrors {
  const errors: PersonErrors = {}
  const role = checkLine(form.role, { name: 'the role', missing: 'Give their role, such as Data engineer or Finance team.', oneLine: 'Keep the role on one line; put the rest in the notes.' })
  if (role) errors.role = role
  if (isSanitised(state)) {
    if (form.name.trim()) errors.name = 'This workspace is sanitised: record the role only, without a name.'
    if (linesIn(form.aliases).length > 0) errors.aliases = 'This workspace is sanitised: people carry no aliases.'
    return errors
  }
  const name = checkLine(form.name, { name: 'the name', oneLine: 'Keep the name on one line.' })
  if (name) errors.name = name
  const long = linesIn(form.aliases).find(a => a.length > 500)
  if (long) errors.aliases = 'Shorten each alias to 500 characters or fewer.'
  return errors
}

/**
 * One person.upsert: a new person with an id chosen here (so the page can open
 * them at once), or the fields that changed. Nothing when nothing changed.
 */
export function personOps(state: WorkspaceState, form: PersonForm, existing: Person | null, newId: () => string = ulid): unknown[] {
  const fields: Record<string, unknown> = { role: form.role.trim(), notes: nullable(form.notes) }
  if (!isSanitised(state)) Object.assign(fields, { name: nullable(form.name), aliases: linesIn(form.aliases) })
  if (!existing) return [{ type: 'person.upsert', id: newId(), ...fields }]
  const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => {
    const before = existing[k as keyof Person]
    return Array.isArray(v) ? !sameList(v as string[], before as string[]) : v !== before
  }))
  return Object.keys(patch).length > 0 ? [{ type: 'person.upsert', id: existing.id, ...patch }] : []
}

export const removePersonOps = (p: Person): unknown[] => [{ type: 'person.remove', id: p.id }]

/** The remove confirmation: what goes, and what archived tasks keep (person.remove turns their link into text). */
export function removalDescription(view: Pick<PersonView, 'label' | 'archived'>): string {
  const gone = `${view.label} is removed from People, with their notes and leave.`
  const keys = view.archived.map(t => t.key)
  if (keys.length === 0) return `${gone} Nothing else refers to them.`
  const where = view.archived.length === 1 ? `, archived in sprint ${view.archived[0]?.sprint},` : ', already archived,'
  const listed = keys.length === 1 ? keys[0] : `${keys.slice(0, -1).join(', ')} and ${keys.at(-1)}`
  return `${gone} ${listed}${where} ${keys.length === 1 ? 'keeps' : 'keep'} “${view.label}” as text.`
}

// ─── Leave ──────────────────────────────────────────────────────────────────

export interface LeaveForm {
  start: string
  end: string
  note: string
}

export type LeaveErrors = Partial<Record<keyof LeaveForm, string>>

/** Leave ranges have no id of their own; the form knows one by its place in the person's list. */
export const leaveForm = (r: Range): LeaveForm => ({ start: r.start, end: r.end, note: r.note ?? '' })
export const emptyLeaveForm = (): LeaveForm => ({ start: '', end: '', note: '' })

export function validateLeave(form: LeaveForm): LeaveErrors {
  const errors: LeaveErrors = {}
  if (!form.start) errors.start = 'Choose the first day away.'
  else if (!DATE.test(form.start)) errors.start = 'Use a date such as 2026-11-30.'
  if (!form.end) errors.end = 'Choose the last day away; the same day for one day.'
  else if (!DATE.test(form.end)) errors.end = 'Use a date such as 2026-11-30.'
  else if (form.start && form.end < form.start) errors.end = 'The last day cannot be before the first.'
  const note = checkLine(form.note, { name: 'the note', oneLine: 'Keep the note on one line.' })
  if (note) errors.note = note
  return errors
}

const leaveOp = (p: Person, ooo: readonly Range[]) => ({ type: 'person.upsert', id: p.id, ooo: ooo.map(r => ({ start: r.start, end: r.end, note: r.note })) })

/** The whole list with the range at `index` replaced (or added when index is null). Nothing when nothing changed. */
export function saveLeaveOps(p: Person, form: LeaveForm, index: number | null): unknown[] {
  const range: Range = { start: form.start as Range['start'], end: form.end as Range['end'], note: nullable(form.note) }
  const before = index === null ? undefined : p.ooo[index]
  if (before && before.start === range.start && before.end === range.end && before.note === range.note) return []
  return [leaveOp(p, before ? p.ooo.map((r, i) => (i === index ? range : r)) : [...p.ooo, range])]
}

export const removeLeaveOps = (p: Person, index: number): unknown[] => [leaveOp(p, p.ooo.filter((_, i) => i !== index))]

/** Puts the leave list back as it is now: the exact undo of any change to it. */
export const restoreLeaveOps = (p: Person): unknown[] => [leaveOp(p, p.ooo)]

// ─── The glossary ───────────────────────────────────────────────────────────

export interface TermForm {
  term: string
  aliases: string
  meaning: string
  /** A project slug. */
  project: string
}

export type TermErrors = Partial<Record<keyof TermForm, string>>

const slugOf = (state: WorkspaceState, projectId: string | null): string =>
  projectId === null ? '' : (Object.values(state.projects).find(p => p.id === projectId)?.slug ?? '')

export const emptyTermForm = (): TermForm => ({ term: '', aliases: '', meaning: '', project: '' })

export const termForm = (state: WorkspaceState, t: Term): TermForm => ({ term: t.term, aliases: t.aliases.join(', '), meaning: t.meaning, project: slugOf(state, t.projectId) })

export function validateTerm(state: WorkspaceState, form: TermForm, existing: Term | null): TermErrors {
  const errors: TermErrors = {}
  const term = checkLine(form.term, { name: 'the term', missing: 'Write the term.', oneLine: 'Keep the term on one line; put the rest in the meaning.' })
  if (term) errors.term = term
  else {
    const clash = state.glossary.terms.find(t => t.id !== existing?.id && t.term.toLowerCase() === form.term.trim().toLowerCase())
    if (clash) errors.term = `“${clash.term}” is already in the glossary. Edit that one instead.`
  }
  if (!form.meaning.trim()) errors.meaning = 'Say what it means.'
  if (form.project && !state.projects[form.project]) errors.project = 'Choose a project from the list.'
  return errors
}

const termInput = (state: WorkspaceState, t: Term) => ({ type: 'term.upsert', id: t.id, term: t.term, aliases: t.aliases, meaning: t.meaning, project: slugOf(state, t.projectId) || null })

/** One term.upsert of the whole term, with its id; nothing when nothing changed. */
export function termOps(state: WorkspaceState, form: TermForm, existing: Term | null, newId: () => string = ulid): unknown[] {
  const next = { term: form.term.trim(), aliases: linesIn(form.aliases), meaning: form.meaning.trim(), project: nullable(form.project) }
  if (existing) {
    const before = termInput(state, existing)
    if (before.term === next.term && sameList(before.aliases, next.aliases) && before.meaning === next.meaning && before.project === next.project) return []
  }
  return [{ type: 'term.upsert', id: existing?.id ?? newId(), ...next }]
}

export const removeTermOps = (t: Term): unknown[] => [{ type: 'term.remove', id: t.id }]

/** Adds a removed term back exactly: same id, every field. */
export const restoreTermOps = (state: WorkspaceState, t: Term): unknown[] => [termInput(state, t)]

/** Terms in alphabetical order, matching `filter` in the term, its aliases or its meaning. */
export function glossary(state: WorkspaceState, filter = ''): Term[] {
  const q = filter.trim().toLowerCase()
  return [...state.glossary.terms]
    .filter(t => !q || [t.term, ...t.aliases, t.meaning].some(s => s.toLowerCase().includes(q)))
    .sort((a, b) => a.term.localeCompare(b.term))
}

