/**
 * The Worker's web API (apps/worker/src/routes/api.ts). The session is an
 * httpOnly cookie the browser sends on its own: nothing here ever holds a
 * token (ADR 0003). Every call returns an outcome; none throws.
 */
import type { FileData, WorkspaceState } from '@hecate/core'

export interface Me {
  userId: number
  login: string
}

interface WorkspaceEntry {
  dir: string
  hidden: boolean
  name: string | null
  policy: 'open' | 'sanitised' | null
}

export interface WorkspaceList {
  workspaces: WorkspaceEntry[]
  /** The Worker's DEFAULT_WORKSPACE, if set. */
  default: string | null
}

export interface Snapshot {
  version: number
  state: WorkspaceState
  /** Changes applied but not yet committed to git. */
  pending: number
  /** The last failure to load or commit, if it has not cleared. */
  lastError: { at: number; message: string } | null
  /** How many activity entries are new to the app's reader (ADR 0002). */
  activity?: { unread: number }
}

export type ActivityEntry = FileData<'activityEntry'>

/** A page of the activity log, newest first, with the app's read marker. */
export interface ActivityPage {
  entries: ActivityEntry[]
  /** New to the app: after its marker and not written by the app. */
  unread: number
  /** Older entries remain. */
  more: boolean
  cursor: { at: string; id: string } | null
}

export type Outcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'signed-out' }
  | { kind: 'not-found'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'network' }
  | { kind: 'unexpected'; status: number; message: string }

export type Failure = Exclude<Outcome<unknown>, { kind: 'ok' }>

/** What the Worker did with a batch of ops (apps/worker/src/engine.ts ApplyOutcome). */
export type ApplyAnswer =
  | { kind: 'applied'; version: number; keyMap: Record<string, string>; duplicate: boolean }
  /** The batch was refused as a whole (an op failed, or the input was invalid): nothing changed. */
  | { kind: 'rejected'; message: string }
  | { kind: 'signed-out' }
  | { kind: 'network' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'unexpected'; status: number; message: string }

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const messageOf = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof body.message === 'string') return body.message
    if (typeof body.error === 'string') return body.error
  } catch {
    // Not JSON: fall through to the status text.
  }
  return response.statusText || `HTTP ${response.status}`
}

async function call<T>(fetcher: Fetch, path: string, init: RequestInit, parse: (body: unknown) => T | null): Promise<Outcome<T>> {
  let response: Response
  try {
    response = await fetcher(path, { credentials: 'same-origin', headers: { accept: 'application/json' }, ...init })
  } catch {
    return { kind: 'network' }
  }
  if (response.status === 401) return { kind: 'signed-out' }
  if (response.status === 404) return { kind: 'not-found', message: await messageOf(response) }
  if (response.status === 503) return { kind: 'unavailable', message: await messageOf(response) }
  if (!response.ok) return { kind: 'unexpected', status: response.status, message: await messageOf(response) }
  if (response.status === 204) return { kind: 'ok', data: parse(null) as T }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { kind: 'unexpected', status: response.status, message: 'The response was not JSON' }
  }
  const data = parse(body)
  return data === null ? { kind: 'unexpected', status: response.status, message: 'The response had an unexpected shape' } : { kind: 'ok', data }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function createApi(fetcher: Fetch = (input, init) => fetch(input, init)) {
  return {
    me: () => call<Me>(fetcher, '/api/me', {}, b => (isObject(b) && typeof b.login === 'string' ? (b as unknown as Me) : null)),

    workspaces: () =>
      call<WorkspaceList>(fetcher, '/api/workspaces', {}, b =>
        isObject(b) && Array.isArray(b.workspaces)
          ? { workspaces: b.workspaces as WorkspaceEntry[], default: typeof b.default === 'string' ? b.default : null }
          : null,
      ),

    snapshot: (dir: string) =>
      call<Snapshot>(fetcher, `/api/workspaces/${encodeURIComponent(dir)}`, {}, b =>
        isObject(b) && b.status === 'ok' && typeof b.version === 'number' && isObject(b.state)
          ? {
              version: b.version,
              state: b.state as unknown as WorkspaceState,
              pending: typeof b.pending === 'number' ? b.pending : 0,
              lastError: isObject(b.lastError) ? (b.lastError as Snapshot['lastError']) : null,
              ...(isObject(b.activity) && typeof b.activity.unread === 'number' ? { activity: { unread: b.activity.unread } } : {}),
            }
          : null,
      ),

    /** One page of the activity log (the app's reader), newest first; `before` an entry id for older ones. */
    activity: (dir: string, options: { before?: string; limit?: number } = {}) => {
      const params = new URLSearchParams()
      if (options.before) params.set('before', options.before)
      if (options.limit) params.set('limit', String(options.limit))
      const query = params.size > 0 ? `?${params.toString()}` : ''
      return call<ActivityPage>(fetcher, `/api/workspaces/${encodeURIComponent(dir)}/activity${query}`, {}, b =>
        isObject(b) && Array.isArray(b.entries) && typeof b.unread === 'number'
          ? {
              entries: b.entries as ActivityEntry[],
              unread: b.unread,
              more: b.more === true,
              cursor: isObject(b.cursor) ? (b.cursor as ActivityPage['cursor']) : null,
            }
          : null,
      )
    },

    /** Moves the app's read marker to the newest entry, or to `upTo`. */
    ackActivity: (dir: string, upTo?: string) =>
      call<{ acknowledged: number }>(
        fetcher,
        `/api/workspaces/${encodeURIComponent(dir)}/activity/ack`,
        { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(upTo ? { upTo } : {}) },
        b => (isObject(b) && typeof b.acknowledged === 'number' ? { acknowledged: b.acknowledged } : null),
      ),

    signOut: () => call<null>(fetcher, '/auth/logout', { method: 'POST' }, () => null),

    /** Sends one batch (actor `app`). The opId makes a retry of the same batch safe: the Worker answers it once. */
    async applyOps(dir: string, body: { ops: unknown[]; opId: string }): Promise<ApplyAnswer> {
      let response: Response
      try {
        response = await fetcher(`/api/workspaces/${encodeURIComponent(dir)}/ops`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {
        return { kind: 'network' }
      }
      if (response.status === 401) return { kind: 'signed-out' }
      let answer: Record<string, unknown> = {}
      try {
        answer = (await response.json()) as Record<string, unknown>
      } catch {
        // An answer without JSON is judged by its status alone.
      }
      const message = typeof answer.message === 'string' ? answer.message : typeof answer.error === 'string' ? answer.error : response.statusText
      if (response.ok && answer.status === 'applied' && typeof answer.version === 'number') {
        return { kind: 'applied', version: answer.version, keyMap: (answer.keyMap as Record<string, string> | undefined) ?? {}, duplicate: answer.duplicate === true }
      }
      if (response.status === 422 || response.status === 400 || response.status === 409) {
        const errors = Array.isArray(answer.errors) ? (answer.errors as { message?: string }[]).map(e => e.message).filter(Boolean) : []
        return { kind: 'rejected', message: errors.length > 0 ? errors.join('; ') : message }
      }
      if (response.status === 503) return { kind: 'unavailable', message }
      return { kind: 'unexpected', status: response.status, message }
    },
  }
}

export type Api = ReturnType<typeof createApi>
