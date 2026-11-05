/**
 * state.ts — a whole workspace in memory, and its files on disk.
 *
 * The engine (apply.ts) works on a WorkspaceState: every file of the
 * workspace, parsed and validated. Storage turns files into state with
 * stateFromFiles and writes back only what a batch changed with changedFiles.
 *
 * The activity log is deliberately not part of state. It is append-only:
 * applyBatch returns the entries to append, and storage appends them to the
 * weekly JSONL file. Nothing ever rewrites a log, so a week that was never
 * loaded cannot be overwritten.
 */

import type { FileData } from './files.ts'
import { pathFor } from './files.ts'
import { CURRENT_VERSION } from './kinds.ts'
import type { Instant, IsoDate } from './primitives.ts'
import { parseFile, serializeFile } from './versioning.ts'

export type WorkspaceFile = FileData<'workspace'>
export type FocusWeek = FileData<'focusWeek'>
export type Project = FileData<'project'>
export type Sprint = FileData<'sprint'>
export type MeetingFrontmatter = FileData<'meetingFrontmatter'>

export interface Meeting {
  frontmatter: MeetingFrontmatter
  /** Markdown. */
  body: string
}

export interface WorkspaceState {
  workspace: WorkspaceFile
  profile: FileData<'profile'>
  tasks: FileData<'tasks'>
  keepInMind: FileData<'keepInMind'>
  people: FileData<'people'>
  glossary: FileData<'glossary'>
  /** Keyed by weekOf (a Monday). */
  focusWeeks: Record<string, FocusWeek>
  /** Keyed by slug. */
  projects: Record<string, Project>
  /** Keyed by sprint number. */
  sprints: Record<number, Sprint>
  /** Keyed by name: `references/{name}.md`. */
  references: Record<string, string>
  /** Keyed by path: `meetings/{date}-{slug}.md`. */
  meetings: Record<string, Meeting>
}

const SINGLE_FILES = {
  'workspace.json': 'workspace',
  'profile.json': 'profile',
  'tasks.json': 'tasks',
  'focus/keep-in-mind.json': 'keepInMind',
  'people.json': 'people',
  'glossary.json': 'glossary',
} as const

