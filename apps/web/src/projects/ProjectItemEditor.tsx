import type { WorkspaceState } from '@hecate/core'
import { Banner, Button, CheckboxField, Dialog, RadioGroupField, TextAreaField, TextField } from '@hecate/ui'
import { useRef, useState, type FormEvent } from 'react'
import { FormProblems } from '../FormProblems.tsx'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { emptyItemForm, itemFormFor, itemName, saveItemOps, validateItem, type ItemForm, type ItemKind, type Project } from './project.ts'

export interface ProjectItemEditorProps {
  kind: ItemKind
  state: WorkspaceState
  project: Project
  /** The item to edit, or null for a new one. */
  id: string | null
  onClose: () => void
  save: (ops: unknown[], label: string) => LocalResult
}

/** Words for each kind: the dialog's title, the change's label (imperative, for "Couldn't …"), and the toast. */
export const ITEM_COPY: Record<ItemKind, { add: string; edit: string; list: string; added: string; saved: string; submit: string }> = {
  action: { add: 'Add a next action', edit: 'Edit next action', list: 'the next actions', added: 'Added a next action', saved: 'Updated a next action', submit: 'Add action' },
  deadline: { add: 'Add a deadline', edit: 'Edit deadline', list: 'the deadlines', added: 'Added a deadline', saved: 'Updated a deadline', submit: 'Add deadline' },
  cutoff: { add: 'Add a cutoff', edit: 'Edit cutoff', list: 'the cutoffs', added: 'Added a cutoff', saved: 'Updated a cutoff', submit: 'Add cutoff' },
  question: { add: 'Add an open question', edit: 'Edit question', list: 'the open questions', added: 'Added an open question', saved: 'Updated a question', submit: 'Add question' },
}

const QUESTION_STATUS = [{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'deferred', label: 'Deferred' }] as const
const KEYS_HINT = 'Task keys, such as A12, B3'

/**
 * One editor for a project's lists: next actions, deadlines, cutoffs and
 * open questions, each showing only its own fields. Saved as the whole list
 * (project.update), every other item kept with its id.
 * design/components/project-editor.md
 */
export function ProjectItemEditor({ kind, state, project, id, onClose, save }: ProjectItemEditorProps) {
  const existing = id ? itemFormFor(project, kind, id) : null
  const [form, setForm] = useState<ItemForm>(() => existing ?? emptyItemForm())
  const [touched, setTouched] = useState<ReadonlySet<keyof ItemForm>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const copy = ITEM_COPY[kind]

  if (id && !existing) {
    return (
      <Dialog open onOpenChange={open => !open && onClose()} title="This item is gone">
        <p className="text-body-md text-text-secondary">It was removed or changed since this page loaded, perhaps by Claude. Close this and try again.</p>
        <Button className="self-end" onClick={onClose}>
          Close
        </Button>
      </Dialog>
    )
  }

  const errors = validateItem(state, kind, form)
  const errorFor = (field: keyof ItemForm): string | undefined => (submitted || touched.has(field) ? errors[field] : undefined)
  const set = <K extends keyof ItemForm>(field: K, value: ItemForm[K]): void => setForm(f => ({ ...f, [field]: value }))
  const blur = (field: keyof ItemForm) => () => setTouched(t => new Set(t).add(field))
  const problems = Object.values(errors)
  const title = id === null ? copy.add : kind === 'question' ? `Edit ${itemName(project, kind, id)}` : copy.edit

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (problems.length > 0) {
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const ops = saveItemOps(project, kind, form, id)
    if (ops.length === 0) return onClose()
    const result = save(ops, id ? `Update ${copy.list} of ${project.name}` : `${copy.add} to ${project.name}`)
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    const name = kind === 'cutoff' ? `${form.who.trim()}: ${form.what.trim()}` : kind === 'question' && id ? itemName(project, kind, id) : form.text.trim().split('\n')[0]
    pushToast({ tone: 'success', title: id ? copy.saved : copy.added, ...(name ? { description: name } : {}) })
    onClose()
  }

  const text = (field: 'text' | 'note' | 'who' | 'what', label: string, required: boolean, hint?: string) => (
    <TextField
      label={label}
      required={required}
      {...(hint ? { hint } : {})}
      value={form[field]}
      error={errorFor(field)}
      onChange={e => set(field, e.target.value)}
      onBlur={blur(field)}
    />
  )
  const date = <TextField label="Date" required type="date" value={form.date} error={errorFor('date')} onChange={e => set('date', e.target.value)} onBlur={blur('date')} />
  const keys = <TextField label="Tasks" hint={KEYS_HINT} value={form.keys} error={errorFor('keys')} onChange={e => set('keys', e.target.value)} onBlur={blur('keys')} />

  return (
    <Dialog open onOpenChange={open => !open && onClose()} title={title}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-md">
        {submitted && problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}

        {kind === 'action' ? text('text', 'Action', true) : null}
        {kind === 'deadline' ? (
          <>
            {text('text', 'Title', true)}
            {date}
            <CheckboxField label="Hard deadline" hint="It cannot move." checked={form.hard} onChange={e => set('hard', e.target.checked)} />
            {text('note', 'Note', false, 'Optional')}
          </>
        ) : null}
        {kind === 'cutoff' ? (
          <>
            {date}
            {text('who', 'Who', true, 'A person, role or team')}
            {text('what', 'What closes', true)}
          </>
        ) : null}
        {kind === 'question' ? (
          <>
            <TextAreaField label="Question" required hint="Markdown" rows={3} value={form.text} error={errorFor('text')} onChange={e => set('text', e.target.value)} onBlur={blur('text')} />
            <CheckboxField label="Blocks the project" checked={form.blocker} onChange={e => set('blocker', e.target.checked)} />
            {id ? <RadioGroupField legend="Status" name="question-status" value={form.status} options={QUESTION_STATUS} onChange={v => set('status', v as ItemForm['status'])} /> : null}
            {id && form.status !== 'open' ? (
              <TextAreaField
                label="Resolution"
                required={form.status === 'resolved'}
                hint={form.status === 'resolved' ? 'How it was answered. Markdown' : 'Optional: why it waits. Markdown'}
                rows={3}
                value={form.resolution}
                error={errorFor('resolution')}
                onChange={e => set('resolution', e.target.value)}
                onBlur={blur('resolution')}
              />
            ) : null}
          </>
        ) : null}
        {keys}

        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {id ? 'Save' : copy.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

