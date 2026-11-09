/** Which workspace to open, and remembering the last one (a UI preference, never a credential). */
import type { WorkspaceList } from './api.ts'

const KEY = 'hecate:workspace'

export function rememberedWorkspace(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function rememberWorkspace(dir: string): void {
  try {
    localStorage.setItem(KEY, dir)
  } catch {
    // Storage can be unavailable (private windows, blocked site data): nothing to remember then.
  }
}

/** The remembered workspace if it still exists, else the Worker's default, else the first visible one. */
export function pickWorkspace(list: WorkspaceList, remembered: string | null): string | null {
  const visible = list.workspaces.filter(w => !w.hidden)
  const exists = (dir: string | null): dir is string => dir !== null && list.workspaces.some(w => w.dir === dir)
  if (exists(remembered)) return remembered
  if (exists(list.default)) return list.default
  return visible[0]?.dir ?? list.workspaces[0]?.dir ?? null
}

/** A workspace's display name: its own name, or its directory. */
export const workspaceLabel = (w: { dir: string; name: string | null }): string => w.name ?? w.dir
