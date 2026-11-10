import type { SprintView } from '@hecate/core'
import { Banner, Button, Dialog, TextAreaField } from '@hecate/ui'
import { useState, type FormEvent } from 'react'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { textOps, type TextKind } from './sprint.ts'

const COPY: Record<TextKind, { title: string; label: string; hint: string; saved: string }> = {
  goal: { title: 'goal', label: 'Goal', hint: 'What this sprint is for. Markdown', saved: 'Saved the goal' },
  retro: { title: 'retro', label: 'Retro', hint: 'What went well, what did not, what to change. Markdown', saved: 'Saved the retro' },
}

/** A sprint's goal or retro: one text, saved with sprint.start or sprint.update. design/components/sprint-page.md */
export function SprintText({ view, kind, onClose, save }: { view: SprintView; kind: TextKind; onClose: () => void; save: (ops: unknown[], label: string) => LocalResult }) {
  const [text, setText] = useState(view[kind] ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)
  const copy = COPY[kind]

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSaveError(null)
    const ops = textOps(view, kind, text)
    if (ops.length === 0) return onClose()
    const result = save(ops, `Save the ${copy.title} of sprint ${view.n}`)
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    pushToast({ tone: 'success', title: copy.saved, description: `Sprint ${view.n}` })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()} title={`Sprint ${view.n}: ${copy.title}`}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-md">
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}
        <TextAreaField label={copy.label} hint={copy.hint} rows={6} value={text} onChange={e => setText(e.target.value)} />
        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
