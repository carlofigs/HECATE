/**
 * TaskIdChip — inline chip that renders a task ID reference in markdown
 *
 * Hover  → Radix Tooltip showing a mini task card (title, priority, column,
 *           tags, blocked status, note preview)
 * Click  → navigates to /tasks?open=<id> so TasksPage auto-opens the dialog
 * Unfound ID → tooltip shows a "not found" message instead of crashing
 */

import { useNavigate } from 'react-router-dom'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Clock } from 'lucide-react'
import { cn, daysSince } from '@/lib/utils'
import { PRIORITY_CONFIG } from '@/lib/taskConstants'
import { useDataFile } from '@/hooks/useDataFile'
import type { Task } from '@/lib/schemas'

// ─── Props come from the hast node properties (lowercase keys) ───────────────

interface Props {
  taskid: string
}

// ─── Component ───────────────────────────────────────────────────────────────

/** t-a47 → A47,  t-b28 → B28,  t-a-lx3k9r → A-lx3k9r */
function displayId(id: string): string {
  const s = id.toLowerCase().startsWith('t-') ? id.slice(2) : id
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function TaskIdChip({ taskid }: Props) {
  const navigate   = useNavigate()
  const resolvedId = taskid.toLowerCase()

  // Load tasks on demand — works even if the user hasn't visited Tasks page yet.
  // useDataFile deduplicates: if TasksPage is also mounted, no double fetch.
  const { data: tasksData } = useDataFile('tasks')

  const result = (() => {
    if (!tasksData) return null
    for (const col of tasksData.columns) {
      const task = col.tasks.find(t => t.id === resolvedId)
      if (task) return { task, colName: col.name }
    }
    return null
  })()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/tasks?open=${encodeURIComponent(resolvedId)}`)
  }

  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'inline-flex items-center font-mono text-[11px] px-1.5 py-0.5 rounded',
            'border transition-colors cursor-pointer',
            result
              ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50'
              : 'border-muted-foreground/30 bg-muted/50 text-muted-foreground hover:bg-muted',
          )}
        >
          {displayId(resolvedId)}
        </button>
      </TooltipPrimitive.Trigger>

      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 w-64 rounded-lg border border-border bg-card shadow-xl p-0 overflow-hidden',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          {result ? (
            <TaskPreview task={result.task} colName={result.colName} />
          ) : (
            <div className="px-3 py-2.5 space-y-1">
              <p className="text-xs font-mono text-muted-foreground">{displayId(resolvedId)}</p>
              <p className="text-[11px] text-muted-foreground/60 italic">
                Task not found — may have been deleted
              </p>
            </div>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ─── Mini task card shown inside the tooltip ─────────────────────────────────

function TaskPreview({ task, colName }: { task: Task; colName: string }) {
  const blockedDays = task.blockedSince ? daysSince(task.blockedSince) : null
  const priority    = task.priority ? PRIORITY_CONFIG[task.priority] : null

  return (
    <div>
      {/* Title header */}
      <div className="px-3 py-2.5 border-b border-border bg-muted/20">
        <div className="flex items-start gap-2">
          {priority && (
            <span
              className={cn('mt-[3px] w-2 h-2 rounded-full shrink-0', priority.dot)}
              title={priority.label}
            />
          )}
          <p className="text-xs font-medium text-foreground leading-snug">
            {task.title}
          </p>
        </div>
      </div>

      {/* Meta row */}
      <div className="px-3 pt-2 pb-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground/60">{displayId(task.id)}</span>
          <span className="text-[10px] text-muted-foreground">{colName}</span>
        </div>

        {blockedDays !== null && (
          <div className="flex items-center gap-1 text-[10px] text-orange-400">
            <Clock className="w-3 h-3" />
            <span>Blocked {blockedDays}d</span>
          </div>
        )}

        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {task.note && (
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
            {task.note}
          </p>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/40">Click to open in Tasks →</p>
      </div>
    </div>
  )
}
