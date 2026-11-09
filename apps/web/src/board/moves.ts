/**
 * Where a card goes, as ops. Pure functions over an arrangement (each
 * status's keys in board order), so drag and drop, the Move menu and undo
 * all reduce to one `task.move` with `after` = the card's new predecessor
 * (null for the top of a column). The engine places it between that
 * predecessor and its successor (fractional order, ADR 0004).
 */
import type { BoardColumn } from '@hecate/core'

export type Arrangement = Record<string, string[]>

export interface MoveOp {
  type: 'task.move'
  task: string
  status: string
  after: string | null
}

export const arrangementOf = (columns: readonly BoardColumn[]): Arrangement =>
  Object.fromEntries(columns.map(c => [c.status.id, c.cards.map(card => card.key)]))

/** The status a key (or a status id) belongs to. */
export function containerOf(arrangement: Arrangement, id: string): string | null {
  if (id in arrangement) return id
  return Object.keys(arrangement).find(status => arrangement[status]?.includes(id)) ?? null
}

/**
 * The arrangement while `active` is dragged over `over` (a card key or a
 * status id). Over a card, it takes that card's place: moving down a column
 * it lands after the card, moving up it lands before it, as the eye expects
 * (v1 dropped a card one slot short when dragging down).
 */
export function arrangeOver(arrangement: Arrangement, active: string, over: string): Arrangement {
  const from = containerOf(arrangement, active)
  const to = containerOf(arrangement, over)
  if (!from || !to || active === over) return arrangement
  const source = [...(arrangement[from] ?? [])]
  const fromIndex = source.indexOf(active)
  if (from === to) {
    const toIndex = over === to ? source.length - 1 : source.indexOf(over)
    if (toIndex < 0 || toIndex === fromIndex) return arrangement
    source.splice(fromIndex, 1)
    source.splice(toIndex, 0, active)
    return { ...arrangement, [from]: source }
  }
  source.splice(fromIndex, 1)
  const target = [...(arrangement[to] ?? [])]
  const overIndex = target.indexOf(over)
  target.splice(overIndex < 0 ? target.length : overIndex, 0, active)
  return { ...arrangement, [from]: source, [to]: target }
}

/** The predecessor of `key` in its column, or null at the top. */
function placement(arrangement: Arrangement, key: string): { status: string; after: string | null } | null {
  const status = containerOf(arrangement, key)
  if (!status) return null
  const keys = arrangement[status] ?? []
  const index = keys.indexOf(key)
  return { status, after: index > 0 ? (keys[index - 1] ?? null) : null }
}

/** The op that puts `key` where `next` shows it; null when it is where `before` had it. */
export function moveOp(before: Arrangement, next: Arrangement, key: string): MoveOp | null {
  const was = placement(before, key)
  const now = placement(next, key)
  if (!now || (was && was.status === now.status && was.after === now.after)) return null
  return { type: 'task.move', task: key, ...now }
}

export type MenuMove = 'top' | 'up' | 'down' | 'bottom' | { status: string }

/** The Move menu: the non-drag way to do anything a drag can (WCAG 2.5.7). */
export function menuMove(arrangement: Arrangement, key: string, move: MenuMove): MoveOp | null {
  const status = containerOf(arrangement, key)
  if (!status) return null
  const keys = (arrangement[status] ?? []).filter(k => k !== key)
  const index = (arrangement[status] ?? []).indexOf(key)
  if (typeof move === 'object') {
    if (move.status === status) return null
    const target = (arrangement[move.status] ?? []).filter(k => k !== key)
    return { type: 'task.move', task: key, status: move.status, after: target.at(-1) ?? null }
  }
  const at = { top: 0, up: index - 1, down: index + 1, bottom: keys.length }[move]
  if (at < 0 || at > keys.length || at === index) return null
  return { type: 'task.move', task: key, status, after: at > 0 ? (keys[at - 1] ?? null) : null }
}

/** The op that puts `key` back where `arrangement` has it now: the undo for a move or a completion. */
export function restoreOp(arrangement: Arrangement, key: string): MoveOp | null {
  const now = placement(arrangement, key)
  return now ? { type: 'task.move', task: key, ...now } : null
}
