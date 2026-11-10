/**
 * Changes made on a page, as ops through the store, with the feedback each
 * change needs (M-app-05): a toast, with Undo where it can be undone
 * exactly, and the reason when something cannot apply. Today and Projects use it.
 */
import { useApp } from './appStore.ts'
import type { LocalResult } from './store.ts'
import { pushToast } from './toasts.ts'

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

export interface Done {
  title: string
  description?: string
  /** Ops that put back exactly what the change replaced. */
  undo?: unknown[]
}

export function useActions() {
  const apply = useApp(s => s.apply)

  /** Applies ops; on refusal says why. `label` is imperative ("Remove from today's plan"), as the store reuses it. */
  const run = (ops: unknown[], label: string): boolean => {
    const result = apply(ops, label)
    if (!result.ok) pushToast({ tone: 'danger', title: `Couldn't ${lower(label)}`, description: `${result.message}.` })
    return result.ok
  }

  /** A change that says it happened, with Undo when it can be undone exactly. */
  const change = (ops: unknown[], label: string, done: Done): void => {
    if (ops.length === 0 || !run(ops, label)) return
    const { undo } = done
    pushToast({
      tone: 'success',
      title: done.title,
      ...(done.description ? { description: done.description } : {}),
      ...(undo ? { action: { label: 'Undo', altText: `Undo: ${lower(done.title)}`, onAction: () => void run(undo, `Undo: ${lower(done.title)}`) } } : {}),
    })
  }

  return {
    run,
    change,
    /** For the editors, which show a refusal beside the form instead of in a toast (R-27). */
    save: (ops: unknown[], label: string): LocalResult => apply(ops, label),
  }
}
