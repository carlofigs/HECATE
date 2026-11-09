/**
 * selectors.ts — the derived views of a workspace.
 *
 * Nothing here is stored: Waiting On, today, blocked tasks and sprint
 * position are computed from tasks, focus weeks and the sprint cadence, so the
 * app and Claude always see the same answer. Every function is pure and takes
 * the date it should answer for; none reads a clock.
 *
 * People are shown by name when they have one and by role otherwise, so a
 * sanitised workspace (roles only) never prints a name.
 */

import { addDays, diffDays, formatDay, formatWeekOf, mondayOf, sprintOf, todayIn } from '../dates.ts'
import type { FileData } from '../files.ts'
import type { IsoDate, TaskKey, Urgency } from '../primitives.ts'
import type { Task } from '../schemas/tasks.ts'
import type { StatusCategory } from '../schemas/workspace.ts'
import type { FocusWeek, WorkspaceState } from '../state.ts'

type ScheduleRow = FocusWeek['schedule'][number]
type PlanItem = FocusWeek['days'][number]['plan'][number]
type Outcome = FocusWeek['days'][number]['outcomes'][number]
type ActivityEntry = FileData<'activityEntry'>

export interface TaskSummary {
  key: TaskKey
  title: string
  status: string
  statusName: string
  urgency: Urgency | null
  due: IsoDate | null
  projectSlug: string | null
  /** Open tasks this one is waiting for. */
  blockedBy: TaskKey[]
}

const URGENCY_RANK: Record<string, number> = { high: 0, med: 1, low: 2 }

function statusInfo(state: WorkspaceState, status: string): { index: number; name: string; category: StatusCategory } {
  const index = state.workspace.statuses.findIndex(s => s.id === status)
  const s = state.workspace.statuses[index]
  return s ? { index, name: s.name, category: s.category } : { index: Number.MAX_SAFE_INTEGER, name: status, category: 'todo' }
}

const isOpen = (task: Task): boolean => task.completedAt === null

/** Board order: status column order, then position in the column, then key. */
function byBoardOrder(state: WorkspaceState): (a: Task, b: Task) => number {
  return (a, b) =>
    statusInfo(state, a.status).index - statusInfo(state, b.status).index ||
    (a.order < b.order ? -1 : a.order > b.order ? 1 : 0) ||
    a.key.localeCompare(b.key)
}

/** The slug of the project with this id, or null. */
export function projectSlug(state: WorkspaceState, projectId: string | null): string | null {
  if (projectId === null) return null
  return Object.values(state.projects).find(p => p.id === projectId)?.slug ?? null
}

/** A person as they should be shown: name if recorded, otherwise role. */
export function personLabel(state: WorkspaceState, personId: string | null): string | null {
  if (personId === null) return null
  const person = state.people.people.find(p => p.id === personId)
  return person ? (person.name ?? person.role) : null
}

export type TaskLocation = { task: Task; where: 'open' } | { task: Task; where: 'archived'; sprint: number }

/** A task by key or legacy id, open or archived in a closed sprint. */
export function findTask(state: WorkspaceState, ref: string): TaskLocation | null {
  const open = state.tasks.tasks.find(t => t.key === ref || t.legacyIds.includes(ref))
  if (open) return { task: open, where: 'open' }
  for (const sprint of Object.values(state.sprints)) {
    const task = [...sprint.done, ...sprint.dropped].find(t => t.key === ref || t.legacyIds.includes(ref))
    if (task) return { task, where: 'archived', sprint: sprint.n }
  }
  return null
}

/** The open tasks `task` depends on. Done, dropped and archived dependencies no longer block. */
export function blockers(state: WorkspaceState, task: Task): Task[] {
  return task.dependsOn
    .map(key => state.tasks.tasks.find(t => t.key === key))
    .filter((t): t is Task => t !== undefined && isOpen(t))
}

export const isBlocked = (state: WorkspaceState, task: Task): boolean => blockers(state, task).length > 0

