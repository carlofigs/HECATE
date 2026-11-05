/**
 * query.ts — finding things in a workspace: tasks by filter, anything by
 * text, any entity by reference. MCP's find_tasks, search and get_entity
 * answer from here, and so will the app, so the two can never disagree about
 * what matches.
 */

import { formatWeekOf, mondayOf } from '../dates.ts'
import { IsoDate, type Urgency } from '../primitives.ts'
import type { Task, TaskKind } from '../schemas/tasks.ts'
import type { WorkspaceState } from '../state.ts'
import { findTask, personLabel, summarise, type TaskSummary } from './selectors.ts'

// ─── Tasks ──────────────────────────────────────────────────────────────────

export interface TaskFilter {
  /** Keys or legacy ids. */
  keys?: readonly string[]
  /** Status ids. */
  status?: readonly string[]
  kind?: TaskKind
  tag?: string
  /** A project slug. */
  project?: string
  urgency?: Urgency
  /** Words that must all appear in the title or note (any case). */
  text?: string
  /**
   * `open` (default): not done or dropped. `board`: everything in tasks.json.
   * `all`: the board and every closed sprint.
   */
  scope?: 'open' | 'board' | 'all'
}

export interface FoundTask extends TaskSummary {
  kind: TaskKind
  tags: string[]
  where: 'open' | 'archived'
  /** The closed sprint holding an archived task. */
  sprint: number | null
  completedAt: string | null
  /** Who or what a waiting task waits on. */
  waitingOn: string | null
}

const words = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean)
const containsAll = (haystack: string, needles: readonly string[]): boolean => {
  const lower = haystack.toLowerCase()
  return needles.every(w => lower.includes(w))
}

function found(state: WorkspaceState, task: Task, where: 'open' | 'archived', sprint: number | null): FoundTask {
  const person = personLabel(state, task.waitingOn?.personId ?? null)
  const waiting = [person, task.waitingOn?.text ?? null].filter((x): x is string => x !== null).join(' — ') || null
  return { ...summarise(state, task), kind: task.kind, tags: task.tags, where, sprint, completedAt: task.completedAt, waitingOn: waiting }
}

