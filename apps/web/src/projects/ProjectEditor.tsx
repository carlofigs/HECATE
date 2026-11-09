import type { WorkspaceState } from '@hecate/core'
import { Banner, Button, Dialog, SelectField, TextAreaField, TextField } from '@hecate/ui'
import { useRef, useState, type FormEvent } from 'react'
import { FormProblems } from '../FormProblems.tsx'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { emptyProjectForm, projectForm, projectOps, slugFor, STATUS_OPTIONS, validateProject, type Project, type ProjectForm } from './project.ts'

export interface ProjectEditorProps {
  state: WorkspaceState
  /** The project to edit, or null for a new one. */
  project: Project | null
  onClose: () => void
  /** After a new project is saved: its slug, to open it. */
  onCreated?: (slug: string) => void
  save: (ops: unknown[], label: string) => LocalResult
}

/**
 * A project's overview, new or existing: name, status and the lines that
 * describe it. The address (slug) is set once, suggested from the name.
 * design/components/project-editor.md
 */
export function ProjectEditor({ state, project, onClose, onCreated, save }: ProjectEditorProps) {
  const [form, setForm] = useState<ProjectForm>(() => (project ? projectForm(project) : emptyProjectForm()))
  /** The slug follows the name until the person edits it. */
  const [slugEdited, setSlugEdited] = useState(false)
  const [touched, setTouched] = useState<ReadonlySet<keyof ProjectForm>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)

  const errors = validateProject(state, form, project)
  const errorFor = (field: keyof ProjectForm): string | undefined => (submitted || touched.has(field) ? errors[field] : undefined)
  const set = <K extends keyof ProjectForm>(field: K, value: ProjectForm[K]): void => setForm(f => ({ ...f, [field]: value }))
  const blur = (field: keyof ProjectForm) => () => setTouched(t => new Set(t).add(field))
  const problems = Object.values(errors)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (problems.length > 0) {
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const ops = projectOps(form, project)
    if (ops.length === 0) return onClose()
    const name = form.name.trim()
    const result = save(ops, project ? `Update ${project.name}` : `Create ${name}`)
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    pushToast({ tone: 'success', title: project ? `Updated ${name}` : `Created ${name}` })
    onClose()
    if (!project) onCreated?.(form.slug.trim())
  }

  const line = (field: 'subtitle' | 'phase' | 'owner', label: string, hint: string) => (
    <TextField label={label} hint={hint} value={form[field]} error={errorFor(field)} onChange={e => set(field, e.target.value)} onBlur={blur(field)} />
  )

  return (
    <Dialog open onOpenChange={open => !open && onClose()} title={project ? `Edit ${project.name}` : 'New project'}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-md">
        {submitted && problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}

        <TextField
          label="Name"
          required
          value={form.name}
          error={errorFor('name')}
          onChange={e => {
            const name = e.target.value
            setForm(f => ({ ...f, name, ...(project || slugEdited ? {} : { slug: slugFor(name) }) }))
          }}
          onBlur={blur('name')}
        />
        {project ? null : (
          <TextField
            label="Address"
            required
            hint="Used in links to the project. It cannot be changed later."
            value={form.slug}
            error={errorFor('slug')}
            onChange={e => {
              setSlugEdited(true)
              set('slug', e.target.value)
            }}
            onBlur={blur('slug')}
          />
        )}
        <div className="grid gap-stack-md md:grid-cols-2 md:gap-inline-lg">
          <SelectField label="Status" value={form.status} options={STATUS_OPTIONS} onChange={e => set('status', e.target.value as ProjectForm['status'])} />
          {line('owner', 'Owner', 'Optional: a role or team')}
          {line('phase', 'Phase', 'Optional, such as Discovery or Build')}
          {line('subtitle', 'Subtitle', 'Optional: one line under the name')}
        </div>
        <TextAreaField label="Summary" hint="Optional. Markdown" rows={3} value={form.summary} onChange={e => set('summary', e.target.value)} />
        <TextAreaField label="Current focus" hint="Optional. Markdown" rows={3} value={form.currentFocus} onChange={e => set('currentFocus', e.target.value)} />

        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {project ? 'Save' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
