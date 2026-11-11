/**
 * check.ts — invariants that span files, which no single file schema can see.
 *
 * Run by applyBatch after every batch (an error fails the batch) and usable on
 * its own to audit a loaded workspace.
 */

import { pathFor } from './files.ts'
import { checkPolicy } from './policy.ts'
import type { WorkspaceState } from './state.ts'

export interface Issue {
  severity: 'error' | 'warning'
  code: string
  /** The workspace file the issue is in. */
  path: string
  message: string
}

export function checkWorkspace(state: WorkspaceState): Issue[] {
  const issues: Issue[] = []
  const error = (path: string, code: string, message: string): void => { issues.push({ severity: 'error', code, path, message }) }

  const statuses = new Map(state.workspace.statuses.map(s => [s.id, s]))
  const tags = new Set(state.workspace.tags.map(t => t.id))
  const projectIds = new Set(Object.values(state.projects).map(p => p.id))
  const personIds = new Set(state.people.people.map(p => p.id))
  const archived = Object.values(state.sprints).flatMap(s => [...s.done, ...s.dropped])
  const knownKeys = new Set<string>([...state.tasks.tasks.map(t => t.key), ...archived.map(t => t.key)])

  const checkKeys = (path: string, where: string, keys: readonly string[]): void => {
    for (const key of keys) if (!knownKeys.has(key)) error(path, 'unknown-key', `${where} refers to ${key}, which is not a task`)
  }

  // tasks.json
  const archivedKeys = new Set(archived.map(t => t.key))
  for (const t of state.tasks.tasks) {
    const status = statuses.get(t.status)
    if (!status) error('tasks.json', 'unknown-status', `${t.key} has status "${t.status}", which the workspace does not define`)
    else if ((status.category === 'done' || status.category === 'dropped') !== (t.completedAt !== null)) {
      error('tasks.json', 'completed-at', `${t.key} is "${status.name}" but completedAt is ${t.completedAt === null ? 'unset' : 'set'}`)
    }
    for (const tag of t.tags) if (!tags.has(tag)) error('tasks.json', 'unknown-tag', `${t.key} has tag "${tag}", which the workspace does not define`)
    if (t.projectId !== null && !projectIds.has(t.projectId)) error('tasks.json', 'unknown-project', `${t.key} belongs to a project that does not exist`)
    if (t.waitingOn?.personId && !personIds.has(t.waitingOn.personId)) error('tasks.json', 'unknown-person', `${t.key} waits on a person who does not exist`)
    checkKeys('tasks.json', `${t.key} dependsOn`, t.dependsOn)
    if (archivedKeys.has(t.key)) error('tasks.json', 'duplicate-key', `${t.key} is both open and archived in a sprint`)
  }

  // focus weeks
  for (const [weekOf, week] of Object.entries(state.focusWeeks)) {
    const path = pathFor('focusWeek', { weekOf: week.weekOf })
    if (weekOf !== week.weekOf) error(path, 'file-name', `Stored under ${weekOf} but its weekOf is ${week.weekOf}`)
    for (const row of week.schedule) checkKeys(path, `Schedule entry "${row.title ?? 'personal'}"`, row.keys)
    for (const day of week.days) {
      for (const item of day.plan) checkKeys(path, `Plan item "${item.lead}"`, item.keys)
      for (const item of day.outcomes) checkKeys(path, `Outcome "${item.lead}"`, item.keys)
    }
    for (const item of week.priorities) checkKeys(path, `Priority "${item.lead}"`, item.keys)
    for (const item of week.callouts) checkKeys(path, 'A callout', item.keys)
    for (const item of week.lastWeek) checkKeys(path, 'A last-week item', item.keys)
  }

  for (const item of state.keepInMind.items) {
    checkKeys('focus/keep-in-mind.json', 'A keep-in-mind item', item.keys)
    if (item.projectId !== null && !projectIds.has(item.projectId)) error('focus/keep-in-mind.json', 'unknown-project', 'A keep-in-mind item belongs to a project that does not exist')
  }

  for (const [slug, project] of Object.entries(state.projects)) {
    const path = pathFor('project', { slug: project.slug })
    if (slug !== project.slug) error(path, 'file-name', `Stored under ${slug} but its slug is ${project.slug}`)
    for (const c of project.cutoffs) if (c.personId !== null && !personIds.has(c.personId)) error(path, 'unknown-person', `Cutoff "${c.what}" refers to a person who does not exist`)
    for (const d of project.deadlines) checkKeys(path, `Deadline "${d.title}"`, d.keys)
    for (const c of project.cutoffs) checkKeys(path, `Cutoff "${c.what}"`, c.keys)
    for (const q of project.openQuestions) checkKeys(path, `OQ-${q.n}`, q.keys)
    for (const a of project.nextActions) checkKeys(path, `Next action "${a.text}"`, a.keys)
  }

  for (const [n, sprint] of Object.entries(state.sprints)) {
    const path = pathFor('sprint', { n: sprint.n })
    if (Number(n) !== sprint.n) error(path, 'file-name', `Stored under ${n} but its n is ${sprint.n}`)
    // person.remove turns these into text (ADR 0004), so a dangling id is a fault.
    for (const t of [...sprint.done, ...sprint.dropped]) {
      if (t.waitingOn?.personId && !personIds.has(t.waitingOn.personId)) error(path, 'unknown-person', `${t.key} (archived) waits on a person who does not exist`)
    }
  }

  for (const term of state.glossary.terms) {
    if (term.projectId !== null && !projectIds.has(term.projectId)) error('glossary.json', 'unknown-project', `Term "${term.term}" belongs to a project that does not exist`)
  }

  for (const [path, meeting] of Object.entries(state.meetings)) {
    const fm = meeting.frontmatter
    for (const id of fm.personIds) if (!personIds.has(id)) error(path, 'unknown-person', 'Refers to a person who does not exist')
    for (const id of fm.projectIds) if (!projectIds.has(id)) error(path, 'unknown-project', 'Refers to a project that does not exist')
    checkKeys(path, 'The meeting', fm.keys)
    for (const issue of checkPolicy('meetingFrontmatter', fm, state.workspace.policy)) {
      issues.push({ severity: issue.severity, code: issue.code, path, message: issue.message })
    }
  }

  for (const issue of checkPolicy('people', state.people, state.workspace.policy)) {
    issues.push({ severity: issue.severity, code: issue.code, path: 'people.json', message: issue.message })
  }

  return issues
}

