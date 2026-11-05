/**
 * store.ts — a branch of a GitHub repository as files, through the Git Data API.
 *
 * Reads are cheap on purpose:
 * - the branch head is read conditionally (a 304 costs nothing against the rate limit);
 * - commits, trees and blobs are immutable, so they are cached by SHA;
 * - a refresh therefore fetches only the blobs that actually changed.
 *
 * A write is one commit however many files it touches: one tree (base tree +
 * inline content + deletions), one commit, one ref update — three requests.
 * The ref update is never forced. If someone else moved the branch first,
 * the result says so and nothing is overwritten; deciding what to do next
 * (rebuild on the new head, or replay) is the caller's job (ADR 0002).
 */

import { GITHUB_API, GitHubError, createClient, defaultSleep, type Client, type Fetch } from './http.ts'
import { base64ToText } from './base64.ts'

export interface BlobCache {
  get(sha: string): string | undefined | Promise<string | undefined>
  set(sha: string, text: string): void | Promise<void>
}

export interface GitStoreOptions {
  owner: string
  repo: string
  branch: string
  /** A token for the repository (an App installation token). Called before each request; cache inside. */
  token: () => Promise<string>
  fetch?: Fetch
  baseUrl?: string
  userAgent?: string
  /** Where blob contents are kept between reads. In memory by default. */
  blobCache?: BlobCache
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
}

/** A commit and its root tree. */
export interface Head {
  commit: string
  tree: string
}

export interface TreeEntry {
  path: string
  sha: string
  size: number
}

export interface Files {
  /** Path relative to the prefix → UTF-8 content. */
  files: Record<string, string>
  /** Path relative to the prefix → blob SHA. */
  shas: Record<string, string>
}

export interface TreeDiff {
  added: string[]
  modified: string[]
  deleted: string[]
}

export type CommitResult =
  | {
    ok: true
    commit: string
    tree: string
    /** Blob SHA of every path written; null for a deletion. Empty when nothing changed. */
    blobs: Record<string, string | null>
  }
  | { ok: false; reason: 'non-fast-forward' }

export interface GitStore {
  /** The branch head. With the ETag of an earlier read, `unchanged` when it has not moved. */
  readHead(options?: { etag?: string | null }): Promise<(Head & { etag: string | null }) | { unchanged: true }>
  /** Every file (blob) in a tree, recursively. */
  readTree(tree: string): Promise<TreeEntry[]>
  /** The contents of every file under `prefix` (a directory; '' for the whole tree). */
  readFiles(tree: string, prefix: string): Promise<Files>
  /** One file's contents by blob SHA (from readTree), through the blob cache. */
  readBlob(sha: string): Promise<string>
  /** Paths under `prefix` that differ between two trees, relative to the prefix. */
  diffTrees(from: string, to: string, prefix?: string): Promise<TreeDiff>
  /** Write `changes` (path → content, or null to delete) on top of `parent` as one commit. */
  commitChanges(input: { parent: Head; changes: Readonly<Record<string, string | null>>; message: string }): Promise<CommitResult>
}

/** A Map that forgets its oldest entries past `limit`. */
function boundedMap<V>(limit: number): Map<string, V> {
  const map = new Map<string, V>()
  const set = map.set.bind(map)
  map.set = (key, value) => {
    map.delete(key)
    set(key, value)
    while (map.size > limit) map.delete(map.keys().next().value as string)
    return map
  }
  return map
}

function memoryBlobCache(limit = 2000): BlobCache {
  const map = boundedMap<string>(limit)
  return { get: sha => map.get(sha), set: (sha, text) => void map.set(sha, text) }
}

/** The SHA git gives a blob: sha1("blob <bytes>\0" + content). */
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const bytes = new Uint8Array(header.length + body.length)
  bytes.set(header)
  bytes.set(body, header.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
}

const SAFE_PATH = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\0]+(?<!\/)$/

function assertPath(path: string): void {
  if (!SAFE_PATH.test(path)) throw new RangeError(`Not a safe repository path: ${JSON.stringify(path)}`)
}

const under = (prefix: string) => (path: string): string | null => {
  if (prefix === '') return path
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null
}

