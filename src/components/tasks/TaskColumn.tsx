/**
 * TaskColumn — droppable kanban column
 *
 * Uses useDroppable so tasks can be dropped onto the column when it's empty.
 * Column accent strip uses the CSS variable token from columnAccentClass().
 */

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useState, useRef } from 'react'
import { TaskCard } from './TaskCard'
import { cn, columnAccentClass } from '@/lib/utils'
import type { Column, Task } from '@/lib/schemas'

interface Props {
  column:       Column
  onTaskClick:  (task: Task, columnId: string) => void
  onQuickAdd:   (columnId: string, title: string) => void
}

export function TaskColumn({ column, onTaskClick, onQuickAdd }: Props) {
  const [addingTask, setAddingTask] = useState(false)
  const [draft,      setDraft]      = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const accentToken = columnAccentClass(column.id)

  function startAdd() {
    setDraft('')
    setAddingTask(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commitAdd() {
    const title = draft.trim()
    if (title) onQuickAdd(column.id, title)
    setDraft('')
    setAddingTask(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commitAdd() }
    if (e.key === 'Escape') { setAddingTask(false) }
  }

  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      {/* Column header */}
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0 border-border bg-card"
        style={{ borderTopColor: `hsl(var(--${accentToken}))`, borderTopWidth: 2 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{column.name}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {column.tasks.length}
          </span>
        </div>
        <button
          onClick={startAdd}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Add task"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task list — droppable */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto min-h-0 rounded-b-lg border border-t-0 border-border bg-card/50 p-2 space-y-1.5 transition-colors',
          isOver && 'bg-accent/20',
        )}
      >
        <SortableContext
          items={column.tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              columnId={column.id}
              onClick={() => onTaskClick(task, column.id)}
            />
          ))}
        </SortableContext>

        {column.tasks.length === 0 && !addingTask && (
          <div className="flex items-center justify-center h-16 text-[11px] text-muted-foreground/40 select-none">
            Drop here
          </div>
        )}

        {/* Quick-add inline input */}
        {addingTask && (
          <div className="rounded-md border border-primary/40 bg-background p-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commitAdd}
              placeholder="Task title…"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-muted-foreground/40">↵ add · Esc cancel</p>
          </div>
        )}
      </div>
    </div>
  )
}
