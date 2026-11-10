/**
 * sprints.ts — sprints as the app shows them: the list, and one sprint with
 * its goal, retro and tasks. An open sprint's tasks are a preview of
 * sprint.close, made by applying that op to a copy of the state, so what the
 * page says a close will do is exactly what the engine does.
 */

import { applyBatch } from '../apply.ts'
import { prepareBatch } from '../batch.ts'
import { addDays, sprintOf, todayIn } from '../dates.ts'
import type { IsoDate } from '../primitives.ts'
import type { Task } from '../schemas/tasks.ts'
import type { Sprint, WorkspaceState } from '../state.ts'
import { findTask, sprintPosition, summarise, type SprintPosition, type TaskSummary } from './selectors.ts'

type Velocity = NonNullable<Sprint['velocity']>

export interface SprintSummary {
  n: number
  start: IsoDate
  end: IsoDate
  /** The sprint today falls in. */
  current: boolean
  closed: boolean
  closedAt: string | null
  /** Imported from v1's week log or archive. */
  legacy: boolean
  goal: string | null
  velocity: Velocity | null
}

export interface SprintView extends SprintSummary {
  /** Today's place in it, for the current sprint. */
  position: SprintPosition | null
  /** Whether it has a file yet (sprint.start, or any write to it). */
  stored: boolean
  retro: string | null
  sections: Sprint['sections']
  /** Closed: what the close archived. Open: what closing it now would archive. */
  done: TaskSummary[]
  dropped: TaskSummary[]
  /** Closed: what was still in progress. Open: what closing it now would carry. */
  carried: TaskSummary[]
  /** Open sprints only: whether it can be closed now, and whether that is before its last day. */
  closable: { ok: true; early: boolean } | { ok: false; reason: string } | null
}

/** A sprint's dates from the cadence. */
function bounds(state: WorkspaceState, n: number): { start: IsoDate; end: IsoDate } | null {
  const settings = state.workspace.sprint
  if (!settings) return null
  const length = 7 * settings.lengthWeeks
  const start = addDays(settings.anchor, (n - settings.anchorNumber) * length)
  return { start, end: addDays(start, length - 1) }
}

const currentN = (state: WorkspaceState, today: IsoDate): number | null =>
  state.workspace.sprint ? sprintOf(today, state.workspace.sprint).n : null

/** Every sprint with a file, and the current one even without, newest first. */
export function sprintList(state: WorkspaceState, today: IsoDate): SprintSummary[] {
  const current = currentN(state, today)
  const rows: SprintSummary[] = Object.values(state.sprints).map(s => ({
    n: s.n, start: s.start, end: s.end, current: s.n === current, closed: s.closedAt !== null, closedAt: s.closedAt,
    legacy: s.legacy, goal: s.goal, velocity: s.velocity,
  }))
  const dates = current === null ? null : bounds(state, current)
  if (current !== null && dates && !state.sprints[current]) {
    rows.push({ n: current, ...dates, current: true, closed: false, closedAt: null, legacy: false, goal: null, velocity: null })
  }
  return rows.sort((a, b) => b.n - a.n)
}

const summaries = (state: WorkspaceState, tasks: readonly Task[]): TaskSummary[] => tasks.map(t => summarise(state, t))

const byKey = (state: WorkspaceState, keys: readonly string[]): TaskSummary[] =>
  keys.flatMap(k => {
    const found = findTask(state, k)
    return found ? [summarise(state, found.task)] : []
  })

/**
 * One sprint, or null when the workspace has no cadence and no file for it.
 * `now` is the moment a close would happen: it decides the current sprint and
 * whether closing is early.
 */
export function sprintView(state: WorkspaceState, n: number, now: Date): SprintView | null {
  const today = todayIn(state.workspace.timezone, now)
  const stored = state.sprints[n] ?? null
  const dates = stored ? { start: stored.start, end: stored.end } : bounds(state, n)
  if (!dates) return null
  const current = currentN(state, today) === n
  const base = {
    n, ...dates, current, closed: stored?.closedAt != null, closedAt: stored?.closedAt ?? null, legacy: stored?.legacy ?? false,
    goal: stored?.goal ?? null, position: current ? sprintPosition(state, today) : null, stored: stored !== null,
    retro: stored?.retro ?? null, sections: stored?.sections ?? [],
  }

  if (stored?.closedAt) {
    return {
      ...base, velocity: stored.velocity, closable: null,
      done: summaries(state, stored.done), dropped: summaries(state, stored.dropped), carried: byKey(state, stored.carried),
    }
  }

  // What closing it now would do: the op itself, applied to a copy.
  const preview = applyBatch(state, prepareBatch({ ops: [{ type: 'sprint.close', n }] }, { opId: 'preview', at: now.toISOString(), actor: 'app' }))
  if (!preview.ok) {
    return { ...base, velocity: null, done: [], dropped: [], carried: [], closable: { ok: false, reason: preview.errors[0]?.message ?? 'It cannot be closed now' } }
  }
  const after = preview.state.sprints[n]
  return {
    ...base,
    velocity: after?.velocity ?? null,
    done: summaries(state, after?.done ?? []),
    dropped: summaries(state, after?.dropped ?? []),
    carried: byKey(state, after?.carried ?? []),
    closable: { ok: true, early: preview.warnings.some(w => w.code === 'early-close') },
  }
}
