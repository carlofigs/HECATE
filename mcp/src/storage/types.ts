/**
 * types.ts — the storage boundary
 *
 * Everything above this interface deals in parsed, migrated, validated data and
 * knows nothing about GitHub. That is deliberate: the git-JSON-versus-database
 * question is still open, and this is the seam where that decision gets made
 * without rewriting the tools.
 *
 * Read-only for now. Scoped write verbs (add_task, append_log_entry, …) land in
 * the next phase and will extend this interface rather than replace it.
 */

import type { DataFileName, SliceData } from '../../../src/lib/schemas'

export interface ReadResult<K extends DataFileName> {
  data: SliceData<K>
  /** Opaque version marker — a git blob SHA today. Writes will need it. */
  sha: string
}

export interface StorageAdapter {
  /** Workspace directories available in the data repo. */
  listWorkspaces(): Promise<string[]>

  /** Read one data file, migrated to the current schema and structurally validated. */
  readFile<K extends DataFileName>(workspace: string, name: K): Promise<ReadResult<K>>
}

/** Thrown when a data file does not exist in the given workspace. */
export class NotFoundError extends Error {
  constructor(workspace: string, name: string) {
    super(`${name}.json does not exist in workspace "${workspace}".`)
    this.name = 'NotFoundError'
  }
}
