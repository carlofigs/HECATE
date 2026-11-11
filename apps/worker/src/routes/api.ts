/**
 * api.ts — the web app's API (ADR 0003): a session cookie, never a token in
 * JavaScript. Writes must come from the app's own origin (SameSite=Strict
 * plus an Origin check), and every write goes to the workspace's Durable
 * Object as ops with actor `app`. The live socket is a read, but it is checked
 * the same way: a cross-site page must never hold one open (ADR 0003).
 */

import { APP_CURSOR, type ApplyOutcome } from '../engine.ts'
import type { AuthSettings } from '../auth/config.ts'
import { SESSION_COOKIE, readCookie, verifyToken, type Session } from '../auth/session.ts'
import type { WorkspaceList } from '../workspaces.ts'
import type { WorkspaceRpc } from './workspace-rpc.ts'

export interface ApiDeps {
  settings: AuthSettings
  workspaces: WorkspaceList
  workspace: (dir: string) => WorkspaceRpc
  /** DEFAULT_WORKSPACE: the one the app opens first. */
  defaultWorkspace?: string | null
  now?: () => number
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const STATUS: Record<ApplyOutcome['status'], number> = {
  applied: 200, 'dry-run': 200, rejected: 422, invalid: 400, 'version-conflict': 409, unavailable: 503,
}

async function sessionFrom(request: Request, settings: AuthSettings, now: number): Promise<Session | null> {
  const session = await verifyToken<Session>(readCookie(request, SESSION_COOKIE), settings.authSecret, 'session', now)
  return session && session.sub === settings.allowedUserId ? session : null
}

export async function handleApi(request: Request, deps: ApiDeps): Promise<Response> {
  const { settings } = deps
  const session = await sessionFrom(request, settings, (deps.now ?? Date.now)())
  if (!session) return json({ error: 'Not signed in', signIn: '/auth/login' }, 401)
  const write = request.method !== 'GET' && request.method !== 'HEAD'
  if (write && request.headers.get('origin') !== settings.origin) return json({ error: 'Cross-origin request refused' }, 403)

  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  if (path === '/api/me' && !write) return json({ userId: session.sub, login: session.login })
  if (path === '/api/workspaces' && !write) return json({ workspaces: await deps.workspaces.get(), default: deps.defaultWorkspace ?? null })

  const m = /^\/api\/workspaces\/([^/]+)(\/ops|\/flush|\/activity|\/activity\/ack|\/live)?$/.exec(path)
  if (!m) return json({ error: 'Not found' }, 404)
  const live = m[2] === '/live' && !write
  if (live && request.headers.get('origin') !== settings.origin) return json({ error: 'Cross-origin request refused' }, 403)
  if (live && request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected a WebSocket upgrade' }, 426)
  const dir = decodeURIComponent(m[1] as string)
  if (!(await deps.workspaces.has(dir))) return json({ error: `No workspace "${dir}"` }, 404)
  const workspace = deps.workspace(dir)

  if (!m[2] && !write) {
    const snapshot = await workspace.snapshot(dir)
    return json(snapshot, snapshot.status === 'ok' ? 200 : 503)
  }
  if (live) {
    // The socket carries only { version, pending, unread }; the data still comes through the snapshot above.
    const target = `https://workspace.internal/live?dir=${encodeURIComponent(dir)}&exp=${session.exp}`
    return workspace.fetch(new Request(target, { headers: { upgrade: 'websocket' } }))
  }
  if (m[2] === '/flush' && request.method === 'POST') return json(await workspace.flush(dir))
  // The app's own activity reader (ADR 0002): the same cursor mechanics as MCP's ack_activity, under the name `app`.
  if (m[2] === '/activity' && !write) {
    const params = new URL(request.url).searchParams
    const limit = Number.parseInt(params.get('limit') ?? '', 10)
    const before = params.get('before')
    const outcome = await workspace.read(dir, {
      kind: 'feed', cursor: APP_CURSOR, ...(Number.isFinite(limit) ? { limit } : {}), ...(before ? { before } : {}),
    })
    if (outcome.status === 'ok') return json({ version: outcome.version, ...outcome.data })
    return json({ error: outcome.message }, outcome.status === 'not-found' ? 404 : 503)
  }
  if (m[2] === '/activity/ack' && request.method === 'POST') {
    let body: { upTo?: unknown } = {}
    try {
      const parsed: unknown = await request.json()
      if (parsed && typeof parsed === 'object') body = parsed
    } catch {
      // No body: acknowledge everything.
    }
    const outcome = await workspace.ackActivity(dir, APP_CURSOR, typeof body.upTo === 'string' ? body.upTo : undefined)
    if (outcome.status === 'ok') return json(outcome)
    return json({ error: outcome.message }, outcome.status === 'not-found' ? 404 : 503)
  }
  if (m[2] === '/ops' && request.method === 'POST') {
    let body: { ops?: unknown; opId?: unknown; dryRun?: unknown; ifVersion?: unknown }
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Expected a JSON body' }, 400)
    }
    if (!Array.isArray(body.ops)) return json({ error: 'Expected { ops: [...] }' }, 400)
    const outcome = await workspace.apply(dir, {
      ops: body.ops as unknown[],
      actor: 'app',
      ...(typeof body.opId === 'string' ? { opId: body.opId } : {}),
      ...(body.dryRun === true ? { dryRun: true } : {}),
      ...(typeof body.ifVersion === 'number' ? { ifVersion: body.ifVersion } : {}),
    })
    return json(outcome, STATUS[outcome.status])
  }
  return json({ error: 'Method not allowed' }, 405)
}
