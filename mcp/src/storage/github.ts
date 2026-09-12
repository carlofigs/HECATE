/**
 * github.ts — StorageAdapter backed by the GitHub Contents API
 *
 * The Node counterpart to src/lib/github.ts. It is a separate implementation
 * rather than a shared module because that one is browser-shaped: it reads
 * credentials from localStorage and decodes base64 through atob/TextDecoder.
 * Node has Buffer and gets its config from the environment.
 *
 * What is NOT duplicated is the part that matters — migrateFile and
 * validateFile are imported from src/lib, so the server applies exactly the
 * same schema guard and structural checks as the app. If those ever diverged,
 * the server could write back a file the app refuses to load.
 */

import { migrateFile } from '../../../src/lib/migrate'
import { validateFile } from '../../../src/lib/validate'
import { filterWorkspaces, type RepoEntry } from '../../../src/lib/workspaces'
import type { DataFileName, SliceData } from '../../../src/lib/schemas'
import type { McpConfig } from '../config'
import { type StorageAdapter, type ReadResult, NotFoundError, ConflictError } from './types'

const BASE = 'https://api.github.com'

/** Injectable so tests can drive the adapter without network access. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<Response>

/** GitHub returns 409 when the supplied blob SHA no longer matches the remote. */
const CONFLICT_STATUSES = new Set([409, 412])

export class GitHubStorage implements StorageAdapter {
  constructor(
    private readonly config: McpConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private async get(path: string): Promise<Response> {
    const { owner, repo } = this.config
    return this.fetchImpl(`${BASE}/repos/${owner}/${repo}/contents/${path}`, { headers: this.headers() })
  }

  private async put(path: string, body: unknown): Promise<Response> {
    const { owner, repo } = this.config
    return this.fetchImpl(`${BASE}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private static dataPath(workspace: string, name: string): string {
    return `${encodeURIComponent(workspace)}/${encodeURIComponent(name)}.json`
  }

  private static async failure(res: Response, fallback: string): Promise<Error> {
    let message = res.statusText || fallback
    try {
      const body = await res.json() as { message?: string }
      if (body?.message) message = body.message
    } catch { /* response had no JSON body — keep the status text */ }
    return new Error(`GitHub API ${res.status}: ${message}`)
  }

  async listWorkspaces(): Promise<string[]> {
    const res = await this.get('')
    if (!res.ok) throw await GitHubStorage.failure(res, 'could not list the repo root')
    const entries = await res.json() as RepoEntry[]
    return filterWorkspaces(entries)
  }

  async readFile<K extends DataFileName>(workspace: string, name: K): Promise<ReadResult<K>> {
    const res = await this.get(GitHubStorage.dataPath(workspace, name))

    if (res.status === 404) throw new NotFoundError(workspace, name)
    if (!res.ok) throw await GitHubStorage.failure(res, `could not read ${name}.json`)

    const json = await res.json() as { content: string; sha: string }

    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'))
    } catch {
      throw new Error(`${name}.json could not be decoded — the file may be corrupted.`)
    }

    // Same order as the app's loadFile: migrate first so validation and every
    // consumer downstream only ever see the current shape. migrateFile throws
    // on a file written by a newer build rather than misreading it.
    const data = validateFile(name, migrateFile(name, parsed))
    return { data, sha: json.sha }
  }

  async mutateFile<K extends DataFileName>(
    workspace: string,
    name: K,
    mutate: (data: SliceData<K>) => void,
    commitMessage: string,
  ): Promise<ReadResult<K>> {
    // Two passes at most. The second exists because the remote can move between
    // our read and our write — another tab, the calendar Action, another
    // session. Re-running the whole cycle means the mutation lands on top of
    // whatever arrived, rather than overwriting it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, sha } = await this.readFile(workspace, name)
      mutate(data)

      // Never PUT a shape the app would refuse to load. The mutation came from
      // our own verbs, so a failure here is a bug in a verb, caught before it
      // reaches the repo rather than after.
      validateFile(name, data)

      const res = await this.put(GitHubStorage.dataPath(workspace, name), {
        message: commitMessage,
        content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
        sha,
      })

      if (res.ok) {
        const body = await res.json() as { content: { sha: string } }
        return { data, sha: body.content.sha }
      }
      if (!CONFLICT_STATUSES.has(res.status)) {
        throw await GitHubStorage.failure(res, `could not write ${name}.json`)
      }
    }

    throw new ConflictError(workspace, name)
  }
}
