/**
 * The task editor's form, its checks, and the ops it saves as. Pure, so the
 * rules are tested without a browser; TaskEditor.tsx only renders them.
 */
import { findTask, slugify, type Task, type WorkspaceState } from '@hecate/core'

export interface TaskForm {
  title: string
  kind: 'action' | 'waiting'
  /** Who a B task waits on, as free text. */
  waitingOn: string
  status: string
  urgency: '' | 'low' | 'med' | 'high'
  due: string
  project: string
  /** Task keys, separated by commas or spaces. */
  dependsOn: string
  /** Tag names, separated by commas. */
  tags: string
  note: string
}

export type FormErrors = Partial<Record<keyof TaskForm, string>>

/** A new task's form: an action in `status` (or the first to-do status). */
export function emptyForm(state: WorkspaceState, status?: string): TaskForm {
  const first = state.workspace.statuses.find(s => s.category === 'todo') ?? state.workspace.statuses[0]
  const valid = status && state.workspace.statuses.some(s => s.id === status) ? status : (first?.id ?? '')
  return { title: '', kind: 'action', waitingOn: '', status: valid, urgency: '', due: '', project: '', dependsOn: '', tags: '', note: '' }
}

const projectSlug = (state: WorkspaceState, id: string | null): string =>
  id === null ? '' : (Object.values(state.projects).find(p => p.id === id)?.slug ?? '')

export function formFromTask(state: WorkspaceState, task: Task): TaskForm {
  return {
    title: task.title,
    kind: task.kind,
    waitingOn: task.waitingOn?.text ?? '',
    status: task.status,
    urgency: task.urgency ?? '',
    due: task.due ?? '',
    project: projectSlug(state, task.projectId),
    dependsOn: task.dependsOn.join(', '),
    tags: task.tags.join(', '),
    note: task.note ?? '',
  }
}

const KEY = /^[AB][1-9]\d*$/
const keysIn = (text: string): string[] => text.split(/[\s,]+/).map(k => k.trim().toUpperCase()).filter(Boolean)
const tagsIn = (text: string): string[] => [...new Set(text.split(',').map(t => slugify(t)).filter(Boolean))]

/** What is wrong with the form, field by field, in words that say how to fix it (R-27). */
export function validate(state: WorkspaceState, form: TaskForm, self: string | null): FormErrors {
  const errors: FormErrors = {}
  const title = form.title.trim()
  if (!title) errors.title = 'Give the task a title.'
  else if (title.length > 500) errors.title = `Shorten the title to 500 characters or fewer (it has ${title.length}).`
  else if (/[\r\n]/.test(form.title)) errors.title = 'Keep the title on one line; put the detail in the note.'
  const keys = keysIn(form.dependsOn)
  const bad = keys.filter(k => !KEY.test(k))
  const missing = keys.filter(k => KEY.test(k) && !findTask(state, k))
  if (bad.length > 0) errors.dependsOn = `${bad.join(', ')} ${bad.length === 1 ? 'is not a task key' : 'are not task keys'}: use keys such as A12 or B3.`
  else if (missing.length > 0) errors.dependsOn = `There is no ${missing.join(' or ')} in this workspace.`
  else if (self && keys.includes(self)) errors.dependsOn = 'A task cannot depend on itself.'
  if (form.due && !/^\d{4}-\d{2}-\d{2}$/.test(form.due)) errors.due = 'Use a date such as 2026-11-30.'
  if (!state.workspace.statuses.some(s => s.id === form.status)) errors.status = 'Choose a status.'
  return errors
}

const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim())
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/** The ops a valid form saves as: one task.add, or a task.update of what changed plus a task.move if the status did. */
export function opsFor(state: WorkspaceState, form: TaskForm, task: Task | null): unknown[] {
  const fields = {
    title: form.title.trim(),
    note: nullable(form.note),
    urgency: form.urgency === '' ? null : form.urgency,
    tags: tagsIn(form.tags),
    project: nullable(form.project),
    dependsOn: keysIn(form.dependsOn),
    due: nullable(form.due),
  }
  if (!task) {
    const waitingOn = form.kind === 'waiting' && nullable(form.waitingOn) ? { text: nullable(form.waitingOn) } : null
    return [{ type: 'task.add', ref: '$1', kind: form.kind, status: form.status, ...fields, waitingOn }]
  }
  const patch: Record<string, unknown> = {}
  if (fields.title !== task.title) patch.title = fields.title
  if (fields.note !== task.note) patch.note = fields.note
  if (fields.urgency !== task.urgency) patch.urgency = fields.urgency
  if (!sameList(fields.tags, task.tags)) patch.tags = fields.tags
  if (fields.project !== (projectSlug(state, task.projectId) || null)) patch.project = fields.project
  if (!sameList(fields.dependsOn, task.dependsOn)) patch.dependsOn = fields.dependsOn
  if (fields.due !== task.due) patch.due = fields.due
  if (task.kind === 'waiting' && nullable(form.waitingOn) !== (task.waitingOn?.text ?? null)) {
    const personId = task.waitingOn?.personId ?? null
    const text = nullable(form.waitingOn)
    patch.waitingOn = personId === null && text === null ? null : { personId, text }
  }
  const ops: unknown[] = []
  if (Object.keys(patch).length > 0) ops.push({ type: 'task.update', task: task.key, patch })
  if (form.status !== task.status) ops.push({ type: 'task.move', task: task.key, status: form.status })
  return ops
}
