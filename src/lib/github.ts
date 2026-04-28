/**
 * github.ts — thin wrapper around the GitHub Contents API
 *
 * All operations are unauthenticated-friendly for reads on public repos,
 * but require a fine-grained PAT (Contents: R/W) for writes.
 *
 * Data files live at:  data/{name}.json  in the repo root.
 */

import type { GitHubCredentials } from '@/lib/schemas'
import { CREDENTIALS_STORAGE_KEY } from '@/lib/taskConstants'

const BASE = 'https://api.github.com'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FilePayload<T = unknown> {
  data: T
  sha: string       // required for PUT (update) requests
  path: string
}

export interface GitHubError {
  status: number
  message: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function dataPath(creds: GitHubCredentials, name: string): string {
  return `${encodeURIComponent(creds.workspace)}/${encodeURIComponent(name)}.json`
}

function repoBase(creds: GitHubCredentials): string {
  return `${BASE}/repos/${creds.owner}/${creds.repo}/contents`
}

async function parseError(res: Response): Promise<GitHubError> {
  let message = res.statusText
  try {
    const body = await res.json()
    if (body?.message) message = body.message
  } catch { /* ignore */ }
  return { status: res.status, message }
}

// ─── Read ──────────────────────────────────────────────────────────────────

/**
 * Fetch a data/{name}.json from the repo.
 * Returns parsed JSON + the file's SHA (needed for writes).
 */
export async function getFile<T>(
  creds: GitHubCredentials,
  name: string,
): Promise<FilePayload<T>> {
  const url = `${repoBase(creds)}/${dataPath(creds, name)}`
  const res = await fetch(url, { headers: headers(creds.token) })

  if (!res.ok) {
    const err = await parseError(res)
    throw err
  }

  const json = await res.json()

  // Contents API returns base64-encoded UTF-8 content.
  // atob() produces a binary string — must pipe through TextDecoder for non-ASCII chars.
  const binary = atob(json.content.replace(/\n/g, ''))
  const bytes  = Uint8Array.from(binary, c => c.charCodeAt(0))
  const raw    = new TextDecoder('utf-8').decode(bytes)
  const data: T = JSON.parse(raw)

  return { data, sha: json.sha, path: json.path }
}

// ─── Write ─────────────────────────────────────────────────────────────────

/**
 * Write (create or update) a data/{name}.json in the repo.
 * `sha` must be provided when updating an existing file.
 * Returns the new SHA from GitHub's response.
 */
export async function putFile<T>(
  creds: GitHubCredentials,
  name: string,
  data: T,
  sha: string | null,
  commitMessage?: string,
): Promise<string> {
  const url  = `${repoBase(creds)}/${dataPath(creds, name)}`
  const json = JSON.stringify(data, null, 2)
  // btoa only handles Latin-1; TextEncoder handles full UTF-8
  const b64  = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  )

  const body: Record<string, unknown> = {
    message: commitMessage ?? `chore: update ${name}.json`,
    content: b64,
  }
  if (sha) body.sha = sha

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(creds.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await parseError(res)
    throw err
  }

  const resJson = await res.json()
  return resJson.content.sha as string
}

// ─── Credentials helper ────────────────────────────────────────────────────

export function loadCredentials(): GitHubCredentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GitHubCredentials) : null
  } catch {
    return null
  }
}
