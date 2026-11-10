/**
 * A project's forms, and the ops they save as. Pure, so the rules are tested
 * without a browser; the components only render them.
 *
 * project.update replaces a list whole (next actions, deadlines, cutoffs,
 * open questions), so every change sends the full list with each item's id,
 * and each question's number, so "OQ-02" stays OQ-02. Overview fields are
 * patched: only what changed is sent.
 */
import { slugify, type ProjectView, type WorkspaceState } from '@hecate/core'
import { checkKeys, checkLine, keysIn, nullable, sameList } from '../forms.ts'
import { canMoveIn, moved, without } from '../lists.ts'

export type Project = ProjectView['project']
export type Status = Project['status']

export const STATUS_OPTIONS: readonly { value: Status; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'paused', label: 'Paused' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
]
export const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label])) as Record<Status, string>

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** "OQ-03": how a question is named, by its number. */
export const questionLabel = (n: number): string => `OQ-${String(n).padStart(2, '0')}`

// ─── The overview ───────────────────────────────────────────────────────────

export interface ProjectForm {
  name: string
  /** New projects only: the slug is permanent once created. */
  slug: string
  status: Status
  subtitle: string
  phase: string
  owner: string
  summary: string
  currentFocus: string
}

export type ProjectErrors = Partial<Record<keyof ProjectForm, string>>

export const emptyProjectForm = (): ProjectForm => ({ name: '', slug: '', status: 'active', subtitle: '', phase: '', owner: '', summary: '', currentFocus: '' })

export const projectForm = (p: Project): ProjectForm => ({
  name: p.name, slug: p.slug, status: p.status, subtitle: p.subtitle ?? '', phase: p.phase ?? '', owner: p.owner ?? '', summary: p.summary ?? '', currentFocus: p.currentFocus ?? '',
})

/** The slug a name suggests, until the person edits it. */
export const slugFor = (name: string): string => slugify(name)

export function validateProject(state: WorkspaceState, form: ProjectForm, existing: Project | null): ProjectErrors {
  const errors: ProjectErrors = {}
  const name = checkLine(form.name, { name: 'the name', missing: 'Name the project.', oneLine: 'Keep the name on one line; put the rest in the summary.' })
  if (name) errors.name = name
  if (!existing) {
    const slug = form.slug.trim()
    if (!slug) errors.slug = 'Give the project a short name for its address, such as team-offsite.'
    else if (!SLUG.test(slug)) errors.slug = 'Use lower-case letters, numbers and single hyphens, such as team-offsite.'
    else if (state.projects[slug]) errors.slug = `There is already a project “${slug}”. Choose another.`
  }
  for (const [field, label] of [['subtitle', 'subtitle'], ['phase', 'phase'], ['owner', 'owner']] as const) {
    const problem = checkLine(form[field], { name: `the ${label}`, oneLine: `Keep the ${label} on one line.` })
    if (problem) errors[field] = problem
  }
  if (!STATUS_OPTIONS.some(o => o.value === form.status)) errors.status = 'Choose a status.'
  return errors
}

/** One project.create, or a project.update of what changed (nothing when nothing did). */
export function projectOps(form: ProjectForm, existing: Project | null): unknown[] {
  const fields = {
    name: form.name.trim(),
    status: form.status,
    subtitle: nullable(form.subtitle),
    phase: nullable(form.phase),
    owner: nullable(form.owner),
    summary: nullable(form.summary),
    currentFocus: nullable(form.currentFocus),
  }
  if (!existing) return [{ type: 'project.create', slug: form.slug.trim(), ...fields }]
  const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => existing[k as keyof typeof fields] !== v))
  return Object.keys(patch).length > 0 ? [{ type: 'project.update', slug: existing.slug, patch }] : []
}

// ─── Next actions, deadlines, cutoffs and open questions ────────────────────

export type ItemKind = 'action' | 'deadline' | 'cutoff' | 'question'

const LIST = { action: 'nextActions', deadline: 'deadlines', cutoff: 'cutoffs', question: 'openQuestions' } as const

/** One form for every kind; each kind uses the fields it has. */
export interface ItemForm {
  /** Next action: the action. Deadline: its title. Question: the question. */
  text: string
  date: string
  hard: boolean
  note: string
  /** Cutoff: the person it names (an id), or none. */
  person: string
  who: string
  what: string
  keys: string
  blocker: boolean
  status: 'open' | 'resolved' | 'deferred'
  resolution: string
}

export type ItemErrors = Partial<Record<keyof ItemForm, string>>

export const emptyItemForm = (): ItemForm => ({ text: '', date: '', hard: false, note: '', person: '', who: '', what: '', keys: '', blocker: false, status: 'open', resolution: '' })

/** Each stored item as the op takes it back: every field, its id, and a question's number. */
function inputs(project: Project, kind: ItemKind): Record<string, unknown>[] {
  if (kind === 'action') return project.nextActions.map(a => ({ id: a.id, text: a.text, keys: a.keys }))
  if (kind === 'deadline') return project.deadlines.map(d => ({ id: d.id, date: d.date, title: d.title, hard: d.hard, note: d.note, keys: d.keys }))
  if (kind === 'cutoff') return project.cutoffs.map(c => ({ id: c.id, date: c.date, personId: c.personId, who: c.who, what: c.what, keys: c.keys }))
  return project.openQuestions.map(q => ({ id: q.id, n: q.n, question: q.question, blocker: q.blocker, status: q.status, resolution: q.resolution, keys: q.keys }))
}

const listOp = (project: Project, kind: ItemKind, items: readonly Record<string, unknown>[]) =>
  ({ type: 'project.update', slug: project.slug, patch: { [LIST[kind]]: items } })

