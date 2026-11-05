/**
 * workspaces.ts — which workspaces the data branch holds: the top-level
 * directories with a workspace.json. `_`-prefixed ones (archived) are listed
 * but marked hidden. The answer is cached briefly and re-checked with a
 * conditional head read, which is free when nothing moved.
 */

import type { GitStore } from '@hecate/github-store'

export interface WorkspaceEntry {
  dir: string
  hidden: boolean
}

const WORKSPACE_FILE = /^([^/]+)\/workspace\.json$/
const DIR_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

export class WorkspaceList {
  private etag: string | null = null
  private list: WorkspaceEntry[] | null = null
  private checkedAt = 0
  private readonly store: GitStore
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(store: GitStore, options: { ttlMs?: number; now?: () => number } = {}) {
    this.store = store
    this.ttlMs = options.ttlMs ?? 30_000
    this.now = options.now ?? Date.now
  }

  async get(options: { fresh?: boolean } = {}): Promise<WorkspaceEntry[]> {
    if (!options.fresh && this.list && this.now() - this.checkedAt < this.ttlMs) return this.list
    const head = await this.store.readHead({ etag: this.list ? this.etag : null })
    this.checkedAt = this.now()
    if ('unchanged' in head && this.list) return this.list
    if ('unchanged' in head) throw new Error('Unexpected 304 without a cached list')
    const dirs = (await this.store.readTree(head.tree)).flatMap(e => {
      const dir = WORKSPACE_FILE.exec(e.path)?.[1]
      return dir && DIR_PATTERN.test(dir) ? [dir] : []
    })
    this.list = dirs.sort().map(dir => ({ dir, hidden: dir.startsWith('_') }))
    this.etag = head.etag
    return this.list
  }

  async has(dir: string): Promise<boolean> {
    return DIR_PATTERN.test(dir) && (await this.get()).some(w => w.dir === dir)
  }
}
