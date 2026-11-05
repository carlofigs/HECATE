/**
 * apply.ts — the one engine every writer goes through (ADR 0004).
 *
 * applyBatch(state, batch) applies a prepared batch to a workspace:
 *
 * - Ops run in order; each sees the effects of the ones before it.
 * - All or nothing: the first op that fails aborts the batch and the state is
 *   untouched. Errors name the op, and lookups list what does exist.
 * - Before reporting success, every changed file is validated against its
 *   schema and the whole workspace against the cross-file checks. The engine
 *   never returns a state a reader would refuse.
 * - Deterministic: the same state and the same prepared batch always give the
 *   same result, including the ids of automatic activity entries. That is what
 *   makes a stored batch safe to replay.
 *
 * A dry run is the same call; the caller simply does not commit the result.
 */

import { produce } from 'immer'
import { allocateKeys } from './keys.ts'
import { batchSchema, type Batch } from './batch.ts'
import { checkWorkspace, findPossibleNames } from './check.ts'
import { todayIn } from './dates.ts'
import type { FileData } from './files.ts'
import type { TaskKey, Ulid } from './primitives.ts'
import { fileContent, type WorkspaceState } from './state.ts'
import { createUlid } from './ulid.ts'
import { createContext, OpFailure, type ContextRecorder, type OpErrorCode, type Warning } from './ops/context.ts'
import { HANDLERS, type Op } from './ops/index.ts'

export interface OpError {
  /** The failing op, or null for a problem with the batch as a whole. */
  index: number | null
  type: Op['type'] | null
  code: OpErrorCode
  message: string
  /** What does exist, when a lookup failed. */
  available?: string[]
}

export interface ApplySuccess {
  ok: true
  state: WorkspaceState
  /** Workspace paths to write (content via changedFiles). */
  changed: string[]
  /** Workspace paths to delete. */
  deleted: string[]
  /** Placeholder → allocated key, e.g. { $1: 'A49' }. */
  keyMap: Record<string, TaskKey>
  /** Entries to append to the activity log (weekly file chosen by each entry's date). */
  activity: FileData<'activityEntry'>[]
  warnings: Warning[]
  /** One readable line per op, for previews and commit messages. */
  summary: { index: number; text: string }[]
}

export interface ApplyFailure {
  ok: false
  errors: OpError[]
}

export type ApplyResult = ApplySuccess | ApplyFailure

/** FNV-1a over the opId seeds a small PRNG, so automatic entry ids are reproducible. */
function seededRandom(seed: string): (bytes: Uint8Array) => Uint8Array {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  let s = h || 1
  return bytes => {
    for (let i = 0; i < bytes.length; i++) {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      bytes[i] = ((t ^ (t >>> 14)) >>> 0) & 255
    }
    return bytes
  }
}

const PROSE_KEYS = new Set([
  'title', 'note', 'notes', 'lead', 'detail', 'text', 'content', 'delta', 'question', 'resolution', 'meaning',
  'body', 'goal', 'retro', 'summary', 'subtitle', 'currentFocus', 'me', 'preferences', 'productivitySystem', 'what', 'who',
])

function proseOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach(v => proseOf(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && PROSE_KEYS.has(k)) out.push(v)
      else proseOf(v, out)
    }
  }
  return out
}

const failure = (errors: OpError[]): ApplyFailure => ({ ok: false, errors })

export function applyBatch(state: WorkspaceState, input: Batch): ApplyResult {
  const parsed = batchSchema.safeParse(input)
  if (!parsed.success) {
    return failure([{ index: null, type: null, code: 'invalid', message: `Not a prepared batch: ${parsed.error.issues[0]?.message ?? 'invalid'}` }])
  }
  const batch = parsed.data
  const at = Date.parse(batch.at)
  const today = todayIn(state.workspace.timezone, new Date(at))

  // Pre-allocate a key for every task.add, in batch order, so a placeholder
  // can be used by any op in the batch.
  const keyMap = new Map<string, TaskKey>()
  const addKeys = new Map<number, TaskKey>()
  let nextKey = state.tasks.nextKey
  batch.ops.forEach((op, index) => {
    if (op.type !== 'task.add') return
    const allocated = allocateKeys({ nextKey }, op.kind === 'action' ? 'A' : 'B', 1)
    nextKey = allocated.nextKey
    const key = allocated.keys[0] as TaskKey
    addKeys.set(index, key)
    if (op.ref) keyMap.set(op.ref, key)
  })

  const recorder: ContextRecorder = { changed: new Set(), deleted: new Set(), warnings: [], summary: [], activity: [] }
  const nextEventId: () => Ulid = createUlid({ now: () => at, random: seededRandom(batch.opId) })

  let next: WorkspaceState
  let failedAt = 0
  try {
    next = produce(state, draft => {
      const ctx = createContext({ state: draft, at: batch.at, today, actor: batch.actor, opId: batch.opId, keyMap, addKeys }, recorder, nextEventId)
      batch.ops.forEach((op, index) => {
        failedAt = index
        ctx.index = index
        const handler = HANDLERS[op.type] as (o: Op, c: typeof ctx, append: (e: never) => void) => void
        handler(op, ctx, entry => { recorder.activity.push(entry) })
      })
    })
  } catch (error) {
    const op = batch.ops[failedAt]
    if (error instanceof OpFailure) {
      return failure([{
        index: failedAt, type: op?.type ?? null, code: error.code, message: error.message,
        ...(error.available ? { available: error.available } : {}),
      }])
    }
    return failure([{ index: failedAt, type: op?.type ?? null, code: 'invalid', message: error instanceof Error ? error.message : String(error) }])
  }

  // Every changed file must be one a reader accepts…
  const errors: OpError[] = []
  for (const path of recorder.changed) {
    try {
      fileContent(next, path)
    } catch (error) {
      errors.push({ index: null, type: null, code: 'invalid', message: `${path}: ${error instanceof Error ? error.message : String(error)}` })
    }
  }
  // …and the workspace as a whole must hold together.
  for (const issue of checkWorkspace(next)) {
    if (issue.severity === 'error') {
      errors.push({ index: null, type: null, code: issue.code.endsWith('-in-sanitised') ? 'policy' : 'invalid', message: `${issue.path}: ${issue.message}` })
    } else {
      recorder.warnings.push({ index: null, code: issue.code, message: `${issue.path}: ${issue.message}` })
    }
  }
  if (errors.length > 0) return failure(errors)

  if (next.workspace.policy === 'sanitised') {
    batch.ops.forEach((op, index) => {
      for (const name of findPossibleNames(next, proseOf(op))) {
        recorder.warnings.push({ index, code: 'possible-name', message: `"${name}" looks like a person's name; this workspace records roles, not names` })
      }
    })
  }

  return {
    ok: true,
    state: next,
    changed: [...recorder.changed].sort(),
    deleted: [...recorder.deleted].sort(),
    keyMap: Object.fromEntries(keyMap),
    activity: recorder.activity,
    warnings: recorder.warnings,
    summary: recorder.summary,
  }
}
