/**
 * projects.ts — projects as the app shows them: the list, and one project
 * with every task linked to it, archived ones included. Built on findTasks,
 * so a project's tasks are exactly what find_tasks returns for it.
 */

import type { IsoDate } from '../primitives.ts'
import type { Project, WorkspaceState } from '../state.ts'
import { findTasks, type FoundTask } from './query.ts'
import { projectIsLive } from './selectors.ts'

/** Live projects first, by how much they need attention; closed ones (done, dropped) after. */
const STATUS_ORDER: Record<Project['status'], number> = { active: 0, blocked: 1, paused: 2, planned: 3, done: 4, dropped: 5 }

export interface ProjectDeadline {
  id: string
  date: IsoDate
  title: string
  hard: boolean
  note: string | null
  keys: string[]
  overdue: boolean
}

export interface ProjectRow {
  slug: string
  name: string
  subtitle: string | null
  status: Project['status']
  phase: string | null
  live: boolean
  /** Linked tasks still open on the board. */
  openTasks: number
  openQuestions: number
  /** Open questions marked as blockers. */
  blockers: number
  /** The earliest deadline from today on, or the latest overdue one if none is ahead. */
  nextDeadline: Pick<ProjectDeadline, 'date' | 'title' | 'hard' | 'overdue'> | null
}

export interface ProjectView {
  project: Project
  live: boolean
  tasks: {
    /** On the board and not finished, in board order. */
    open: FoundTask[]
    /** Done or dropped, still on the board until the sprint closes. */
    finished: FoundTask[]
    /** Done or dropped in a closed sprint, newest sprint first. */
    archived: FoundTask[]
  }
  /** In date order, each marked overdue when its date has passed. */
  deadlines: ProjectDeadline[]
}

const deadlinesOf = (project: Project, today: IsoDate): ProjectDeadline[] =>
  [...project.deadlines]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ id: d.id, date: d.date, title: d.title, hard: d.hard, note: d.note, keys: [...d.keys], overdue: d.date < today }))

function projectTasks(state: WorkspaceState, slug: string): ProjectView['tasks'] {
  const finished = new Set(state.workspace.statuses.filter(s => s.category === 'done' || s.category === 'dropped').map(s => s.id))
  const { tasks } = findTasks(state, { project: slug, scope: 'all' }, Number.POSITIVE_INFINITY)
  return {
    open: tasks.filter(t => t.where === 'open' && !finished.has(t.status)),
    finished: tasks.filter(t => t.where === 'open' && finished.has(t.status)),
    archived: tasks.filter(t => t.where === 'archived'),
  }
}

export function projectList(state: WorkspaceState, today: IsoDate): ProjectRow[] {
  return Object.values(state.projects)
    .map((p): ProjectRow => {
      const deadlines = deadlinesOf(p, today)
      const ahead = deadlines.find(d => !d.overdue)
      const next = ahead ?? deadlines.at(-1) ?? null
      const open = p.openQuestions.filter(q => q.status === 'open')
      return {
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        status: p.status,
        phase: p.phase,
        live: projectIsLive(p.status),
        openTasks: projectTasks(state, p.slug).open.length,
        openQuestions: open.length,
        blockers: open.filter(q => q.blocker).length,
        nextDeadline: next ? { date: next.date, title: next.title, hard: next.hard, overdue: next.overdue } : null,
      }
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
}

/** One project and everything linked to it, or null if there is no project with that slug. */
export function projectView(state: WorkspaceState, slug: string, today: IsoDate): ProjectView | null {
  const project = state.projects[slug]
  if (!project) return null
  return { project, live: projectIsLive(project.status), tasks: projectTasks(state, slug), deadlines: deadlinesOf(project, today) }
}