/** Run `task` over `items`, at most `limit` at a time. */
async function pool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) await task(items[next++] as T)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export function createGitStore(options: GitStoreOptions): GitStore {
  const client: Client = createClient({
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    baseUrl: options.baseUrl ?? GITHUB_API,
    userAgent: options.userAgent ?? 'hecate',
    authorization: async () => `Bearer ${await options.token()}`,
    sleep: options.sleep ?? defaultSleep,
    maxAttempts: options.maxAttempts ?? 3,
  })
  const repoPath = `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}`
  const branchPath = options.branch.split('/').map(encodeURIComponent).join('/')
  const blobs = options.blobCache ?? memoryBlobCache()
  const commitTrees = boundedMap<string>(64)
  const trees = boundedMap<TreeEntry[]>(16)

  const treeOf = async (commit: string): Promise<string> => {
    const cached = commitTrees.get(commit)
    if (cached) return cached
    const { data } = await client.request<{ tree: { sha: string } }>('GET', `${repoPath}/git/commits/${commit}`)
    commitTrees.set(commit, data.tree.sha)
    return data.tree.sha
  }

  const readTree = async (tree: string): Promise<TreeEntry[]> => {
    const cached = trees.get(tree)
    if (cached) return cached
    const { data } = await client.request<{ truncated: boolean; tree: { path: string; type: string; sha: string; size?: number }[] }>(
      'GET', `${repoPath}/git/trees/${tree}?recursive=1`,
    )
    if (data.truncated) throw new Error(`Tree ${tree} is too large to read in one request`)
    const entries = data.tree.filter(e => e.type === 'blob').map(e => ({ path: e.path, sha: e.sha, size: e.size ?? 0 }))
    trees.set(tree, entries)
    return entries
  }

  const readBlob = async (sha: string): Promise<string> => {
    const cached = await blobs.get(sha)
    if (cached !== undefined) return cached
    const { data } = await client.request<{ content: string; encoding: string }>('GET', `${repoPath}/git/blobs/${sha}`)
    if (data.encoding !== 'base64') throw new Error(`Blob ${sha} came back as ${data.encoding}, not base64`)
    const text = base64ToText(data.content)
    await blobs.set(sha, text)
    return text
  }

  return {
    async readHead({ etag } = {}) {
      const { status, headers, data } = await client.request<{ object: { sha: string; type: string } }>(
        'GET', `${repoPath}/git/ref/heads/${branchPath}`, etag ? { headers: { 'if-none-match': etag } } : {},
      )
      if (status === 304) return { unchanged: true }
      if (data.object.type !== 'commit') throw new Error(`heads/${options.branch} points at a ${data.object.type}, not a commit`)
      return { commit: data.object.sha, tree: await treeOf(data.object.sha), etag: headers.get('etag') }
    },

    readTree,

    readBlob,

    async readFiles(tree, prefix) {
      const rel = under(prefix)
      const entries = (await readTree(tree)).flatMap(e => {
        const path = rel(e.path)
        return path === null ? [] : [{ path, sha: e.sha }]
      })
      const files: Record<string, string> = {}
      const shas: Record<string, string> = {}
      await pool(entries, 8, async ({ path, sha }) => {
        files[path] = await readBlob(sha)
        shas[path] = sha
      })
      const sorted = <T>(record: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.keys(record).sort().map(k => [k, record[k] as T]))
      return { files: sorted(files), shas: sorted(shas) }
    },

    async diffTrees(from, to, prefix = '') {
      const rel = under(prefix)
      const index = (entries: TreeEntry[]): Map<string, string> => {
        const map = new Map<string, string>()
        for (const e of entries) {
          const path = rel(e.path)
          if (path !== null) map.set(path, e.sha)
        }
        return map
      }
      const [a, b] = [index(await readTree(from)), index(await readTree(to))]
      const diff: TreeDiff = { added: [], modified: [], deleted: [] }
      for (const [path, sha] of b) {
        const before = a.get(path)
        if (before === undefined) diff.added.push(path)
        else if (before !== sha) diff.modified.push(path)
      }
      for (const path of a.keys()) if (!b.has(path)) diff.deleted.push(path)
      for (const list of [diff.added, diff.modified, diff.deleted]) list.sort()
      return diff
    },

    async commitChanges({ parent, changes, message }) {
      const paths = Object.keys(changes).sort()
      paths.forEach(assertPath)
      const base = await readTree(parent.tree)
      const existing = new Map(base.map(e => [e.path, e.sha]))

      // Skip what would not change anything: deleting an absent file, or rewriting identical content.
      const written: Record<string, string | null> = {}
      const entries: ({ path: string; mode: '100644'; type: 'blob'; content: string } | { path: string; mode: '100644'; type: 'blob'; sha: null })[] = []
      for (const path of paths) {
        const content = changes[path]
        if (content === null || content === undefined) {
          if (!existing.has(path)) continue
          written[path] = null
          entries.push({ path, mode: '100644', type: 'blob', sha: null })
        } else {
          const sha = await gitBlobSha(content)
          if (existing.get(path) === sha) continue
          written[path] = sha
          entries.push({ path, mode: '100644', type: 'blob', content })
        }
      }
      if (entries.length === 0) return { ok: true, commit: parent.commit, tree: parent.tree, blobs: {} }

      const { data: tree } = await client.request<{ sha: string }>('POST', `${repoPath}/git/trees`, { body: { base_tree: parent.tree, tree: entries } })
      const { data: commit } = await client.request<{ sha: string }>('POST', `${repoPath}/git/commits`, {
        body: { message, tree: tree.sha, parents: [parent.commit] },
      })
      try {
        await client.request('PATCH', `${repoPath}/git/refs/heads/${branchPath}`, { body: { sha: commit.sha, force: false } })
      } catch (error) {
        if (error instanceof GitHubError && error.status === 422 && /fast.?forward/i.test(error.message)) return { ok: false, reason: 'non-fast-forward' }
        throw error
      }

      // Prime the caches with what was just written, so the next read or diff costs nothing.
      commitTrees.set(commit.sha, tree.sha)
      const next = new Map(existing)
      for (const [path, sha] of Object.entries(written)) {
        if (sha === null) next.delete(path)
        else next.set(path, sha)
      }
      for (const path of paths) {
        const content = changes[path]
        const sha = written[path]
        if (typeof content === 'string' && sha) await blobs.set(sha, content)
      }
      const sizes = new Map(base.map(e => [e.path, e.size]))
      trees.set(tree.sha, [...next].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, sha]) => {
        const content = changes[path]
        return { path, sha, size: typeof content === 'string' ? new TextEncoder().encode(content).length : (sizes.get(path) ?? 0) }
      }))
      return { ok: true, commit: commit.sha, tree: tree.sha, blobs: written }
    },
  }
}
