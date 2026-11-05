/**
 * queries.ts — reads the MCP tools ask of a workspace, answered inside its
 * Durable Object from the state already in memory (no state crosses the
 * network). Each answer is markdown for the model plus the same facts as
 * data. Every view comes from @hecate/core, so Claude and the app agree.
 */

import {
  briefing, findTasks, getEntity, IsoDate, mondayOf, parseActivityLog, renderActivity, renderBriefing, renderFocusWeek, renderSearch,
  renderTasks, searchWorkspace, todayIn, type FileData, type TaskFilter, type WorkspaceState,
} from '@hecate/core'

export type ActivityEntry = FileData<'activityEntry'>

/** How far a reader (`claude`, `app`) has read the activity log. */
export interface Cursor {
  at: string
  id: string
}

export type ReadQuery =
  | { kind: 'briefing'; cursor: string }
  | { kind: 'tasks'; filter: TaskFilter; limit?: number }
  | { kind: 'entity'; ref: string }
  | { kind: 'search'; query: string; limit?: number }
  | { kind: 'focus'; date?: string }
  | { kind: 'activity'; cursor: string; limit?: number }

export type QueryResult = { found: true; text: string; data: Record<string, unknown> } | { found: false; message: string }

export const CURSOR_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
const ACTIVITY_FILE = /^activity\/\d{4}-W\d{2}\.jsonl$/

/** Every activity entry in the workspace, oldest first. A log that does not parse is skipped, not fatal. */
export function activityEntries(files: ReadonlyMap<string, string>): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  for (const [path, text] of files) {
    if (!ACTIVITY_FILE.test(path)) continue
    try {
      entries.push(...parseActivityLog(text))
    } catch {
      // A hand-edited log with a bad line must not stop reads; the rest of the log still counts.
    }
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/** Entries the cursor has not reached. */
export const unread = (entries: readonly ActivityEntry[], cursor: Cursor | null): ActivityEntry[] =>
  cursor === null ? [...entries] : entries.filter(e => e.at > cursor.at || (e.at === cursor.at && e.id > cursor.id))

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export function runQuery(state: WorkspaceState, query: ReadQuery, context: { now: number; activity: () => ActivityEntry[]; cursor: Cursor | null }): QueryResult {
  switch (query.kind) {
    case 'briefing': {
      const fresh = unread(context.activity(), context.cursor)
      const b = briefing(state, new Date(context.now), { activity: fresh })
      const note = fresh.length > 0 ? `\n${plural(fresh.length, 'unread activity entry', 'unread activity entries')} (get_activity, then ack_activity).\n` : ''
      return { found: true, text: `${renderBriefing(b)}${note}`, data: { briefing: b, unread: fresh.length } }
    }
    case 'tasks': {
      const result = findTasks(state, query.filter, query.limit ?? 50)
      return { found: true, text: renderTasks(result.tasks, result.total), data: result }
    }
    case 'entity': {
      const entity = getEntity(state, query.ref)
      if (!entity) return { found: false, message: `Nothing matches "${query.ref}". Use a task key (A12), project:<slug>, person:<role>, term:<term>, sprint:<n>, focus:<date>, reference:<name>, profile or keep-in-mind.` }
      return { found: true, text: `\`${entity.ref}\` (${entity.kind})\n\n\`\`\`json\n${JSON.stringify(entity.data, null, 2)}\n\`\`\`\n`, data: { ...entity } }
    }
    case 'search': {
      const result = searchWorkspace(state, query.query, query.limit ?? 20)
      return { found: true, text: renderSearch(result.hits, result.total), data: result }
    }
    case 'focus': {
      const today = todayIn(state.workspace.timezone, new Date(context.now))
      const date = query.date === undefined ? today : IsoDate.safeParse(query.date)
      if (typeof date === 'object' && !date.success) return { found: false, message: `"${query.date}" is not a date (YYYY-MM-DD)` }
      const weekOf = mondayOf(typeof date === 'string' ? date : date.data)
      return { found: true, text: renderFocusWeek(state, weekOf, { today }), data: { weekOf, exists: weekOf in state.focusWeeks } }
    }
    case 'activity': {
      const fresh = unread(context.activity(), context.cursor)
      const limit = Math.max(1, query.limit ?? 50)
      const newest = fresh.slice(-limit).reverse()
      const more = fresh.length > newest.length ? `- … ${fresh.length - newest.length} older unread\n` : ''
      return { found: true, text: `${renderActivity(newest)}${more}`, data: { entries: newest, unread: fresh.length, cursor: query.cursor } }
    }
    default: {
      const never: never = query
      return { found: false, message: `Unknown query ${JSON.stringify(never)}` }
    }
  }
}
