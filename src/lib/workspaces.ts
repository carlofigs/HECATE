/**
 * workspaces.ts — which top-level directories in HECATE_Data count as workspaces
 *
 * Shared by the Setup page's picker and the MCP server, so the two can never
 * disagree about what a workspace is. Previously this lived inline in
 * CredentialsSection; it moved here when the server needed the same rule.
 */

/** Top-level directories that are infrastructure, never workspaces. */
export const EXCLUDED_TOP_LEVEL = new Set(['scripts', 'node_modules', 'dist', 'public', 'src'])

/** A single entry from the GitHub Contents API listing of a repo root. */
export interface RepoEntry {
  name: string
  type: string
}

/**
 * Workspace directories are every top-level dir except:
 *   - hidden dirs        (.github, .git)
 *   - infrastructure     (scripts, node_modules, …)
 *   - archived/fixtures  (leading underscore, e.g. _old_client)
 *
 * The underscore prefix is a convention rather than a name list so that private
 * workspace names never have to be hardcoded into this public repo. To archive a
 * workspace, rename its directory with a leading underscore — the data is
 * preserved, it just stops appearing in the picker.
 */
export function filterWorkspaces(entries: RepoEntry[]): string[] {
  return entries
    .filter(e =>
      e.type === 'dir' &&
      !e.name.startsWith('.') &&
      !e.name.startsWith('_') &&
      !EXCLUDED_TOP_LEVEL.has(e.name),
    )
    .map(e => e.name)
}
