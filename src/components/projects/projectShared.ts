/**
 * Shared helpers for the Projects surface — status config and the project
 * mutation callback type used across the detail sub-sections.
 */

import type { Project } from '@/lib/schemas'

/** Mutate the selected project; the page stamps updatedAt and auto-saves. */
export type ProjectUpdater = (p: Project) => void

export const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  'active':      { label: 'Active',      dot: 'bg-green-500',           badge: 'text-green-600 bg-green-500/10 border-green-500/30 dark:text-green-400'     },
  'in-progress': { label: 'In Progress', dot: 'bg-sky-500',             badge: 'text-sky-600 bg-sky-500/10 border-sky-500/30 dark:text-sky-400'             },
  'paused':      { label: 'Paused',      dot: 'bg-amber-500',           badge: 'text-amber-600 bg-amber-500/10 border-amber-500/30 dark:text-amber-400'     },
  'blocked':     { label: 'Blocked',     dot: 'bg-red-500',             badge: 'text-red-600 bg-red-500/10 border-red-500/30 dark:text-red-400'             },
  'completed':   { label: 'Completed',   dot: 'bg-violet-500',          badge: 'text-violet-600 bg-violet-500/10 border-violet-500/30 dark:text-violet-400' },
  'planned':     { label: 'Planned',     dot: 'bg-muted-foreground',    badge: 'text-muted-foreground bg-muted/50 border-border'                             },
}

export function statusCfg(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG['planned']
}
