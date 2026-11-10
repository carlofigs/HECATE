import type { WorkspaceState } from '@hecate/core'
import { Banner, Button, Dialog, SelectField, TextAreaField, TextField } from '@hecate/ui'
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { FormProblems } from '../FormProblems.tsx'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import {
  emptyLeaveForm, emptyPersonForm, emptyTermForm, isSanitised, leaveForm, personForm, personOps, saveLeaveOps, termForm, termOps, validateLeave,
  validatePerson, validateTerm, type LeaveForm, type Person, type PersonForm, type Term, type TermForm,
} from './people.ts'

type Save = (ops: unknown[], label: string) => LocalResult

/**
 * The shared form behaviour of the three editors: errors on blur and on
 * submit, a focused summary, a "Not saved" banner on refusal, and nothing
 * saved when nothing changed. design/components/person-editor.md
 */
function useForm<F extends object>(initial: F, validate: (form: F) => Partial<Record<keyof F, string>>) {
  const [form, setForm] = useState<F>(initial)
  const [touched, setTouched] = useState<ReadonlySet<keyof F>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const errors = validate(form)
  const problems = Object.values(errors).filter((p): p is string => typeof p === 'string')
  return {
    form, setForm, summary, saveError,
    /** Shown once the form has been submitted. */
    problems: submitted ? problems : [],
    set: <K extends keyof F>(field: K, value: F[K]) => setForm(f => ({ ...f, [field]: value })),
    errorFor: (field: keyof F): string | undefined => (submitted || touched.has(field) ? errors[field] : undefined),
    blur: (field: keyof F) => () => setTouched(t => new Set(t).add(field)),
    /** Runs `save` when the form is valid; returns whether the dialog should close. */
    submit: (event: FormEvent, save: () => LocalResult | null): boolean => {
      event.preventDefault()
      setSubmitted(true)
      setSaveError(null)
      if (problems.length > 0) {
        requestAnimationFrame(() => summary.current?.focus())
        return false
      }
      const result = save()
      if (result && !result.ok) {
        setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
        return false
      }
      return true
    },
  }
}

function Frame({ title, onClose, onSubmit, submit, problems, summary, saveError, children }: {
  title: string
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  submit: string
  problems: string[]
  summary: RefObject<HTMLDivElement | null>
  saveError: string | null
  children: ReactNode
}) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()} title={title}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack-md">
        {problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}
        {children}
        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {submit}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** A person, new or existing. No name or aliases in a sanitised workspace (ADR 0005). */
export function PersonEditor({ state, person, onClose, onCreated, save }: { state: WorkspaceState; person: Person | null; onClose: () => void; onCreated?: (id: string) => void; save: Save }) {
  const sanitised = isSanitised(state)
  const f = useForm<PersonForm>(person ? personForm(person) : emptyPersonForm(), form => validatePerson(state, form))
  const submit = (event: FormEvent): void => {
    let created: string | null = null
    const ok = f.submit(event, () => {
      const ops = personOps(state, f.form, person)
      if (ops.length === 0) return null
      created = person ? null : (ops[0] as { id: string }).id
      return save(ops, person ? `Update ${person.name ?? person.role}` : 'Add a person')
    })
    if (!ok) return
    const label = (sanitised ? '' : f.form.name.trim()) || f.form.role.trim()
    pushToast({ tone: 'success', title: person ? `Updated ${label}` : `Added ${label}` })
    onClose()
    if (created) onCreated?.(created)
  }
  return (
    <Frame
      title={person ? `Edit ${person.name ?? person.role}` : 'Add a person'}
      onClose={onClose}
      onSubmit={submit}
      submit={person ? 'Save' : 'Add person'}
      problems={f.problems}
      summary={f.summary}
      saveError={f.saveError}
    >
      {sanitised ? <Banner tone="info" title="Roles only">This workspace is sanitised: people are recorded by role, never by name.</Banner> : null}
      <TextField label="Role" required hint="Such as Data engineer, or Finance team" value={f.form.role} error={f.errorFor('role')} onChange={e => f.set('role', e.target.value)} onBlur={f.blur('role')} />
      {sanitised ? null : (
        <>
          <TextField label="Name" hint="Optional" value={f.form.name} error={f.errorFor('name')} onChange={e => f.set('name', e.target.value)} onBlur={f.blur('name')} />
          <TextField label="Aliases" hint="Optional: other names they go by, separated by commas" value={f.form.aliases} error={f.errorFor('aliases')} onChange={e => f.set('aliases', e.target.value)} onBlur={f.blur('aliases')} />
        </>
      )}
      <TextAreaField label="Notes" hint="Optional: what they own, how to work with them. Markdown" rows={4} value={f.form.notes} onChange={e => f.set('notes', e.target.value)} />
    </Frame>
  )
}