export function summarise(state: WorkspaceState, task: Task): TaskSummary {
  return {
    key: task.key,
    title: task.title,
    status: task.status,
    statusName: statusInfo(state, task.status).name,
    urgency: task.urgency,
    due: task.due,
    projectSlug: projectSlug(state, task.projectId),
    blockedBy: blockers(state, task).map(t => t.key),
  }
}

const openTasks = (state: WorkspaceState): Task[] => state.tasks.tasks.filter(isOpen).sort(byBoardOrder(state))

/** A task as the board shows it: its summary, plus what a card needs to say. */
export interface BoardCard extends TaskSummary {
  kind: Task['kind']
  tags: string[]
  dependsOn: TaskKey[]
  /** Who a B task waits on (person and/or text), as Waiting On says it. */
  waitingOn: string | null
  completedAt: string | null
}

export interface BoardColumn {
  status: { id: string; name: string; category: StatusCategory }
  cards: BoardCard[]
}

const waitingLabel = (state: WorkspaceState, t: Task): string | null =>
  [personLabel(state, t.waitingOn?.personId ?? null), t.waitingOn?.text ?? null].filter((x): x is string => x !== null).join(' — ') || null

/**
 * The board: every status in the workspace's order, each with its tasks in
 * board order (fractional order, then key). Closed tasks still in tasks.json
 * (done or dropped, not yet archived by a sprint close) are on the board too.
 */
export function boardColumns(state: WorkspaceState): BoardColumn[] {
  const sorted = [...state.tasks.tasks].sort(byBoardOrder(state))
  return state.workspace.statuses.map(status => ({
    status: { id: status.id, name: status.name, category: status.category },
    cards: sorted
      .filter(t => t.status === status.id)
      .map(t => ({
        ...summarise(state, t),
        kind: t.kind,
        tags: [...t.tags],
        dependsOn: [...t.dependsOn],
        waitingOn: waitingLabel(state, t),
        completedAt: t.completedAt,
      })),
  }))
}

/** Open tasks in an `active` status, in board order. */
export function inProgress(state: WorkspaceState): TaskSummary[] {
  return openTasks(state).filter(t => statusInfo(state, t.status).category === 'active').map(t => summarise(state, t))
}

/** Open tasks with at least one open dependency. */
export function blockedTasks(state: WorkspaceState): TaskSummary[] {
  return openTasks(state).filter(t => isBlocked(state, t)).map(t => summarise(state, t))
}

export interface WaitingItem extends TaskSummary {
  /** Who it waits on: the person (name or role), and any free text. */
  who: string | null
  /** The next meeting this week that refers to it, e.g. "Thu 13:30". */
  meeting: string | null
  /** Open tasks that depend on it. */
  unblocks: { key: TaskKey; title: string }[]
}

export function focusWeekFor(state: WorkspaceState, date: IsoDate): FocusWeek | null {
  return state.focusWeeks[mondayOf(date)] ?? null
}

const shortDay = (date: IsoDate): string => formatDay(date).split(' ')[0] ?? date

/** Every open B task, most urgent first, with who it waits on and what it unblocks. */
export function waitingOn(state: WorkspaceState, today: IsoDate): WaitingItem[] {
  const week = focusWeekFor(state, today)
  const rank = (t: Task): number => URGENCY_RANK[t.urgency ?? ''] ?? 3
  return openTasks(state)
    .filter(t => t.kind === 'waiting')
    .sort((a, b) => rank(a) - rank(b))
    .map(t => {
      const who = waitingLabel(state, t)
      const next = (week?.schedule ?? [])
        .filter(r => r.date >= today && r.keys.includes(t.key))
        .sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')))[0]
      const meeting = next ? `${shortDay(next.date)}${next.start ? ` ${next.start}` : ''}` : null
      const unblocks = openTasks(state)
        .filter(d => d.dependsOn.includes(t.key))
        .map(d => ({ key: d.key, title: d.title }))
      return { ...summarise(state, t), who, meeting, unblocks }
    })
}