/** Tasks matching every given criterion, in board order (archived ones last, newest sprint first). */
export function findTasks(state: WorkspaceState, filter: TaskFilter = {}, limit = 50): { tasks: FoundTask[]; total: number } {
  const statusIndex = new Map(state.workspace.statuses.map((s, i) => [s.id, i]))
  const finished = new Set(state.workspace.statuses.filter(s => s.category === 'done' || s.category === 'dropped').map(s => s.id))
  const scope = filter.scope ?? 'open'
  const keys = filter.keys ? new Set(filter.keys.map(k => findTask(state, k)?.task.key ?? k)) : null
  const projectId = filter.project ? (state.projects[filter.project]?.id ?? '∅') : null
  const text = filter.text ? words(filter.text) : []

  const matches = (t: Task): boolean =>
    (!keys || keys.has(t.key)) &&
    (!filter.status || filter.status.includes(t.status)) &&
    (!filter.kind || t.kind === filter.kind) &&
    (!filter.tag || t.tags.includes(filter.tag.replace(/^#/, '').toLowerCase())) &&
    (projectId === null || t.projectId === projectId) &&
    (!filter.urgency || t.urgency === filter.urgency) &&
    (text.length === 0 || containsAll(`${t.title}\n${t.note ?? ''}`, text))

  const board = state.tasks.tasks
    .filter(t => (scope !== 'open' || !finished.has(t.status)) && matches(t))
    .sort((a, b) => (statusIndex.get(a.status) ?? 99) - (statusIndex.get(b.status) ?? 99) || (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    .map(t => found(state, t, 'open', null))
  const archived = scope !== 'all'
    ? []
    : Object.values(state.sprints)
      .sort((a, b) => b.n - a.n)
      .flatMap(s => [...s.done, ...s.dropped].filter(matches).map(t => found(state, t, 'archived', s.n)))
  const all = [...board, ...archived]
  return { tasks: all.slice(0, Math.max(0, limit)), total: all.length }
}

// ─── Search ─────────────────────────────────────────────────────────────────

export type EntityKind = 'task' | 'project' | 'person' | 'term' | 'reference' | 'focus' | 'sprint' | 'meeting' | 'keep-in-mind' | 'profile'

export interface SearchHit {
  kind: EntityKind
  /** Pass to getEntity for the whole thing. */
  ref: string
  title: string
  /** The text around the first match. */
  snippet: string
}

interface Doc {
  kind: EntityKind
  ref: string
  title: string
  text: string
}

function documents(state: WorkspaceState): Doc[] {
  const docs: Doc[] = []
  const add = (kind: EntityKind, ref: string, title: string, ...parts: (string | null | undefined)[]): void => {
    docs.push({ kind, ref, title, text: parts.filter((p): p is string => typeof p === 'string' && p !== '').join('\n') })
  }
  const archived = Object.values(state.sprints).flatMap(s => [...s.done, ...s.dropped])
  for (const t of [...state.tasks.tasks, ...archived]) add('task', t.key, t.title, t.title, t.note, t.tags.map(tag => `#${tag}`).join(' '))
  for (const p of Object.values(state.projects)) {
    add('project', `project:${p.slug}`, p.name, p.name, p.subtitle, p.summary, p.phase, p.currentFocus, p.owner,
      ...p.sections.flatMap(s => [s.title, s.content]), ...p.openQuestions.flatMap(q => [q.question, q.resolution]),
      ...p.nextActions.map(a => a.text), ...p.timeline.map(t => t.phase), ...p.deadlines.map(d => d.title))
  }
  for (const p of state.people.people) add('person', `person:${p.id}`, p.name ?? p.role, p.name, ...p.aliases, p.role, p.notes)
  for (const t of state.glossary.terms) add('term', `term:${t.term}`, t.term, t.term, ...t.aliases, t.meaning)
  for (const [name, content] of Object.entries(state.references)) add('reference', `reference:${name}`, name, content)
  for (const w of Object.values(state.focusWeeks)) {
    add('focus', `focus:${w.weekOf}`, `Week of ${formatWeekOf(w.weekOf)}`,
      ...w.sections.flatMap(s => [s.title, s.content]), ...w.priorities.flatMap(p => [p.lead, p.detail]), ...w.callouts.flatMap(c => [c.lead, c.text]),
      ...w.lastWeek.map(l => l.text), ...w.days.flatMap(d => [...d.plan.flatMap(p => [p.lead, p.detail]), ...d.outcomes.flatMap(o => [o.lead, o.note]), d.note]),
      ...w.schedule.flatMap(r => [r.title, r.note]))
  }
  for (const s of Object.values(state.sprints)) add('sprint', `sprint:${s.n}`, `Sprint ${s.n}`, s.goal, s.retro, ...s.sections.flatMap(x => [x.title, x.content]))
  for (const [path, m] of Object.entries(state.meetings)) add('meeting', `meeting:${path.slice('meetings/'.length, -'.md'.length)}`, m.frontmatter.title, m.frontmatter.title, m.body)
  add('keep-in-mind', 'keep-in-mind', 'Keep in mind', ...state.keepInMind.items.flatMap(i => [i.lead, i.text]))
  add('profile', 'profile', 'Profile', state.profile.me, state.profile.preferences, state.profile.productivitySystem,
    ...state.profile.responsibilities.flatMap(r => [r.name, r.cadence, r.notes]))
  return docs
}

function snippet(text: string, word: string, width = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = Math.max(0, flat.toLowerCase().indexOf(word))
  const start = Math.max(0, at - Math.floor(width / 3))
  const piece = flat.slice(start, start + width)
  return `${start > 0 ? '…' : ''}${piece}${start + width < flat.length ? '…' : ''}`
}

/** Everything whose text contains all the query's words (any case): exact titles first, then titles, then the rest. */
export function searchWorkspace(state: WorkspaceState, query: string, limit = 20): { hits: SearchHit[]; total: number } {
  const terms = words(query)
  if (terms.length === 0) return { hits: [], total: 0 }
  const exact = terms.join(' ')
  const scored = documents(state)
    .filter(d => containsAll(`${d.title}\n${d.text}`, terms))
    .map(d => ({ d, score: d.title.toLowerCase().trim() === exact ? 2 : containsAll(d.title, terms) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score)
  return {
    hits: scored.slice(0, Math.max(0, limit)).map(({ d }) => ({ kind: d.kind, ref: d.ref, title: d.title, snippet: snippet(`${d.text}`, terms[0] as string) })),
    total: scored.length,
  }
}

// ─── Entities ───────────────────────────────────────────────────────────────

export interface Entity {
  kind: EntityKind | 'workspace'
  ref: string
  data: unknown
}

/**
 * One thing by reference: a task key or legacy id (`A12`, `t-a12`), or
 * `project:<slug>`, `person:<id, name or role>`, `term:<term>`, `sprint:<n>`,
 * `focus:<any date in the week>`, `reference:<name>`,
 * `meeting:<date>-<slug>`, `keep-in-mind`, `profile`, `workspace`. A bare
 * word that is not a task is tried as a project slug.
 */
export function getEntity(state: WorkspaceState, ref: string): Entity | null {
  const trimmed = ref.trim()
  const colon = trimmed.indexOf(':')
  const prefix = colon > 0 ? trimmed.slice(0, colon).toLowerCase() : ''
  const rest = colon > 0 ? trimmed.slice(colon + 1).trim() : trimmed

  if (prefix === '') {
    if (trimmed === 'profile') return { kind: 'profile', ref: 'profile', data: state.profile }
    if (trimmed === 'keep-in-mind') return { kind: 'keep-in-mind', ref: 'keep-in-mind', data: state.keepInMind }
    if (trimmed === 'workspace') return { kind: 'workspace', ref: 'workspace', data: state.workspace }
    const located = findTask(state, /^[ab]\d+$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed)
    if (located) return { kind: 'task', ref: located.task.key, data: { ...located, summary: found(state, located.task, located.where, located.where === 'archived' ? located.sprint : null) } }
    const project = state.projects[trimmed.toLowerCase()]
    return project ? { kind: 'project', ref: `project:${project.slug}`, data: project } : null
  }

  switch (prefix) {
    case 'task':
      return getEntity(state, rest)
    case 'project': {
      const project = state.projects[rest.toLowerCase()] ?? Object.values(state.projects).find(p => p.name.toLowerCase() === rest.toLowerCase())
      return project ? { kind: 'project', ref: `project:${project.slug}`, data: project } : null
    }
    case 'person': {
      const lower = rest.toLowerCase()
      const person = state.people.people.find(p => p.id === rest)
        ?? state.people.people.find(p => p.name?.toLowerCase() === lower || p.aliases.some(a => a.toLowerCase() === lower) || p.role.toLowerCase() === lower)
      return person ? { kind: 'person', ref: `person:${person.id}`, data: person } : null
    }
    case 'term': {
      const lower = rest.toLowerCase()
      const term = state.glossary.terms.find(t => t.term.toLowerCase() === lower || t.aliases.some(a => a.toLowerCase() === lower))
      return term ? { kind: 'term', ref: `term:${term.term}`, data: term } : null
    }
    case 'sprint': {
      const sprint = /^-?\d+$/.test(rest) ? state.sprints[Number(rest)] : undefined
      return sprint ? { kind: 'sprint', ref: `sprint:${sprint.n}`, data: sprint } : null
    }
    case 'focus': {
      const date = IsoDate.safeParse(rest)
      const week = date.success ? state.focusWeeks[mondayOf(date.data)] : undefined
      return week ? { kind: 'focus', ref: `focus:${week.weekOf}`, data: week } : null
    }
    case 'reference': {
      const content = state.references[rest]
      return content === undefined ? null : { kind: 'reference', ref: `reference:${rest}`, data: { name: rest, content } }
    }
    case 'meeting': {
      const meeting = state.meetings[`meetings/${rest}.md`]
      return meeting ? { kind: 'meeting', ref: `meeting:${rest}`, data: meeting } : null
    }
    default:
      return null
  }
}

