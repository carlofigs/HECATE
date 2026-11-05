/**
 * hooks.ts — GitHub's push webhook for the data repository.
 *
 * A push someone else made (a Claude session with git access, a hand edit)
 * reaches the Durable Objects of the workspaces it touched within seconds,
 * instead of waiting for a stale read. The signature is checked over the raw
 * body before anything is parsed.
 */

import { verifyWebhookSignature } from '@hecate/github-store'
import type { WorkspaceList } from '../workspaces.ts'
import type { WorkspaceRpc } from './workspace-rpc.ts'

export interface HookDeps {
  secret: string | null
  owner: string
  repo: string
  branch: string
  workspaces: WorkspaceList
  workspace: (dir: string) => WorkspaceRpc
  waitUntil: (promise: Promise<unknown>) => void
}

interface PushPayload {
  ref?: unknown
  repository?: { full_name?: unknown }
  commits?: { added?: unknown; modified?: unknown; removed?: unknown }[]
}

/** GitHub lists at most 20 commits in a push payload; beyond that, assume anything changed. */
const MAX_LISTED_COMMITS = 20

/** The top-level directories a push touched, or 'all' when the payload does not say. */
export function touchedDirs(payload: PushPayload): string[] | 'all' {
  const commits = payload.commits
  if (!Array.isArray(commits) || commits.length === 0 || commits.length >= MAX_LISTED_COMMITS) return 'all'
  const dirs = new Set<string>()
  for (const commit of commits) {
    for (const list of [commit.added, commit.modified, commit.removed]) {
      if (!Array.isArray(list)) return 'all'
      for (const path of list) {
        if (typeof path !== 'string') return 'all'
        const slash = path.indexOf('/')
        if (slash > 0) dirs.add(path.slice(0, slash))
      }
    }
  }
  return [...dirs].sort()
}

const json = (body: unknown, status: number): Response => Response.json(body, { status })

export async function githubHook(request: Request, deps: HookDeps): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!deps.secret) return json({ error: 'Webhook not configured' }, 503)
  const body = await request.text()
  if (!(await verifyWebhookSignature(deps.secret, body, request.headers.get('x-hub-signature-256')))) return json({ error: 'Bad signature' }, 401)

  const event = request.headers.get('x-github-event')
  if (event === 'ping') return json({ ok: true }, 200)
  if (event !== 'push') return json({ ignored: event }, 202)
  let payload: PushPayload
  try {
    payload = JSON.parse(body) as PushPayload
  } catch {
    return json({ error: 'Expected JSON' }, 400)
  }
  const repo = typeof payload.repository?.full_name === 'string' ? payload.repository.full_name.toLowerCase() : ''
  if (payload.ref !== `refs/heads/${deps.branch}` || repo !== `${deps.owner}/${deps.repo}`.toLowerCase()) {
    return json({ ignored: 'another branch or repository' }, 202)
  }

  const touched = touchedDirs(payload)
  const known = (await deps.workspaces.get({ fresh: true })).map(w => w.dir)
  const targets = touched === 'all' ? known : known.filter(dir => touched.includes(dir))
  deps.waitUntil(Promise.allSettled(targets.map(dir => deps.workspace(dir).refresh(dir))))
  return json({ refreshing: targets }, 202)
}
