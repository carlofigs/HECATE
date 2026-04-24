/**
 * TaskListView — flat list of all tasks, grouped by column, with search
 *
 * Features:
 * - Live text search across title, note, tags
 * - Tasks grouped under collapsible column headers
 * - Priority dot, tags, blocked badge per row
 * - Click row → TaskDialog (passed via onTaskClick)
 * - "+ New task" button per group header
 */

import { useState, useMemo } from 'react'
import { Search, Plus, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { cn, daysSince, columnAccentClass, accentTextStyle } from '@/lib/utils'
import { PRIORITY_CONFIG, displayId } from '@/lib/taskConstants'
import { useCollapsed } from '@/hooks/useCollapsed'
import type { Column, Task } from '@/lib/schemas'

interface Props {
  columns:     Column[]
  onTaskClick: (task: Task, columnId: string) => void
  onNewTask:   (columnId: string) => void
}

export function TaskListView({ columns, onTaskClick, onNewTask }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const { isCollapsed, toggle, collapseAll, expandAll, collapsedCount } =
    useCollapsed('hecate:tasks:list:collapsed')

  const q = searchQuery.toLowerCase().trim()

  // Filter tasks per column when search is active
  const filtered = useMemo(() =>
    columns
      .map(col => ({
        ...col,
        tasks: q
          ? col.tasks.filter(t =>
              t.title.toLowerCase().includes(q) ||
              t.note?.toLowerCase().includes(q) ||
              t.tags.some(tag => tag.toLowerCase().includes(q)),
            )
          : col.tasks,
      }))
      // When searching, hide columns with zero matches; when not searching, show all columns
      .filter(col => col.tasks.length > 0 || !q),
  [columns, q])

  const totalVisible = filtered.reduce((n, c) => n + c.tasks.length, 0)
  const allIds = columns.map(c => c.id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tasks…"
            className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {q && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
              {totalVisible}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-4">
        {columns.length > 1 && (
          <div className="flex justify-end">
            <button
              onClick={() => collapsedCount > 0 ? expandAll() : collapseAll(allIds)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsedCount > 0 ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
        )}
        {filtered.map(col => {
          const accent = columnAccentClass(col.id)

          return (
            <div key={col.id}>
              {/* Column group header */}
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => toggle(col.id)}
                  className="flex items-center gap-1.5 group"
                >
                  {isCollapsed(col.id)
                    ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground" />
                  }
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={accentTextStyle(accent)}
                  >
                    {col.name}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground bg-muted rounded px-1">
                    {col.tasks.length}
                  </span>
                </button>

                <button
                  onClick={() => onNewTask(col.id)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title={`Add to ${col.name}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Task rows */}
              {!isCollapsed(col.id) && (
                <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                  {col.tasks.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground/40 italic">
                      No tasks
                    </div>
                  ) : (
                    col.tasks.map(task => (
                      <TaskListRow
                        key={task.id}
                        task={task}
                        onClick={() => onTaskClick(task, col.id)}
                        searchQuery={q}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No tasks match &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function TaskListRow({
  task,
  onClick,
  searchQuery,
}: {
  task: Task
  onClick: () => void
  searchQuery: string
}) {
  const blockedDays = task.blockedSince ? daysSince(task.blockedSince) : null

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 bg-card hover:bg-accent/30 cursor-pointer transition-colors"
    >
      {/* Priority dot */}
      <span className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        task.priority ? PRIORITY_CONFIG[task.priority].dot : 'bg-muted-foreground/20',
      )} />

      {/* ID */}
      <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 tabular-nums w-8">
        {displayId(task.id)}
      </span>

      {/* Title */}
      <span className="flex-1 min-w-0 text-xs text-foreground truncate">
        <Highlighted text={task.title} query={searchQuery} />
      </span>

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {task.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5"
            >
              #{tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Blocked */}
      {blockedDays !== null && (
        <div className="flex items-center gap-0.5 text-[10px] text-orange-400 shrink-0">
          <Clock className="w-3 h-3" />
          <span>{blockedDays}d</span>
        </div>
      )}
    </div>
  )
}

// ─── Search highlight ─────────────────────────────────────────────────────────

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}
