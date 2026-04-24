/**
 * Shared task-related constants — used by TaskCard, TaskListView, TaskDialog, etc.
 * Single source of truth for priority display config.
 */

import type { Priority } from '@/lib/schemas'

export const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string }> = {
  high:   { label: 'High',   dot: 'bg-red-500'   },
  medium: { label: 'Medium', dot: 'bg-yellow-400' },
  low:    { label: 'Low',    dot: 'bg-blue-400'   },
}
