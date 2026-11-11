/**
 * The activity log as the app shows it, and adding to it. Pure, so the rules
 * are tested without a browser.
 *
 * "New" follows the app's reader (ADR 0002): after its marker, and not written
 * by the app itself, since the person reading made those changes.
 */
import type { IsoDate, WorkspaceState } from '@hecate/core'
import type { ActivityEntry, ActivityPage } from '../api.ts'
import { checkKeys, keysIn, nullable } from '../forms.ts'

export const ACTOR_LABEL: Record<ActivityEntry['actor'], string> = { app: 'You', claude: 'Claude', bot: 'Bot', import: 'Import' }
export const TYPE_LABEL: Record<ActivityEntry['type'], string> = { flag: 'Flag', session: 'Session', event: 'Event' }

/** The longest entry the log takes (core's Delta). */
const DELTA_MAX = 200

export function isNew(entry: ActivityEntry, cursor: ActivityPage['cursor']): boolean {
  if (entry.actor === 'app') return false
  return cursor === null || entry.at > cursor.at || (entry.at === cursor.at && entry.id > cursor.id)
}

/** Entries (newest first) under their workspace-local day, newest day first. */
export function byDay(entries: readonly ActivityEntry[]): { date: IsoDate; entries: ActivityEntry[] }[] {
  const days: { date: IsoDate; entries: ActivityEntry[] }[] = []
  for (const e of entries) {
    const last = days.at(-1)
    if (last?.date === e.date) last.entries.push(e)
    else days.push({ date: e.date, entries: [e] })
  }
  return days
}

/** Entries from several pages, each once, newest first. */
export function merged(...pages: readonly (readonly ActivityEntry[])[]): ActivityEntry[] {
  const seen = new Set<string>()
  return pages
    .flat()
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
}

/** "09:41", in the workspace's time zone. */
export const timeOf = (at: string, timezone: string): string =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(Date.parse(at))

// ─── Adding to the log ──────────────────────────────────────────────────────

export interface LogForm {
  kind: 'flag' | 'session'
  /** An area id from the workspace, or none. */
  area: string
  text: string
  keys: string
}

export type LogErrors = Partial<Record<keyof LogForm, string>>

export const emptyLogForm = (): LogForm => ({ kind: 'flag', area: '', text: '', keys: '' })

export function validateLog(state: WorkspaceState, form: LogForm): LogErrors {
  const errors: LogErrors = {}
  const text = form.text.trim()
  if (!text) errors.text = 'Say what happened, in a line.'
  else if (/[\r\n]/.test(text)) errors.text = 'Keep it to one line.'
  else if (text.length > DELTA_MAX) errors.text = `Shorten it to ${DELTA_MAX} characters or fewer (it has ${text.length}).`
  const keys = checkKeys(state, form.keys)
  if (keys) errors.keys = keys
  if (form.area && !state.workspace.areas.some(a => a.id === form.area)) errors.area = 'Choose an area from the list.'
  return errors
}

/** One activity.log op, as the hecate-log skill sends. */
export const logOps = (form: LogForm): unknown[] => [
  { type: 'activity.log', entry: form.kind, area: nullable(form.area), delta: form.text.trim(), keys: keysIn(form.keys) },
]
