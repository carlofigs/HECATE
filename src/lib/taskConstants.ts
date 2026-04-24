/**
 * Shared task-related constants — used by TaskCard, TaskListView, TaskDialog, etc.
 * Single source of truth for priority display config and ID formatting.
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
