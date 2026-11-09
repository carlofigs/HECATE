/**
 * What the Board does, as ops through the store, with the feedback each
 * needs (M-app-05): a toast for completing and adding, with Undo where the
 * move can be undone exactly; the reason when something cannot apply.
 */
import type { BoardCard, BoardColumn } from '@hecate/core'
import { useApp } from '../appStore.ts'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { arrangementOf, menuMove, restoreOp, type MenuMove, type MoveOp } from './moves.ts'

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

export function useBoardActions(columns: readonly BoardColumn[]) {
  const apply = useApp(s => s.apply)

  /** Applies ops; on refusal says why. Returns the new keys, or null. */
  const run = (ops: unknown[], label: string): Record<string, string> | null => {
    const result = apply(ops, label)
    if (!result.ok) {
      pushToast({ tone: 'danger', title: `Couldn't ${lower(label)}`, description: `${result.message}.` })
      return null
    }
    return result.keyMap
  }

  /** A change with an exact undo: put the card back where it is now. */
  const undoable = (card: BoardCard, ops: unknown[], label: string, done: string): void => {
    const restore = restoreOp(arrangementOf(columns), card.key)
    if (!run(ops, label)) return
    pushToast({
      tone: 'success',
      title: `${done} ${card.key}`,
      description: card.title,
      ...(restore ? { action: { label: 'Undo', altText: `Undo: move ${card.key} back with its Move menu`, onAction: () => void run([restore], `Undo ${lower(done)} ${card.key}`) } } : {}),
    })
  }

  return {
    complete: (card: BoardCard) => undoable(card, [{ type: 'task.complete', task: card.key }], `Complete ${card.key}`, 'Completed'),
    reopen: (card: BoardCard) => undoable(card, [{ type: 'task.reopen', task: card.key }], `Reopen ${card.key}`, 'Reopened'),
    move: (card: BoardCard, move: MenuMove) => {
      const op = menuMove(arrangementOf(columns), card.key, move)
      if (op) run([op], `Move ${card.key}`)
    },
    drop: (op: MoveOp) => run([op], `Move ${op.task}`),
    add: (status: string, title: string): string | null => {
      const keys = run([{ type: 'task.add', ref: '$1', kind: 'action', title, status }], 'Add a task')
      const key = keys?.$1 ?? null
      if (key) pushToast({ tone: 'success', title: `Added ${key}`, description: title })
      return key
    },
    /** For the editor, which shows a refusal beside the form instead of in a toast (R-27). */
    save: (ops: unknown[], label: string): LocalResult => apply(ops, label),
  }
}
