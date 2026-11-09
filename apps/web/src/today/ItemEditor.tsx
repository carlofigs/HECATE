import type { WorkspaceState } from '@hecate/core'
import { Banner, Button, Dialog, RadioGroupField, SelectField, TextAreaField, TextField } from '@hecate/ui'
import { useRef, useState, type FormEvent } from 'react'
import { URGENCY_OPTIONS } from '../format.ts'
import { FormProblems } from '../FormProblems.tsx'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { emptyItemForm, itemFormFor, itemName, saveItemOps, validateItem, type ItemForm, type ItemKind, type Lists } from './focus.ts'

export interface ItemEditorProps {
  kind: ItemKind
  state: WorkspaceState
  lists: Lists
  /** The item to edit, or null for a new one. */
  id: string | null
  onClose: () => void
  save: (ops: unknown[], label: string) => LocalResult
}

/** Words for each kind: dialog titles, the change's label (imperative, for "Couldn't …"), and the toast. */
const COPY: Record<ItemKind, { add: string; edit: string; saveLabel: string; added: string; saved: string; submit: string }> = {
  plan: { add: "Add to today's plan", edit: 'Edit plan item', saveLabel: "Update today's plan", added: "Added to today's plan", saved: "Updated today's plan", submit: 'Add to plan' },
  priority: { add: 'Add a priority', edit: 'Edit priority', saveLabel: "Update this week's priorities", added: 'Added a priority', saved: 'Updated a priority', submit: 'Add priority' },
  callout: { add: 'Add a callout', edit: 'Edit callout', saveLabel: "Update this week's callouts", added: 'Added a callout', saved: 'Updated a callout', submit: 'Add callout' },
  keep: { add: 'Add to keep in mind', edit: 'Edit keep-in-mind note', saveLabel: 'Update a keep-in-mind note', added: 'Added to keep in mind', saved: 'Updated keep in mind', submit: 'Add note' },
}

const TIER_OPTIONS = [{ value: 'focus', label: 'Focus' }, { value: 'next', label: 'Next' }, { value: 'ongoing', label: 'Ongoing' }] as const
const KEYS_HINT = 'Task keys, such as A12, B3'

/**
 * One editor for the plan, priorities, callouts and keep-in-mind: the
 * fields each kind has, checks on blur, a summary on submit, one primary
 * action (M-app-03). design/components/focus-item-editor.md
 */
export function ItemEditor({ kind, state, lists, id, onClose, save }: ItemEditorProps) {
  const existing = id ? itemFormFor(state, lists, kind, id) : null
  const [form, setForm] = useState<ItemForm>(() => existing ?? emptyItemForm())
  const [touched, setTouched] = useState<ReadonlySet<keyof ItemForm>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const copy = COPY[kind]

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

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (problems.length > 0) {
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const ops = saveItemOps(state, lists, kind, form, id)
    if (ops.length === 0) return onClose()
    const result = save(ops, id ? copy.saveLabel : copy.add)
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    pushToast({ tone: 'success', title: id ? copy.saved : copy.added, description: itemName({ lead: form.lead.trim() || null, text: form.text }) })
    onClose()
  }

  const leadField = (label: string, required: boolean, hint?: string) => (
    <TextField
      label={label}
      required={required}
      {...(hint ? { hint } : {})}
      value={form.lead}
      error={errorFor('lead')}
      onChange={e => set('lead', e.target.value)}
      onBlur={blur('lead')}
    />
  )
  const textField = (label: string, required: boolean, hint: string) => (
    <TextAreaField label={label} required={required} hint={hint} rows={3} value={form.text} error={errorFor('text')} onChange={e => set('text', e.target.value)} onBlur={blur('text')} />
  )
  const keysField = <TextField label="Tasks" hint={KEYS_HINT} value={form.keys} error={errorFor('keys')} onChange={e => set('keys', e.target.value)} onBlur={blur('keys')} />

  return (
    <Dialog open onOpenChange={open => !open && onClose()} title={id ? copy.edit : copy.add}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-md">
        {submitted && problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}

        {kind === 'priority' ? (
          <RadioGroupField legend="Tier" name="tier" value={form.tier} options={TIER_OPTIONS} onChange={v => set('tier', v as ItemForm['tier'])} />
        ) : null}
        {kind === 'plan' ? leadField('What to do', true) : null}
        {kind === 'priority' ? leadField('Priority', true) : null}
        {kind === 'callout' ? leadField('Lead', false, 'Optional: a short opening, shown in bold') : null}
        {kind === 'keep' ? leadField('Heading', false, 'Optional') : null}

        {kind === 'plan' || kind === 'priority' ? textField('Detail', false, 'Optional. Markdown') : null}
        {kind === 'callout' ? textField('Callout', true, 'Markdown') : null}
        {kind === 'keep' ? textField('Note', true, 'Markdown') : null}

        {keysField}
        {kind === 'plan' ? (
          <RadioGroupField legend="Urgency" name="urgency" value={form.urgency} options={URGENCY_OPTIONS} onChange={v => set('urgency', v as ItemForm['urgency'])} />
        ) : null}
        {kind === 'keep' ? (
          <SelectField
            label="Project"
            value={form.project}
            options={[{ value: '', label: 'None' }, ...Object.values(state.projects).map(p => ({ value: p.slug, label: p.name }))]}
            onChange={e => set('project', e.target.value)}
          />
        ) : null}

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