/** The form for an existing item, or null if it is no longer there. */
export function itemFormFor(project: Project, kind: ItemKind, id: string): ItemForm | null {
  const base = emptyItemForm()
  if (kind === 'action') {
    const a = project.nextActions.find(x => x.id === id)
    return a ? { ...base, text: a.text, keys: a.keys.join(', ') } : null
  }
  if (kind === 'deadline') {
    const d = project.deadlines.find(x => x.id === id)
    return d ? { ...base, text: d.title, date: d.date, hard: d.hard, note: d.note ?? '', keys: d.keys.join(', ') } : null
  }
  if (kind === 'cutoff') {
    const c = project.cutoffs.find(x => x.id === id)
    return c ? { ...base, date: c.date, person: c.personId ?? '', who: c.who, what: c.what, keys: c.keys.join(', ') } : null
  }
  const q = project.openQuestions.find(x => x.id === id)
  return q ? { ...base, text: q.question, blocker: q.blocker, status: q.status, resolution: q.resolution ?? '', keys: q.keys.join(', ') } : null
}

export function validateItem(state: WorkspaceState, kind: ItemKind, form: ItemForm): ItemErrors {
  const errors: ItemErrors = {}
  const line = (field: 'text' | 'note' | 'who' | 'what', name: string, missing?: string): void => {
    const problem = checkLine(form[field], { name, ...(missing ? { missing } : {}), oneLine: `Keep ${name} on one line.` })
    if (problem) errors[field] = problem
  }
  if (kind === 'deadline' || kind === 'cutoff') {
    if (!form.date) errors.date = 'Choose a date.'
    else if (!DATE.test(form.date)) errors.date = 'Use a date such as 2026-11-30.'
  }
  if (kind === 'action') line('text', 'the action', 'Say what to do next.')
  if (kind === 'deadline') {
    line('text', 'the title', 'Name the deadline.')
    line('note', 'the note')
  }
  if (kind === 'cutoff') {
    line('who', 'who', 'Say whose cutoff it is: a person, role or team.')
    line('what', 'what closes', 'Say what closes.')
    if (form.person && !state.people.people.some(p => p.id === form.person)) errors.person = 'Choose a person from the list.'
  }
  if (kind === 'question') {
    if (!form.text.trim()) errors.text = 'Write the question.'
    if (form.status === 'resolved' && !form.resolution.trim()) errors.resolution = 'Say how it was resolved.'
  }
  const keys = checkKeys(state, form.keys)
  if (keys) errors.keys = keys
  return errors
}

/** The item a valid form describes, as the op takes it (no id or number for a new one: the engine assigns them). */
function inputFrom(kind: ItemKind, form: ItemForm, before: Record<string, unknown> | undefined): Record<string, unknown> {
  const keys = keysIn(form.keys)
  const kept = before ? { id: before.id } : {}
  if (kind === 'action') return { ...kept, text: form.text.trim(), keys }
  if (kind === 'deadline') return { ...kept, date: form.date, title: form.text.trim(), hard: form.hard, note: nullable(form.note), keys }
  if (kind === 'cutoff') return { ...kept, date: form.date, personId: form.person || null, who: form.who.trim(), what: form.what.trim(), keys }
  const resolution = form.status === 'open' ? null : nullable(form.resolution)
  return { ...kept, ...(before ? { n: before.n } : {}), question: form.text.trim(), blocker: form.blocker, status: form.status, resolution, keys }
}

const same = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  Object.keys(a).every(k => (Array.isArray(a[k]) ? sameList(a[k] as string[], b[k] as string[]) : a[k] === b[k]))

/** The whole list with the item saved in its place (or added at the end); nothing when nothing changed. */
export function saveItemOps(project: Project, kind: ItemKind, form: ItemForm, id: string | null): unknown[] {
  const list = inputs(project, kind)
  const index = id === null ? -1 : list.findIndex(x => x.id === id)
  const before = index >= 0 ? list[index] : undefined
  const item = inputFrom(kind, form, before)
  if (before && same(item, before)) return []
  return [listOp(project, kind, before ? list.map((x, i) => (i === index ? item : x)) : [...list, item])]
}

/** Puts a list back as it is now: the exact undo of any change to it. */
export const restoreItemOps = (project: Project, kind: ItemKind): unknown[] => [listOp(project, kind, inputs(project, kind))]

export const removeItemOps = (project: Project, kind: ItemKind, id: string): unknown[] =>
  [listOp(project, kind, without(inputs(project, kind) as { id: string }[], id))]

/** Only next actions have an order of their own; deadlines and cutoffs read by date, questions by number. */
export const canMoveAction = (project: Project, id: string, delta: -1 | 1): boolean => canMoveIn(project.nextActions, id, delta)

export function moveActionOps(project: Project, id: string, delta: -1 | 1): unknown[] {
  if (!canMoveAction(project, id, delta)) return []
  return [listOp(project, 'action', moved(inputs(project, 'action') as { id: string }[], id, delta))]
}

/** A short name for an item, for its controls and messages. */
export function itemName(project: Project, kind: ItemKind, id: string): string {
  if (kind === 'action') return project.nextActions.find(x => x.id === id)?.text ?? ''
  if (kind === 'deadline') return project.deadlines.find(x => x.id === id)?.title ?? ''
  if (kind === 'cutoff') {
    const c = project.cutoffs.find(x => x.id === id)
    return c ? `${c.who}: ${c.what}` : ''
  }
  const q = project.openQuestions.find(x => x.id === id)
  return q ? questionLabel(q.n) : ''
}
