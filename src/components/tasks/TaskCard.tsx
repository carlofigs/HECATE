/**
 * TaskCard — draggable task card for the kanban board
 *
 * Displays: title, priority dot, tags, blocked-days badge, note preview.
 * Click → opens TaskDialog for editing.
 * Drag handle → @dnd-kit sortable.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Clock } from 'lucide-react'
import { cn, daysSince } from '@/lib/utils'
import { PRIORITY_CONFIG } from '@/lib/taskConstants'
import type { Task } from '@/lib/schemas'

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  task:    Task
  onClick: () => void
}

export function TaskCard({ task, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
  }

  const blockedDays = task.blockedSince ? daysSince(task.blockedSince) : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-start gap-1.5 rounded-md border border-border bg-card px-2 py-2 text-sm',
        'hover:border-border/60 hover:shadow-sm transition-all cursor-pointer',
        isDragging && 'opacity-40 shadow-lg',
      )}
      onClick={onClick}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
        className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
        aria-label="Drag task"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title row */}
        <div className="flex items-start gap-1.5">
          {/* Priority dot */}
          {task.priority && (
            <span
              className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_CONFIG[task.priority].dot)}
              title={PRIORITY_CONFIG[task.priority].label}
            />
          )}
          <p className="text-xs leading-snug text-foreground break-words">
            {task.title}
          </p>
        </div>

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Blocked badge */}
        {blockedDays !== null && (
          <div className="flex items-center gap-1 text-[10px] text-orange-400">
            <Clock className="w-3 h-3" />
            <span>Blocked {blockedDays}d</span>
          </div>
        )}
      </div>
    </div>
  )
}
