import type { WorkspaceState } from '@hecate/core'
import { Banner, Button, ConfirmDialog, Dialog, RadioGroupField, SelectField, TextAreaField, TextField } from '@hecate/ui'
import { useRef, useState, type FormEvent } from 'react'
import { URGENCY_OPTIONS } from '../format.ts'
import { FormProblems } from '../FormProblems.tsx'
import { personOptions } from '../people/people.ts'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { emptyForm, formFromTask, opsFor, validate, type TaskForm } from './editor.ts'

export interface TaskEditorProps {
  state: WorkspaceState
  /** The task to edit, or null for a new one. */
  taskKey: string | null
  /** For a new task: the column it was started from. */
  newStatus?: string | undefined
  /** For a new task: the project it was started from. */
  newProject?: string | undefined
  onClose: () => void
  save: (ops: unknown[], label: string) => LocalResult
}

/**
 * A task's every field in one dialog (M-app-03): labels above, checks on
 * blur, a summary on submit, one primary action. Delete is confirmed and never
 * the primary action (R-24). design/components/task-editor.md
 */
export function TaskEditor({ state, taskKey, newStatus, newProject, onClose, save }: TaskEditorProps) {
  const task = taskKey ? (state.tasks.tasks.find(t => t.key === taskKey) ?? null) : null
  const [form, setForm] = useState<TaskForm>(() => (task ? formFromTask(state, task) : emptyForm(state, newStatus, newProject)))
  const [touched, setTouched] = useState<ReadonlySet<keyof TaskForm>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const summary = useRef<HTMLDivElement>(null)

  if (taskKey && !task) {
    return (
      <Dialog open onOpenChange={open => !open && onClose()} title={`No task ${taskKey}`}>
        <p className="text-body-md text-text-secondary">There is no {taskKey} on this board. It may have been deleted, or archived when a sprint closed.</p>
        <Button className="self-end" onClick={onClose}>
          Close
        </Button>
      </Dialog>
    )
  }

  const errors = validate(state, form, task?.key ?? null)
  const errorFor = (field: keyof TaskForm): string | undefined => (submitted || touched.has(field) ? errors[field] : undefined)
  const set = <K extends keyof TaskForm>(field: K, value: TaskForm[K]): void => setForm(f => ({ ...f, [field]: value }))
  const blur = (field: keyof TaskForm) => () => setTouched(t => new Set(t).add(field))
  const problems = Object.values(errors)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (problems.length > 0) {
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const ops = opsFor(state, form, task)
    if (ops.length === 0) return onClose()
    const label = task ? `Save ${task.key}` : 'Add a task'
    const result = save(ops, label)
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    const key = task?.key ?? result.keyMap.$1 ?? ''
    pushToast({ tone: 'success', title: task ? `Saved ${key}` : `Added ${key}`, description: form.title.trim() })
    onClose()
  }

  const remove = (): void => {
    if (!task) return
    const result = save([{ type: 'task.delete', task: task.key }], `Delete ${task.key}`)
    if (!result.ok) {
      setSaveError(`${result.message}. ${task.key} was not deleted.`)
      return
    }
    pushToast({ tone: 'success', title: `Deleted ${task.key}`, description: `${task.title}. Its key is not used again.` })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()} title={task ? `Edit ${task.key}` : 'New task'}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-md">
        {submitted && problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}

        <TextField label="Title" required value={form.title} error={errorFor('title')} onChange={e => set('title', e.target.value)} onBlur={blur('title')} />

        {!task ? (
          <RadioGroupField
            legend="Kind"
            name="kind"
            value={form.kind}
            options={[{ value: 'action', label: 'My action (A)' }, { value: 'waiting', label: 'Waiting on someone (B)' }]}
            onChange={v => set('kind', v as TaskForm['kind'])}
          />
        ) : null}
        {form.kind === 'waiting' ? (
          <div className="grid gap-stack-md md:grid-cols-2 md:gap-inline-lg">
            <SelectField label="Person" value={form.waitingPerson} options={personOptions(state)} onChange={e => set('waitingPerson', e.target.value)} />
            <TextField
              label="Waiting on"
              hint={form.waitingPerson ? 'Optional: a note beside the person' : 'A team or a role, or choose a person'}
              value={form.waitingOn}
              onChange={e => set('waitingOn', e.target.value)}
            />
          </div>
        ) : null}

        <div className="grid gap-stack-md md:grid-cols-2 md:gap-inline-lg">
          <SelectField label="Status" value={form.status} options={state.workspace.statuses.map(s => ({ value: s.id, label: s.name }))} onChange={e => set('status', e.target.value)} />
          <TextField label="Due date" type="date" value={form.due} error={errorFor('due')} onChange={e => set('due', e.target.value)} onBlur={blur('due')} />
          <SelectField
            label="Project"
            value={form.project}
            options={[{ value: '', label: 'None' }, ...Object.values(state.projects).map(p => ({ value: p.slug, label: p.name }))]}
            onChange={e => set('project', e.target.value)}
          />
          <TextField label="Depends on" hint="Task keys, such as A12, B3" value={form.dependsOn} error={errorFor('dependsOn')} onChange={e => set('dependsOn', e.target.value)} onBlur={blur('dependsOn')} />
        </div>

        <RadioGroupField legend="Urgency" name="urgency" value={form.urgency} options={URGENCY_OPTIONS} onChange={v => set('urgency', v as TaskForm['urgency'])} />
        <TextField label="Tags" hint="Separated by commas" value={form.tags} onChange={e => set('tags', e.target.value)} />
        <TextAreaField label="Note" hint="Markdown" value={form.note} onChange={e => set('note', e.target.value)} />

        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:items-center md:justify-between">
          {task ? (
            <Button tone="danger" onClick={() => setConfirming(true)}>
              Delete task
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:gap-inline-sm">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">
              {task ? 'Save' : 'Add task'}
            </Button>
          </div>
        </div>
      </form>
      {task ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete ${task.key}?`}
          description={`“${task.title}” is removed for good, and ${task.key} is never used again. To keep a record instead, move it to a closed status.`}
          confirmLabel={`Delete ${task.key}`}
          onConfirm={remove}
        />
      ) : null}
    </Dialog>
  )
}
