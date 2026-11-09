import { formatDay, type TodayView, type WorkspaceState } from '@hecate/core'
import { Banner, Button, CheckboxField, Dialog, KeyChip, RadioGroupField, TextAreaField, TextField } from '@hecate/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { keysIn } from '../forms.ts'
import { FormProblems } from '../FormProblems.tsx'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { closeLabel, closeOps, closeProblems, draftClose, emptyOutcome, openKeys, validateClose, type CloseForm, type OutcomeRow } from './focus.ts'

export interface CloseDayProps {
  state: WorkspaceState
  view: TodayView
  onClose: () => void
  save: (ops: unknown[], label: string) => LocalResult
}

const RESULTS = [{ value: 'done', label: 'Done' }, { value: 'carried', label: 'Carried' }, { value: 'dropped', label: 'Dropped' }] as const
const ICON = 'size-(--size-icon-md)'
const both = (keys: readonly string[]): string => (keys.length < 3 ? keys.join(' and ') : `${keys.slice(0, -1).join(', ')} and ${keys.at(-1) ?? ''}`)

/**
 * End of day (the hecate-focus skill's EOD, in a form): how each plan item
 * went, what else was done, a note on the day. Saved as one focus.closeDay,
 * with any tasks the person chose to complete. Run again to edit a closed day.
 * design/components/close-day.md
 */
export function CloseDay({ state, view, onClose, save }: CloseDayProps) {
  const [form, setForm] = useState<CloseForm>(() => draftClose(state, view))
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const day = formatDay(view.date)

  const errors = validateClose(state, form)
  const problems = closeProblems(errors)
  const errorFor = (i: number, field: 'lead' | 'keys'): string | undefined =>
    submitted || touched.has(`${i}.${field}`) ? errors.unplanned[i]?.[field] : undefined
  const blur = (i: number, field: 'lead' | 'keys') => () => setTouched(t => new Set(t).add(`${i}.${field}`))

  const setRow = (group: 'planned' | 'unplanned', i: number, patch: Partial<OutcomeRow>): void =>
    setForm(f => ({ ...f, [group]: f[group].map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (problems.length > 0) {
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const result = save(closeOps(state, view.date, form), closeLabel(view.date, view.closed))
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    const rows = [...form.planned, ...form.unplanned]
    const n = (r: string) => rows.filter(x => x.result === r).length
    pushToast({ tone: 'success', title: view.closed ? `Updated how ${day} went` : `Closed ${day}`, description: `Done ${n('done')} · Carried ${n('carried')} · Dropped ${n('dropped')}` })
    onClose()
  }

  /** "Also complete A1" when the row is Done and names open tasks; unticked until chosen. */
  const completeBox = (group: 'planned' | 'unplanned', i: number, row: OutcomeRow) => {
    const open = row.result === 'done' ? openKeys(state, keysIn(row.keys)) : []
    return open.length > 0 ? (
      <CheckboxField label={`Also complete ${both(open)}`} checked={row.complete} onChange={e => setRow(group, i, { complete: e.target.checked })} />
    ) : null
  }

  return (
    <Dialog
      open
      onOpenChange={open => !open && onClose()}
      title={view.closed ? `Edit how ${day} went` : `Close ${day}`}
      description="Say how each part of the plan went. Carried means it moves on; nothing is marked done unless you say so."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-lg">
        {submitted && problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}

        <section aria-labelledby="close-plan" className="flex flex-col gap-stack-md">
          <h3 id="close-plan" className="text-heading-4 text-text-primary">The plan</h3>
          {form.planned.length === 0 ? <p className="text-body-sm text-text-muted">Nothing was planned for {day}.</p> : null}
          {form.planned.map((row, i) => (
            <fieldset key={row.planItemId} className="flex flex-col gap-stack-sm rounded-container border border-border-subtle p-inset-md">
              <legend className="px-inline-xs text-label text-text-primary">{row.lead}</legend>
              {row.keys ? (
                <span className="inline-flex flex-wrap gap-inline-xs">
                  {keysIn(row.keys).map(k => <KeyChip key={k} taskKey={k} />)}
                </span>
              ) : null}
              <RadioGroupField legend="How it went" name={`planned-${i}`} value={row.result} options={RESULTS} onChange={v => setRow('planned', i, { result: v as OutcomeRow['result'] })} />
              {completeBox('planned', i, row)}
              <TextField label="Note" hint="Optional" value={row.note} onChange={e => setRow('planned', i, { note: e.target.value })} />
            </fieldset>
          ))}
        </section>

        <section aria-labelledby="close-unplanned" className="flex flex-col gap-stack-md">
          <h3 id="close-unplanned" className="text-heading-4 text-text-primary">Something else you did</h3>
          {form.unplanned.map((row, i) => (
            // Rows have no id until saved: their position is their identity here.
            <fieldset key={i} className="flex flex-col gap-stack-sm rounded-container border border-border-subtle p-inset-md">
              <legend className="px-inline-xs text-label text-text-primary">{row.lead.trim() || `Something else ${i + 1}`}</legend>
              <TextField
                label="What you did"
                required
                value={row.lead}
                error={errorFor(i, 'lead')}
                onChange={e => setRow('unplanned', i, { lead: e.target.value })}
                onBlur={blur(i, 'lead')}
              />
              <RadioGroupField legend="How it went" name={`unplanned-${i}`} value={row.result} options={RESULTS} onChange={v => setRow('unplanned', i, { result: v as OutcomeRow['result'] })} />
              <TextField label="Tasks" hint="Task keys, such as A12, B3" value={row.keys} error={errorFor(i, 'keys')} onChange={e => setRow('unplanned', i, { keys: e.target.value })} onBlur={blur(i, 'keys')} />
              {completeBox('unplanned', i, row)}
              <TextField label="Note" hint="Optional" value={row.note} onChange={e => setRow('unplanned', i, { note: e.target.value })} />
              <Button
                className="self-start"
                variant="ghost"
                icon={<Trash2 aria-hidden="true" className={ICON} />}
                aria-label={`Remove ${row.lead.trim() || `something else ${i + 1}`}`}
                onClick={() => setForm(f => ({ ...f, unplanned: f.unplanned.filter((_, j) => j !== i) }))}
              >
                Remove
              </Button>
            </fieldset>
          ))}
          <Button className="self-start" variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={() => setForm(f => ({ ...f, unplanned: [...f.unplanned, emptyOutcome()] }))}>
            Add something else
          </Button>
        </section>

        <TextAreaField label="How the day went" hint="Optional. Markdown" rows={3} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />

        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {view.closed ? 'Save' : 'Close the day'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