export interface SprintPosition {
  n: number
  start: IsoDate
  end: IsoDate
  /** 1-based day of the sprint. */
  day: number
  length: number
  daysLeft: number
  isFirstDay: boolean
  isLastDay: boolean
  /** The external tracker's number for this sprint, e.g. "Tracker sprint 9". */
  externalLabel: string | null
}

export function sprintPosition(state: WorkspaceState, today: IsoDate): SprintPosition | null {
  const settings = state.workspace.sprint
  if (!settings) return null
  const { n, start, end } = sprintOf(today, settings)
  const length = 7 * settings.lengthWeeks
  return {
    n, start, end, length,
    day: diffDays(start, today) + 1,
    daysLeft: diffDays(today, end),
    isFirstDay: today === start,
    isLastDay: today === end,
    externalLabel: settings.external ? `${settings.external.label} sprint ${n + settings.external.offset}` : null,
  }
}

export interface TodayView {
  date: IsoDate
  label: string
  /** Timed entries, in time order. */
  meetings: ScheduleRow[]
  allDay: ScheduleRow[]
  plan: PlanItem[]
  closed: boolean
  outcomes: Outcome[]
  /** The note written when the day was closed. */
  note: string | null
}

export function todayView(state: WorkspaceState, today: IsoDate): TodayView {
  const week = focusWeekFor(state, today)
  const rows = (week?.schedule ?? []).filter(r => r.date === today)
  const day = week?.days.find(d => d.date === today)
  return {
    date: today,
    label: formatDay(today),
    meetings: rows.filter(r => r.start !== null).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    allDay: rows.filter(r => r.start === null),
    plan: day?.plan ?? [],
    closed: day?.closedAt != null,
    outcomes: day?.outcomes ?? [],
    note: day?.note ?? null,
  }
}

export interface DueItem {
  date: IsoDate
  kind: 'task' | 'deadline'
  title: string
  key: TaskKey | null
  projectSlug: string | null
  hard: boolean
  overdue: boolean
}

/** Whether a project is still going: done and dropped projects are closed. */
export const projectIsLive = (status: string): boolean => status !== 'done' && status !== 'dropped'