const FOCUS_RE = /^focus\/(\d{4}-\d{2}-\d{2})\.json$/
const PROJECT_RE = /^projects\/([a-z0-9-]+)\.json$/
const SPRINT_RE = /^sprints\/(-?\d+)\.json$/
const REFERENCE_RE = /^references\/([a-z0-9-]+)\.md$/
const MEETING_RE = /^meetings\/(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.md$/
const ACTIVITY_RE = /^activity\/\d{4}-W\d{2}\.jsonl$/

// ─── Meeting files ──────────────────────────────────────────────────────────
// Front matter is JSON between `---` fences. JSON is valid YAML, so any
// front-matter-aware tool reads it, and core needs no YAML parser.

const FENCE = '---'

export function serializeMeetingFile(meeting: Meeting): string {
  const frontmatter = JSON.stringify(parseFile('meetingFrontmatter', meeting.frontmatter), null, 2)
  const body = meeting.body.endsWith('\n') ? meeting.body : `${meeting.body}\n`
  return `${FENCE}\n${frontmatter}\n${FENCE}\n\n${body}`
}

export function parseMeetingFile(text: string): Meeting {
  const lines = text.split('\n')
  if (lines[0] !== FENCE) throw new SyntaxError('A meeting file must start with a --- front matter fence')
  const close = lines.indexOf(FENCE, 1)
  if (close < 0) throw new SyntaxError('Meeting front matter is not closed with ---')
  let raw: unknown
  try {
    raw = JSON.parse(lines.slice(1, close).join('\n'))
  } catch {
    throw new SyntaxError('Meeting front matter is not valid JSON')
  }
  const body = lines.slice(close + 1).join('\n').replace(/^\n/, '')
  return { frontmatter: parseFile('meetingFrontmatter', raw), body }
}

// ─── Files → state ──────────────────────────────────────────────────────────

export class WorkspaceLoadError extends Error {
  readonly problems: readonly { path: string; message: string }[]
  constructor(problems: { path: string; message: string }[]) {
    super(`The workspace could not be loaded:\n${problems.map(p => `- ${p.path}: ${p.message}`).join('\n')}`)
    this.name = 'WorkspaceLoadError'
    this.problems = problems
  }
}

/**
 * Parse every file of a workspace (paths relative to the workspace directory).
 * Activity logs are skipped (they are not state). Any unreadable, invalid,
 * unknown or missing file fails the whole load, naming each problem.
 */
export function stateFromFiles(files: Readonly<Record<string, string>>): WorkspaceState {
  const problems: { path: string; message: string }[] = []
  const single: Partial<Record<(typeof SINGLE_FILES)[keyof typeof SINGLE_FILES], unknown>> = {}
  const state = { focusWeeks: {}, projects: {}, sprints: {}, references: {}, meetings: {} } as Pick<
    WorkspaceState,
    'focusWeeks' | 'projects' | 'sprints' | 'references' | 'meetings'
  >

  const json = (text: string): unknown => {
    try {
      return JSON.parse(text)
    } catch {
      throw new SyntaxError('not valid JSON')
    }
  }

  for (const [path, text] of Object.entries(files)) {
    try {
      let m: RegExpExecArray | null
      if (path in SINGLE_FILES) {
        const kind = SINGLE_FILES[path as keyof typeof SINGLE_FILES]
        single[kind] = parseFile(kind, json(text))
      } else if ((m = FOCUS_RE.exec(path))) {
        const week = parseFile('focusWeek', json(text))
        if (week.weekOf !== m[1]) throw new Error(`weekOf is ${week.weekOf}; the file name says ${m[1]}`)
        state.focusWeeks[week.weekOf] = week
      } else if ((m = PROJECT_RE.exec(path))) {
        const project = parseFile('project', json(text))
        if (project.slug !== m[1]) throw new Error(`slug is ${project.slug}; the file name says ${m[1]}`)
        state.projects[project.slug] = project
      } else if ((m = SPRINT_RE.exec(path))) {
        const sprint = parseFile('sprint', json(text))
        if (String(sprint.n) !== m[1]) throw new Error(`n is ${sprint.n}; the file name says ${m[1]}`)
        state.sprints[sprint.n] = sprint
      } else if ((m = REFERENCE_RE.exec(path))) {
        state.references[m[1] as string] = text
      } else if ((m = MEETING_RE.exec(path))) {
        const meeting = parseMeetingFile(text)
        const expected = pathFor('meetingFrontmatter', { date: meeting.frontmatter.date, slug: m[2] as string })
        if (expected !== path) throw new Error(`front matter date ${meeting.frontmatter.date} does not match the file name`)
        state.meetings[path] = meeting
      } else if (ACTIVITY_RE.test(path)) {
        // Append-only log; read separately (parseActivityLog), never part of state.
      } else {
        throw new Error('not a recognised workspace file')
      }
    } catch (error) {
      problems.push({ path, message: error instanceof Error ? error.message : String(error) })
    }
  }

  for (const [path, kind] of Object.entries(SINGLE_FILES)) {
    if (!(path in files)) problems.push({ path, message: `missing (every workspace has a ${kind} file)` })
  }
  if (problems.length > 0) throw new WorkspaceLoadError(problems)

  return { ...(single as Pick<WorkspaceState, (typeof SINGLE_FILES)[keyof typeof SINGLE_FILES]>), ...state }
}

// ─── State → files ──────────────────────────────────────────────────────────

/** The current content of one path, or null if the state holds nothing there. */
export function fileContent(state: WorkspaceState, path: string): string | null {
  let m: RegExpExecArray | null
  if (path in SINGLE_FILES) {
    const kind = SINGLE_FILES[path as keyof typeof SINGLE_FILES]
    return serializeFile(kind, state[kind] as never)
  }
  if ((m = FOCUS_RE.exec(path))) {
    const week = state.focusWeeks[m[1] as string]
    return week ? serializeFile('focusWeek', week) : null
  }
  if ((m = PROJECT_RE.exec(path))) {
    const project = state.projects[m[1] as string]
    return project ? serializeFile('project', project) : null
  }
  if ((m = SPRINT_RE.exec(path))) {
    const sprint = state.sprints[Number(m[1])]
    return sprint ? serializeFile('sprint', sprint) : null
  }
  if ((m = REFERENCE_RE.exec(path))) {
    return state.references[m[1] as string] ?? null
  }
  if (MEETING_RE.test(path)) {
    const meeting = state.meetings[path]
    return meeting ? serializeMeetingFile(meeting) : null
  }
  throw new Error(`Not a workspace state path: ${path}`)
}

/** Every file the state holds, ready to write. */
export function filesFromState(state: WorkspaceState): Record<string, string> {
  const paths = [
    ...Object.keys(SINGLE_FILES),
    ...Object.keys(state.focusWeeks).map(weekOf => pathFor('focusWeek', { weekOf })),
    ...Object.keys(state.projects).map(slug => pathFor('project', { slug })),
    ...Object.keys(state.sprints).map(n => pathFor('sprint', { n: Number(n) })),
    ...Object.keys(state.references).map(name => `references/${name}.md`),
    ...Object.keys(state.meetings),
  ]
  return Object.fromEntries(paths.map(path => [path, fileContent(state, path) as string]))
}

/** The new content of each changed path; null means delete the file. */
export function changedFiles(state: WorkspaceState, paths: readonly string[]): Record<string, string | null> {
  return Object.fromEntries(paths.map(path => [path, fileContent(state, path)]))
}

/** A brand-new workspace: the settings given, and every other file empty. */
export function emptyState(workspace: WorkspaceFile, at: Instant): WorkspaceState {
  return {
    workspace: parseFile('workspace', workspace),
    profile: parseFile('profile', {
      schemaVersion: CURRENT_VERSION.profile, updatedAt: at, me: '', preferences: '', productivitySystem: '', responsibilities: [],
    }),
    tasks: parseFile('tasks', { schemaVersion: CURRENT_VERSION.tasks, nextKey: { A: 1, B: 1 }, tasks: [] }),
    keepInMind: parseFile('keepInMind', { schemaVersion: CURRENT_VERSION.keepInMind, updatedAt: at, items: [] }),
    people: parseFile('people', { schemaVersion: CURRENT_VERSION.people, updatedAt: at, people: [] }),
    glossary: parseFile('glossary', { schemaVersion: CURRENT_VERSION.glossary, terms: [] }),
    focusWeeks: {},
    projects: {},
    sprints: {},
    references: {},
    meetings: {},
  }
}

/** The file path of a focus week (exported for engine and storage alike). */
export const focusPath = (weekOf: IsoDate | string): string => pathFor('focusWeek', { weekOf })
export const projectPath = (slug: string): string => pathFor('project', { slug })
export const sprintPath = (n: number): string => pathFor('sprint', { n })
export const referencePath = (name: string): string => `references/${name}.md`
