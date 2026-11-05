/**
 * context.ts — what an op handler sees, and the lookups every handler shares.
 *
 * Handlers mutate an immer draft of the workspace. A handler that cannot do
 * what it was asked throws OpFailure; the engine catches it, discards the
 * draft (so the whole batch applies or none of it does) and reports the
 * failure against the op's index.
 */

import type { Draft } from 'immer'
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import { addDays, mondayOf, type SprintCadence } from '../dates.ts'
import type { FileData } from '../files.ts'
import { CURRENT_VERSION } from '../kinds.ts'
import type { Instant, IsoDate, TaskKey, Ulid } from '../primitives.ts'
import type { StatusCategory } from '../schemas/workspace.ts'
import type { Task } from '../schemas/tasks.ts'
import { focusPath, type FocusWeek, type WorkspaceState } from '../state.ts'

export type Actor = 'app' | 'claude' | 'bot' | 'import'
export type OpErrorCode = 'not-found' | 'invalid' | 'conflict' | 'policy'

/** Thrown by a handler; becomes an OpError on the op that threw it. */
export class OpFailure extends Error {
  readonly code: OpErrorCode
  readonly available?: string[]
  constructor(code: OpErrorCode, message: string, available?: string[]) {
    super(message)
    this.name = 'OpFailure'
    this.code = code
    if (available) this.available = available
  }
}

export interface Warning {
  /** The op that caused it, or null for a batch-level warning. */
  index: number | null
  code: string
  message: string
}

type ActivityEntry = FileData<'activityEntry'>

export interface OpContext {
  readonly state: Draft<WorkspaceState>
  readonly at: Instant
  /** The workspace-local date at `at`. */
  readonly today: IsoDate
  readonly actor: Actor
  readonly opId: string
  /** `$n` → the key allocated to the task.add that declared it. */
  readonly keyMap: ReadonlyMap<string, TaskKey>
  /** op index → the key pre-allocated for that task.add. */
  readonly addKeys: ReadonlyMap<number, TaskKey>
  /** Index of the op being applied. */
  index: number
  touch(path: string): void
  remove(path: string): void
  warn(code: string, message: string): void
  summary(text: string): void
  event(delta: string, keys: TaskKey[]): void
}

/** The parts of OpContext the engine owns; handlers never build one. */
export interface ContextRecorder {
  changed: Set<string>
  deleted: Set<string>
  warnings: Warning[]
  summary: { index: number; text: string }[]
  activity: ActivityEntry[]
}

export function createContext(
  init: Omit<OpContext, 'touch' | 'remove' | 'warn' | 'summary' | 'event' | 'index'>,
  recorder: ContextRecorder,
  nextEventId: () => Ulid,
): OpContext {
  const ctx: OpContext = {
    ...init,
    index: 0,
    touch(path) {
      recorder.deleted.delete(path)
      recorder.changed.add(path)
    },
    remove(path) {
      recorder.changed.delete(path)
      recorder.deleted.add(path)
    },
    warn(code, message) {
      recorder.warnings.push({ index: ctx.index, code, message })
    },
    summary(text) {
      recorder.summary.push({ index: ctx.index, text })
    },
    event(delta, keys) {
      recorder.activity.push({
        schemaVersion: CURRENT_VERSION.activityEntry,
        id: nextEventId(),
        at: init.at,
        date: init.today,
        actor: init.actor,
        type: 'event',
        area: null,
        delta: delta.length > 200 ? `${delta.slice(0, 199)}…` : delta,
        pointers: [],
        keys,
        opId: init.opId,
      })
    },
  }
  return ctx
}

// ─── Text normalisation ─────────────────────────────────────────────────────

