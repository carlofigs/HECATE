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
import type { DataFileName } from '../../../src/lib/schemas'
import type { McpConfig } from '../config'
import { type StorageAdapter, type ReadResult, NotFoundError } from './types'

const BASE = 'https://api.github.com'

/** Injectable so tests can drive the adapter without network access. */
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>

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
    const path = `${encodeURIComponent(workspace)}/${encodeURIComponent(name)}.json`
    const res = await this.get(path)

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
}
