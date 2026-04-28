/**
 * Shared task-related constants — used by TaskCard, TaskListView, TaskDialog,
 * TaskIdChip, WeekCalendarView, rehypeTaskIds, etc.
 * Single source of truth for priority config, ID formatting, and ID regex.
 */

import type { Priority } from '@/lib/schemas'

export const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string }> = {
  high:   { label: 'High',   dot: 'bg-red-500'   },
  medium: { label: 'Medium', dot: 'bg-yellow-400' },
  low:    { label: 'Low',    dot: 'bg-blue-400'   },
}

/** Format a storage ID for display: t-a47 → A47, t-b28 → B28 */
export function displayId(id: string): string {
  const s = id.toLowerCase().startsWith('t-') ? id.slice(2) : id
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Raw pattern string for task ID references in prose / table text.
 * Covers: t-a47 | t-b28 | t-a-lx3k9r | t-custom-abc123
 * Deliberately excludes bare A47/B28 (ambiguous with spreadsheet cell refs).
 *
 * Exported as a pattern string (not a RegExp) so callers construct their own
 * instance with the flags they need — avoids shared /g flag statefulness bugs.
 *
 * Usage:  new RegExp(TASK_ID_PATTERN, 'gi')
 */
export const TASK_ID_PATTERN = String.raw`\b(t-[a-z][a-z0-9]*(?:-[a-z0-9]+)?)\b`

/** localStorage key for the Tasks page view (board | list). Single source of truth. */
export const TASKS_VIEW_STORAGE_KEY = 'hecate:tasks:view'

/** localStorage key for the cached list of workspace directories. */
export const WORKSPACES_STORAGE_KEY = 'hecate:workspaces'