// ─── Possible names in prose (sanitised workspaces) ─────────────────────────

const COMMON = new Set([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
  'Sprint', 'Review', 'Retro', 'Planning', 'Standup', 'Stand', 'Team', 'Product', 'Manager', 'Lead', 'Head', 'Data',
  'Analyst', 'Analytics', 'Engineering', 'Engineer', 'Delivery', 'Business', 'Commercial', 'Project', 'Programme', 'Program',
  'Week', 'Glance', 'Today', 'Last', 'Next', 'Keep', 'Mind', 'Waiting', 'On', 'The', 'A', 'An', 'And', 'Of', 'For', 'With',
  'Done', 'In', 'Progress', 'To', 'Do', 'Not', 'Doing', 'Backlog', 'Open', 'Question', 'Questions', 'Phase', 'Draft',
  'Monthly', 'Weekly', 'Daily', 'Quarterly', 'Report', 'Dashboard', 'Scorecard', 'Meeting', 'Notes', 'Sign',
])

/**
 * Word pairs in `texts` that look like a person's first and last name: two
 * capitalised words that are not a known term, project, status or tag, nor a
 * common word. A heuristic for sanitised workspaces — it warns, never blocks.
 */
export function findPossibleNames(state: WorkspaceState, texts: readonly string[]): string[] {
  const known = new Set<string>()
  const addWords = (value: string | null | undefined): void => { for (const w of (value ?? '').split(/\s+/)) if (w) known.add(w) }
  for (const t of state.glossary.terms) { addWords(t.term); t.aliases.forEach(addWords) }
  for (const p of Object.values(state.projects)) addWords(p.name)
  for (const s of state.workspace.statuses) addWords(s.name)
  for (const t of state.workspace.tags) addWords(t.label)
  for (const a of state.workspace.areas) addWords(a.label)
  addWords(state.workspace.name)

  const found = new Set<string>()
  const pair = /\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})\b/g
  for (const text of texts) {
    for (const m of text.matchAll(pair)) {
      const [, first, last] = m as unknown as [string, string, string]
      if (COMMON.has(first) || COMMON.has(last) || known.has(first) || known.has(last)) continue
      found.add(`${first} ${last}`)
    }
  }
  return [...found]
}
