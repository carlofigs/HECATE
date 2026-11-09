/**
 * The Worker's web API (apps/worker/src/routes/api.ts). The session is an
 * httpOnly cookie the browser sends on its own: nothing here ever holds a
 * token (ADR 0003). Every call returns an outcome; none throws.
 */
import type { WorkspaceState } from '@hecate/core'

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
}

export type Outcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'signed-out' }
  | { kind: 'not-found'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'network' }
  | { kind: 'unexpected'; status: number; message: string }

export type Failure = Exclude<Outcome<unknown>, { kind: 'ok' }>

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
            }
          : null,
      ),

    signOut: () => call<null>(fetcher, '/auth/logout', { method: 'POST' }, () => null),
  }
}

export type Api = ReturnType<typeof createApi>
