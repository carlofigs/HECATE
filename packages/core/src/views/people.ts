/**
 * people.ts — people as the app shows them: the list, and one person with
 * everything linked to them. Whether a person can be removed is answered by
 * person.remove itself, applied to a copy of the state, so the page says
 * exactly what the engine would refuse.
 */

import { applyBatch } from '../apply.ts'
import { prepareBatch } from '../batch.ts'
import { addDays } from '../dates.ts'
import type { IsoDate } from '../primitives.ts'
import type { WorkspaceState } from '../state.ts'
import { personLabel, summarise, type TaskSummary } from './selectors.ts'

type Person = WorkspaceState['people']['people'][number]
type Range = Person['ooo'][number]

/** How far ahead a leave range counts as "away" on the list, as Today's cutoffs do. */
const AWAY_DAYS = 14

export interface PersonRow {
  id: string
  label: string
  name: string | null
  role: string
  aliases: string[]
  /** Leave that covers today or starts within two weeks. */
  away: Range | null
  /** Open B tasks waiting on this person. */
  waiting: number
}

export interface PersonLeave extends Range {
  current: boolean
  past: boolean
}

export interface PersonView {
  person: Person
  label: string
  /** Open B tasks waiting on them, in board order. */
  waitingOn: TaskSummary[]
  /** Project cutoffs that name them, by date. */
  cutoffs: { id: string; projectSlug: string; projectName: string; date: IsoDate; what: string }[]
  /** Meetings that mention them, newest first. */
  meetings: { path: string; title: string; date: IsoDate }[]
  /** Leave and travel, in date order. */
  leave: PersonLeave[]
  /** Tasks a closed sprint archived that waited on them; removing them keeps their label there as text. */
  archived: { key: string; title: string; sprint: number }[]
  /** Whether person.remove would accept it now, and if not, why. */
  removable: { ok: true } | { ok: false; reason: string }
}

const openWaiting = (state: WorkspaceState, id: string) =>
  state.tasks.tasks.filter(t => t.completedAt === null && t.waitingOn?.personId === id)

const byStart = (a: Range, b: Range): number => a.start.localeCompare(b.start)

export function peopleList(state: WorkspaceState, today: IsoDate): PersonRow[] {
  const horizon = addDays(today, AWAY_DAYS)
  return state.people.people
    .map((p): PersonRow => ({
      id: p.id,
      label: personLabel(state, p.id) ?? p.role,
      name: p.name,
      role: p.role,
      aliases: [...p.aliases],
      away: [...p.ooo].sort(byStart).find(r => r.end >= today && r.start <= horizon) ?? null,
      waiting: openWaiting(state, p.id).length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** One person and what links to them, or null if there is no person with that id. */
export function personView(state: WorkspaceState, id: string, today: IsoDate): PersonView | null {
  const person = state.people.people.find(p => p.id === id)
  if (!person) return null
  const check = applyBatch(state, prepareBatch({ ops: [{ type: 'person.remove', id }] }, { opId: 'preview', at: state.people.updatedAt, actor: 'app' }))
  return {
    person,
    label: personLabel(state, id) ?? person.role,
    waitingOn: openWaiting(state, id).map(t => summarise(state, t)),
    cutoffs: Object.values(state.projects)
      .flatMap(p => p.cutoffs.filter(c => c.personId === id).map(c => ({ id: c.id, projectSlug: p.slug, projectName: p.name, date: c.date, what: c.what })))
      .sort((a, b) => a.date.localeCompare(b.date)),
    meetings: Object.entries(state.meetings)
      .filter(([, m]) => m.frontmatter.personIds.some(p => p === id))
      .map(([path, m]) => ({ path, title: m.frontmatter.title, date: m.frontmatter.date }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    leave: [...person.ooo].sort(byStart).map(r => ({ ...r, current: r.start <= today && r.end >= today, past: r.end < today })),
    archived: Object.values(state.sprints)
      .sort((a, b) => a.n - b.n)
      .flatMap(s => [...s.done, ...s.dropped].filter(t => t.waitingOn?.personId === id).map(t => ({ key: t.key, title: t.title, sprint: s.n }))),
    removable: check.ok ? { ok: true } : { ok: false, reason: check.errors[0]?.message ?? 'It cannot be removed now' },
  }
}
