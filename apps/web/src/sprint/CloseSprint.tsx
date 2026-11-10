import { formatDay, type SprintView, type TaskSummary } from '@hecate/core'
import { Banner, Button, Dialog, KeyChip, TextAreaField } from '@hecate/ui'
import { useState, type FormEvent } from 'react'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { closeOps, tally } from './sprint.ts'

function Group({ id, title, tasks }: { id: string; title: string; tasks: readonly TaskSummary[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-stack-xs">
      <h3 id={id} className="text-heading-4 text-text-primary">
        {title} ({tasks.length})
      </h3>
      {tasks.length === 0 ? (
        <p className="text-body-sm text-text-muted">None.</p>
      ) : (
        <ul className="flex flex-col gap-stack-xs">
          {tasks.map(t => (
            <li key={t.key} className="flex flex-wrap items-baseline gap-inline-sm">
              <KeyChip taskKey={t.key} />
              <span className="text-body-md text-text-primary">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Review and close: exactly what sprint.close will archive and carry (core's
 * preview of the op itself), a retro, and one op. Nothing to undo in the app;
 * the close is one commit, which git can revert. design/components/sprint-page.md
 */
export function CloseSprint({ view, onClose, save }: { view: SprintView; onClose: () => void; save: (ops: unknown[], label: string) => LocalResult }) {
  const [retro, setRetro] = useState(view.retro ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)
  const early = view.closable?.ok === true && view.closable.early
  const counts = { done: view.done.length, carried: view.carried.length, dropped: view.dropped.length }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSaveError(null)
    const result = save(closeOps(view.n, retro), `Close sprint ${view.n}`)
    if (!result.ok) {
      setSaveError(`${result.message}. The sprint was not closed.`)
      return
    }
    pushToast({ tone: 'success', title: `Closed sprint ${view.n}`, description: tally(counts) })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={open => !open && onClose()}
      title={`Close sprint ${view.n}`}
      description="Closing moves the finished tasks below into the sprint's archive and records what is carried. It is one commit, which can be reverted in git; it cannot be undone here."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-lg">
        {saveError ? <Banner tone="danger" title="Not closed">{saveError}</Banner> : null}
        {early ? (
          <Banner tone="warning" title={`Sprint ${view.n} runs until ${formatDay(view.end)}`}>
            Closing now archives what is finished so far. Anything finished after this waits for the next close.
          </Banner>
        ) : null}
        <Group id="close-done" title="Done, to the archive" tasks={view.done} />
        <Group id="close-dropped" title="Dropped, to the archive" tasks={view.dropped} />
        <Group id="close-carried" title="Carried, still in progress" tasks={view.carried} />
        <TextAreaField label="Retro" hint="Optional. Markdown" rows={4} value={retro} onChange={e => setRetro(e.target.value)} />
        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Close sprint {view.n}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