/** `#Monthly Report` → `monthly-report`. Used for tags, areas and section ids. */
export function slugify(value: string): string {
  return value
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const LIST_LIMIT = 40
const list = (values: Iterable<string>): string[] => [...values].slice(0, LIST_LIMIT)

// ─── Workspace vocabulary ───────────────────────────────────────────────────

export function statusById(ctx: OpContext, id: string) {
  const status = ctx.state.workspace.statuses.find(s => s.id === id)
  if (!status) {
    throw new OpFailure('not-found', `No status "${id}"`, ctx.state.workspace.statuses.map(s => s.id))
  }
  return status
}

export function firstStatus(ctx: OpContext, category: StatusCategory) {
  const status = ctx.state.workspace.statuses.find(s => s.category === category)
  if (!status) throw new OpFailure('invalid', `The workspace has no status in the "${category}" category`)
  return status
}

/** Normalise tag ids, adding any the workspace does not know yet (and saying so). */
export function ensureTags(ctx: OpContext, tags: readonly string[]): string[] {
  const ids = [...new Set(tags.map(slugify).filter(t => t !== ''))]
  for (const id of ids) {
    if (!ctx.state.workspace.tags.some(t => t.id === id)) {
      ctx.state.workspace.tags.push({ id, label: null })
      ctx.touch('workspace.json')
      ctx.warn('new-tag', `New tag "${id}" added to the workspace`)
    }
  }
  return ids
}

/** Normalise an activity area id, adding it to the workspace if new. */
export function ensureArea(ctx: OpContext, area: string): string {
  const id = slugify(area)
  if (id === '') throw new OpFailure('invalid', `"${area}" is not a usable area name`)
  if (!ctx.state.workspace.areas.some(a => a.id === id)) {
    ctx.state.workspace.areas.push({ id, label: area.trim().replace(/^#/, '') })
    ctx.touch('workspace.json')
    ctx.warn('new-area', `New activity area "${id}" added to the workspace`)
  }
  return id
}

// ─── Tasks and keys ─────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /^\$[1-9]\d*$/

function placeholder(ctx: OpContext, ref: string): string {
  if (!PLACEHOLDER_RE.test(ref)) return ref
  const key = ctx.keyMap.get(ref)
  if (!key) {
    const defined = [...ctx.keyMap.keys()]
    throw new OpFailure('not-found', `${ref} is not defined in this batch`, defined)
  }
  return key
}

function archivedTask(ctx: OpContext, ref: string): { task: Draft<Task>; sprint: number } | null {
  for (const sprint of Object.values(ctx.state.sprints)) {
    const task = [...sprint.done, ...sprint.dropped].find(t => t.key === ref || t.legacyIds.includes(ref))
    if (task) return { task, sprint: sprint.n }
  }
  return null
}

/** An open task by key, legacy id or `$n` placeholder. */
export function resolveTask(ctx: OpContext, ref: string): Draft<Task> {
  const wanted = placeholder(ctx, ref)
  const tasks = ctx.state.tasks.tasks
  const task = tasks.find(t => t.key === wanted) ?? tasks.find(t => t.legacyIds.includes(wanted))
  if (task) return task
  const archived = archivedTask(ctx, wanted)
  if (archived) {
    throw new OpFailure('conflict', `${archived.task.key} was archived when sprint ${archived.sprint} closed and can no longer change`)
  }
  throw new OpFailure('not-found', `No open task "${ref}"`, list(tasks.map(t => t.key)))
}

/** Task keys for a list of references; archived tasks are valid references. */
export function resolveKeys(ctx: OpContext, refs: readonly string[] | undefined): TaskKey[] {
  if (!refs) return []
  const keys = refs.map(ref => {
    // A placeholder may name a task added later in this batch; the
    // cross-file check at the end confirms it exists.
    if (PLACEHOLDER_RE.test(ref)) return placeholder(ctx, ref) as TaskKey
    const wanted = ref
    const open = ctx.state.tasks.tasks.find(t => t.key === wanted || t.legacyIds.includes(wanted))
    if (open) return open.key
    const archived = archivedTask(ctx, wanted)
    if (archived) return archived.task.key
    throw new OpFailure('not-found', `No task "${ref}"`, list(ctx.state.tasks.tasks.map(t => t.key)))
  })
  return [...new Set(keys)]
}

export function categoryOf(ctx: OpContext, task: Pick<Task, 'status'>): StatusCategory {
  return statusById(ctx, task.status).category
}

export const isClosedCategory = (c: StatusCategory): boolean => c === 'done' || c === 'dropped'

/**
 * Give `task` an order key that puts it in `status`: at the end when `after`
 * is undefined, first when null, otherwise directly after that task. A column
 * is ordered by `order`, then key; tied orders are re-spread first.
 */
export function place(ctx: OpContext, task: Draft<Task>, status: string, after: string | null | undefined): void {
  const column = ctx.state.tasks.tasks
    .filter(t => t.status === status && t.id !== task.id)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.key.localeCompare(b.key)))

  const bounds = (): [string | null, string | null] => {
    if (after === undefined) return [column.at(-1)?.order ?? null, null]
    if (after === null) return [null, column[0]?.order ?? null]
    const afterKey = placeholder(ctx, after)
    const i = column.findIndex(t => t.key === afterKey || t.legacyIds.includes(afterKey))
    if (i < 0) {
      throw new OpFailure('not-found', `Cannot place after "${after}": it is not in "${status}"`, list(column.map(t => t.key)))
    }
    return [column[i]?.order ?? null, column[i + 1]?.order ?? null]
  }

  // Tied orders (e.g. imported data) make "after X" ambiguous: re-spread the
  // column in its canonical order (order, then key) before placing.
  if (new Set(column.map(t => t.order)).size !== column.length) {
    const fresh = generateNKeysBetween(null, null, column.length)
    column.forEach((t, i) => { t.order = fresh[i] as string })
  }
  const [lo, hi] = bounds()
  task.order = generateKeyBetween(lo, hi)
}

// ─── Focus weeks ────────────────────────────────────────────────────────────

/** The week starting `weekOf`, created empty if this is its first change. */
export function focusWeek(ctx: OpContext, weekOf: IsoDate): Draft<FocusWeek> {
  if (mondayOf(weekOf) !== weekOf) {
    throw new OpFailure('invalid', `${weekOf} is not a Monday; focus weeks start on Monday (that week starts ${mondayOf(weekOf)})`)
  }
  let week = ctx.state.focusWeeks[weekOf]
  if (!week) {
    week = {
      schemaVersion: CURRENT_VERSION.focusWeek,
      weekOf,
      updatedAt: ctx.at,
      scheduleCapturedAt: null,
      schedule: [],
      days: [],
      callouts: [],
      priorities: [],
      lastWeek: [],
      sections: [],
    }
    ctx.state.focusWeeks[weekOf] = week
    week = ctx.state.focusWeeks[weekOf]
  }
  week.updatedAt = ctx.at
  ctx.touch(focusPath(weekOf))
  return week
}

/** The day `date` in its week, created empty if needed. Days stay in date order. */
export function focusDay(ctx: OpContext, date: IsoDate) {
  const week = focusWeek(ctx, mondayOf(date))
  let day = week.days.find(d => d.date === date)
  if (!day) {
    week.days.push({ date, plan: [], outcomes: [], closedAt: null, note: null })
    week.days.sort((a, b) => a.date.localeCompare(b.date))
    day = week.days.find(d => d.date === date)
  }
  return day as NonNullable<typeof day>
}

// ─── Sprints ────────────────────────────────────────────────────────────────

export function cadenceOf(ctx: OpContext): SprintCadence {
  const sprint = ctx.state.workspace.sprint
  if (!sprint) throw new OpFailure('invalid', 'This workspace has no sprint cadence; set workspace.sprint first')
  return { anchor: sprint.anchor, anchorNumber: sprint.anchorNumber, lengthWeeks: sprint.lengthWeeks }
}

export function sprintBounds(cadence: SprintCadence, n: number): { start: IsoDate; end: IsoDate } {
  const length = 7 * cadence.lengthWeeks
  const start = addDays(cadence.anchor, (n - cadence.anchorNumber) * length)
  return { start, end: addDays(start, length - 1) }
}

/** Fill missing ids on a list of items. */
export function withIds<T extends { id?: string | undefined }>(items: readonly T[] | undefined, newId: () => Ulid): (T & { id: string })[] | undefined {
  return items?.map(item => ({ ...item, id: item.id ?? newId() }))
}
