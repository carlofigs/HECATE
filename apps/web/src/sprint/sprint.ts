/**
 * A sprint's edits as ops. Pure, so the rules are tested without a browser.
 *
 * The goal and retro go through sprint.update once the sprint has a file;
 * before that, sprint.start creates it. A close always names its sprint,
 * never the "planning day" default, so it closes the sprint the page shows.
 */
import type { SprintView } from '@hecate/core'
import { nullable } from '../forms.ts'

export type TextKind = 'goal' | 'retro'

/** The ops that save the goal or the retro as `text`; nothing when it did not change. */
export function textOps(view: Pick<SprintView, 'n' | 'stored' | 'goal' | 'retro'>, kind: TextKind, text: string): unknown[] {
  const value = nullable(text)
  if (value === view[kind]) return []
  if (view.stored) return [{ type: 'sprint.update', n: view.n, [kind]: value }]
  return kind === 'goal' ? [{ type: 'sprint.start', n: view.n, goal: value }] : [{ type: 'sprint.start', n: view.n }, { type: 'sprint.update', n: view.n, retro: value }]
}

/** Closing the sprint, with its retro: one op, so one commit. */
export const closeOps = (n: number, retro: string): unknown[] => [{ type: 'sprint.close', n, retro: nullable(retro) }]

/** "1 done · 2 carried · 0 dropped". */
export const tally = (v: { done: number; carried: number; dropped: number }): string => `${v.done} done · ${v.carried} carried · ${v.dropped} dropped`