/** Open tasks and project deadlines due by today + `days`, overdue ones included. */
export function dueSoon(state: WorkspaceState, today: IsoDate, days = 14): DueItem[] {
  const horizon = addDays(today, days)
  const items: DueItem[] = []
  for (const t of openTasks(state)) {
    if (t.due !== null && t.due <= horizon) {
      items.push({ date: t.due, kind: 'task', title: t.title, key: t.key, projectSlug: projectSlug(state, t.projectId), hard: false, overdue: t.due < today })
    }
  }
  for (const p of Object.values(state.projects)) {
    if (!projectIsLive(p.status)) continue
    for (const d of p.deadlines) {
      if (d.date <= horizon && d.date >= addDays(today, -days)) {
        items.push({ date: d.date, kind: 'deadline', title: d.title, key: null, projectSlug: p.slug, hard: d.hard, overdue: d.date < today })
      }
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || Number(b.hard) - Number(a.hard))
}

export interface CutoffItem {
  kind: 'cutoff' | 'ooo'
  start: IsoDate
  end: IsoDate
  who: string
  what: string | null
  projectSlug: string | null
}

/** Stakeholder cutoffs and leave that fall in the next `days` days. */
export function cutoffs(state: WorkspaceState, today: IsoDate, days = 14): CutoffItem[] {
  const horizon = addDays(today, days)
  const items: CutoffItem[] = []
  for (const p of Object.values(state.projects)) {
    if (!projectIsLive(p.status)) continue
    for (const c of p.cutoffs) {
      if (c.date >= today && c.date <= horizon) {
        items.push({ kind: 'cutoff', start: c.date, end: c.date, who: personLabel(state, c.personId) ?? c.who, what: c.what, projectSlug: p.slug })
      }
    }
  }
  for (const person of state.people.people) {
    for (const range of person.ooo) {
      if (range.start <= horizon && range.end >= today) {
        items.push({ kind: 'ooo', start: range.start, end: range.end, who: person.name ?? person.role, what: range.note, projectSlug: null })
      }
    }
  }
  return items.sort((a, b) => a.start.localeCompare(b.start))
}

export interface CompletedItem {
  key: TaskKey
  title: string
  result: 'done' | 'dropped'
  completedOn: IsoDate
  /** The closed sprint it was archived in, or null while still in tasks.json. */
  sprint: number | null
}

/** Everything finished on or after `since` (workspace-local), open and archived, newest first. */
export function completedSince(state: WorkspaceState, since: IsoDate): CompletedItem[] {
  const tz = state.workspace.timezone
  const localDate = (instant: string): IsoDate => todayIn(tz, new Date(Date.parse(instant)))
  const items: CompletedItem[] = []
  for (const t of state.tasks.tasks) {
    if (t.completedAt === null) continue
    const on = localDate(t.completedAt)
    if (on >= since) items.push({ key: t.key, title: t.title, result: statusInfo(state, t.status).category === 'dropped' ? 'dropped' : 'done', completedOn: on, sprint: null })
  }
  for (const s of Object.values(state.sprints)) {
    for (const [list, result] of [[s.done, 'done'], [s.dropped, 'dropped']] as const) {
      for (const t of list) {
        if (t.completedAt === null) continue
        const on = localDate(t.completedAt)
        if (on >= since) items.push({ key: t.key, title: t.title, result, completedOn: on, sprint: s.n })
      }
    }
  }
  return items.sort((a, b) => b.completedOn.localeCompare(a.completedOn) || a.key.localeCompare(b.key))
}

export interface Briefing {
  workspace: { name: string; timezone: string; policy: 'open' | 'sanitised' }
  today: IsoDate
  todayLabel: string
  sprint: SprintPosition | null
  week: {
    weekOf: IsoDate
    label: string
    exists: boolean
    callouts: FocusWeek['callouts']
    priorities: FocusWeek['priorities']
  }
  todayView: TodayView
  inProgress: TaskSummary[]
  waitingOn: WaitingItem[]
  blocked: TaskSummary[]
  dueSoon: DueItem[]
  cutoffs: CutoffItem[]
  keepInMind: FileData<'keepInMind'>['items']
  profile: { me: string; preferences: string }
  /** Recent activity supplied by the caller, newest first, at most 20. */
  activity: ActivityEntry[]
}

export const BRIEFING_ACTIVITY_LIMIT = 20

/** Everything a session needs to start work, in one call (MCP get_briefing). */
export function briefing(state: WorkspaceState, now: Date, options: { activity?: readonly ActivityEntry[] } = {}): Briefing {
  const today = todayIn(state.workspace.timezone, now)
  const weekOf = mondayOf(today)
  const week = state.focusWeeks[weekOf]
  return {
    workspace: { name: state.workspace.name, timezone: state.workspace.timezone, policy: state.workspace.policy },
    today,
    todayLabel: formatDay(today),
    sprint: sprintPosition(state, today),
    week: { weekOf, label: `Week of ${formatWeekOf(weekOf)}`, exists: week !== undefined, callouts: week?.callouts ?? [], priorities: week?.priorities ?? [] },
    todayView: todayView(state, today),
    inProgress: inProgress(state),
    waitingOn: waitingOn(state, today),
    blocked: blockedTasks(state),
    dueSoon: dueSoon(state, today),
    cutoffs: cutoffs(state, today),
    keepInMind: state.keepInMind.items,
    profile: { me: state.profile.me, preferences: state.profile.preferences },
    activity: [...(options.activity ?? [])]
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
      .slice(0, BRIEFING_ACTIVITY_LIMIT),
  }
}
