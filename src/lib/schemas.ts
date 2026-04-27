/**
 * HECATE — TypeScript schema definitions
 *
 * These interfaces are the single contract between the JSON data layer (data/*.json),
 * the Zustand store, and all React components. Every field maps 1:1 to SCHEMA.md.
 *
 * Naming conventions:
 * - Nullable fields are typed `T | null`
 * - Markdown content fields are typed `string` (rendered at display time)
 * - ISO date strings: "YYYY-MM-DD" for date-only, full ISO for timestamps
 */

// ─── tasks.json ────────────────────────────────────────────────────────────────

export interface TasksData {
  columns: Column[]
}

/**
 * Semantic role of a column — used by Archive and Week Log to identify
 * which tasks to snapshot. Configured in Settings → Column Types.
 * null = unassigned (column is ignored by automated actions).
 */
export type ColumnType = 'backlog' | 'in-progress' | 'done' | 'not-doing' | null

export interface Column {
  id: string
  name: string
  columnType?: ColumnType   // optional — absent = null = unassigned
  tasks: Task[]
}

export type Priority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  note: string | null
  tags: string[]
  priority: Priority | null
  blockedSince: string | null   // "YYYY-MM-DD" | null
  createdAt: string             // ISO timestamp
  updatedAt: string             // ISO timestamp
}

// ─── focus.json ────────────────────────────────────────────────────────────────

export interface FocusData {
  weekOf: string                // "YYYY-MM-DD" — Monday of the week
  sprintLabel: string           // e.g. "Sprint 19 / Jira Sprint 21"
  updatedAt: string             // ISO timestamp
  sections: FocusSection[]
}

export interface FocusSection {
  id: string                    // kebab-case, e.g. "today", "waiting-on"
  title: string
  content: string               // markdown
}

// ─── projects.json ─────────────────────────────────────────────────────────────

export interface ProjectsData {
  projects: Project[]
}

export type ProjectStatus =
  | 'active'
  | 'in-progress'
  | 'paused'
  | 'completed'
  | 'planned'
  | 'blocked'

export interface Project {
  id: string                    // "p-{kebab-name}"
  name: string
  subtitle: string | null
  summary: string | null        // markdown paragraph shown below subtitle
  status: ProjectStatus
  phase: string | null
  currentFocus: string | null
  nextAction: string | null
  jira: string | null
  branch: string | null
  tag: string                   // links to tasks; no "#" prefix
  owner: string
  updatedAt: string             // "YYYY-MM-DD"
  timeline: TimelineEntry[]
  openQuestions: OpenQuestion[]
  models: Model[] | null
  sections: ProjectSection[]
}

export type TimelineStatus = 'completed' | 'active' | 'pending' | 'deferred'

export interface TimelineEntry {
  phase: string
  start: string | null          // "YYYY-MM-DD"
  end: string | null            // "YYYY-MM-DD" | null (null = ongoing)
  status: TimelineStatus
}

export interface OpenQuestion {
  id: string                    // "oq-{number}"
  question: string
  blocker: boolean
  status: 'open' | 'resolved' | 'deferred'
  resolution: string | null
}

export interface Model {
  name: string
  layer: string                 // "staging" | "intermediate" | "mart"
  materialisationDev: string
  materialisationProd: string
  status: string                // free-text, e.g. "Done", "Skeleton — blocked OQ-03"
}

export interface ProjectSection {
  id: string
  title: string
  content: string               // markdown
}

// ─── weekly_log.json ───────────────────────────────────────────────────────────

export interface WeeklyLogData {
  weeks: WeekEntry[]
}

export interface WeekEntry {
  weekOf: string                // "YYYY-MM-DD"
  dateRange: string             // Human-readable, e.g. "23 Mar – 27 Mar 2026"
  generatedAt: string           // ISO timestamp when Generate Week ran
  updatedAt: string             // ISO timestamp of last edit
  completed: TaskSnapshot[]
  carriedForward: TaskSnapshot[]
  delayed: TaskSnapshot[]
  nextWeek: string[]            // markdown strings
  narrative: Narrative
}

export interface TaskSnapshot {
  id: string | null
  title: string
  note: string | null
  tags: string[]
}

export interface Narrative {
  meetingsAndDiscussions: string  // markdown
  decisionsMade: string           // markdown
  frustrations: string            // markdown
  oneOnOnePrep: OneOnOnePrep
}

export interface OneOnOnePrep {
  people: string[]                          // configurable list
  sections: Record<string, string>          // person name → markdown content
}

// ─── archive.json ──────────────────────────────────────────────────────────────

export interface ArchiveData {
  weeks: ArchiveWeek[]
}

export interface ArchiveWeek {
  weekOf: string                // "YYYY-MM-DD"
  archivedAt: string            // ISO timestamp
  done: ArchivedTask[]
  notDoing: ArchivedTask[]
}

export interface ArchivedTask {
  id: string | null
  title: string
  note: string | null
  tags: string[]
  originalColumn: string
}

// ─── memory.json ───────────────────────────────────────────────────────────────

export interface MemoryData {
  updatedAt: string
  me: string                    // markdown
  people: Person[]
  terms: Term[]
  projects: ProjectSummary[]
  recurringResponsibilities: Responsibility[]
  preferences: string           // markdown
  productivitySystem: string    // markdown
  referenceFiles: Record<string, string>  // relative path → full markdown content
}

export interface Person {
  name: string
  aliases: string[]
  role: string
  notes: string | null          // markdown
}

export interface Term {
  term: string
  meaning: string               // markdown
}

export interface ProjectSummary {
  name: string
  summary: string               // markdown
}

export interface Responsibility {
  name: string
  cadence: string               // "Weekly" | "Monthly" | "As needed" | etc.
  notes: string                 // markdown
}

// ─── settings.json ─────────────────────────────────────────────────────────────

export interface SettingsData {
  oneOnOnePeople: string[]
  defaultView: 'board' | 'list'
  autoSaveDebounceMs: number
  pollIntervalMs: number
  theme: 'dark' | 'light'
}

// ─── Store utility types ────────────────────────────────────────────────────────

export type DataFileName =
  | 'tasks'
  | 'focus'
  | 'projects'
  | 'weekly_log'
  | 'archive'
  | 'memory'
  | 'settings'

export type DataFileContent =
  | TasksData
  | FocusData
  | ProjectsData
  | WeeklyLogData
  | ArchiveData
  | MemoryData
  | SettingsData

/** Per-file state slice shape used by the Zustand data store */
export interface FileSlice<T> {
  data: T | null
  sha: string | null
  dirty: boolean
  loading: boolean
  error: string | null
}

/** GitHub credentials stored in localStorage */
export interface GitHubCredentials {
  token: string
  owner: string
  repo: string
}