/** One leave range, saved as the person's whole list. */
export function LeaveEditor({ person, index, onClose, save }: { person: Person; index: number | null; onClose: () => void; save: Save }) {
  const range = index === null ? undefined : person.ooo[index]
  const f = useForm<LeaveForm>(range ? leaveForm(range) : emptyLeaveForm(), validateLeave)
  const who = person.name ?? person.role
  const submit = (event: FormEvent): void => {
    const ok = f.submit(event, () => {
      const ops = saveLeaveOps(person, f.form, range ? index : null)
      return ops.length === 0 ? null : save(ops, `Update ${who}'s leave`)
    })
    if (!ok) return
    pushToast({ tone: 'success', title: range ? 'Updated leave' : 'Added leave', description: who })
    onClose()
  }
  return (
    <Frame
      title={range ? 'Edit leave' : `Add leave for ${who}`}
      onClose={onClose}
      onSubmit={submit}
      submit={range ? 'Save' : 'Add leave'}
      problems={f.problems}
      summary={f.summary}
      saveError={f.saveError}
    >
      <div className="grid gap-stack-md md:grid-cols-2 md:gap-inline-lg">
        <TextField label="First day" required type="date" value={f.form.start} error={f.errorFor('start')} onChange={e => f.set('start', e.target.value)} onBlur={f.blur('start')} />
        <TextField label="Last day" required type="date" value={f.form.end} error={f.errorFor('end')} onChange={e => f.set('end', e.target.value)} onBlur={f.blur('end')} />
      </div>
      <TextField label="Note" hint="Optional, such as Conference" value={f.form.note} error={f.errorFor('note')} onChange={e => f.set('note', e.target.value)} onBlur={f.blur('note')} />
    </Frame>
  )
}

/** A glossary term, new or existing. */
export function TermEditor({ state, term, onClose, save }: { state: WorkspaceState; term: Term | null; onClose: () => void; save: Save }) {
  const f = useForm<TermForm>(term ? termForm(state, term) : emptyTermForm(), form => validateTerm(state, form, term))
  const submit = (event: FormEvent): void => {
    const ok = f.submit(event, () => {
      const ops = termOps(state, f.form, term)
      return ops.length === 0 ? null : save(ops, term ? `Update the term ${term.term}` : 'Add a term')
    })
    if (!ok) return
    pushToast({ tone: 'success', title: term ? 'Updated a term' : 'Added a term', description: f.form.term.trim() })
    onClose()
  }
  return (
    <Frame
      title={term ? `Edit ${term.term}` : 'Add a term'}
      onClose={onClose}
      onSubmit={submit}
      submit={term ? 'Save' : 'Add term'}
      problems={f.problems}
      summary={f.summary}
      saveError={f.saveError}
    >
      <TextField label="Term" required value={f.form.term} error={f.errorFor('term')} onChange={e => f.set('term', e.target.value)} onBlur={f.blur('term')} />
      <TextField label="Aliases" hint="Optional: other ways it is written, separated by commas" value={f.form.aliases} onChange={e => f.set('aliases', e.target.value)} />
      <TextAreaField label="Meaning" required hint="Markdown" rows={3} value={f.form.meaning} error={f.errorFor('meaning')} onChange={e => f.set('meaning', e.target.value)} onBlur={f.blur('meaning')} />
      <SelectField
        label="Project"
        value={f.form.project}
        options={[{ value: '', label: 'None' }, ...Object.values(state.projects).map(p => ({ value: p.slug, label: p.name }))]}
        onChange={e => f.set('project', e.target.value)}
      />
    </Frame>
  )
}
