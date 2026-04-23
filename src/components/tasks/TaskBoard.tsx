/**
 * TaskBoard — DnD context + cross-column move logic
 *
 * Uses @dnd-kit/core DndContext with pointer + keyboard sensors.
 * Each column is a SortableContext (vertical) + useDroppable target.
 *
 * onDragEnd algorithm:
 *   1. Find source column by active task id
 *   2. Find dest column by over.id (could be a task id OR a column id)
 *   3. Remove task from source, insert at correct position in dest
 *   4. Stamp updatedAt on the moved task
 */

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { TaskColumn } from './TaskColumn'
import { TaskCard } from './TaskCard'
import { TaskDialog } from './TaskDialog'
import { nowISO, generateTaskId } from '@/lib/utils'
import type { TasksData, Task } from '@/lib/schemas'

interface Props {
  data:    TasksData
  setData: (updater: (draft: TasksData) => void) => void
}

export function TaskBoard({ data, setData }: Props) {
  const [activeTask,    setActiveTask]    = useState<Task | null>(null)
  const [dialogTask,    setDialogTask]    = useState<Task | null>(null)
  const [dialogColId,   setDialogColId]   = useState<string | null>(null)
  const [dialogOpen,    setDialogOpen]    = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function onDragStart(event: DragStartEvent) {
    const task = data.columns.flatMap(c => c.tasks).find(t => t.id === event.active.id)
    setActiveTask(task ?? null)
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId   = String(over.id)

    setData(draft => {
      // Find source
      const srcColIdx  = draft.columns.findIndex(c => c.tasks.some(t => t.id === activeId))
      if (srcColIdx === -1) return

      // Find dest — over.id is either a task id or a column id
      const destColIdx = draft.columns.findIndex(
        c => c.id === overId || c.tasks.some(t => t.id === overId),
      )
      if (destColIdx === -1) return

      const srcCol  = draft.columns[srcColIdx]
      const destCol = draft.columns[destColIdx]

      // Remove from source
      const taskIdx = srcCol.tasks.findIndex(t => t.id === activeId)
      const [task]  = srcCol.tasks.splice(taskIdx, 1)
      task.updatedAt = nowISO()

      // Insert into dest
      if (overId === destCol.id) {
        // Dropped on the column itself — append
        destCol.tasks.push(task)
      } else {
        // Dropped on another task — insert before it
        const overIdx = destCol.tasks.findIndex(t => t.id === overId)
        destCol.tasks.splice(overIdx >= 0 ? overIdx : destCol.tasks.length, 0, task)
      }
    })
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────

  const handleTaskClick = useCallback((task: Task, columnId: string) => {
    setDialogTask(task)
    setDialogColId(columnId)
    setDialogOpen(true)
  }, [])

  const handleQuickAdd = useCallback((columnId: string, title: string) => {
    setData(draft => {
      const col = draft.columns.find(c => c.id === columnId)
      if (!col) return
      const now = nowISO()
      col.tasks.unshift({
        id:          generateTaskId(),
        title,
        note:        null,
        tags:        [],
        priority:    null,
        blockedSince:null,
        createdAt:   now,
        updatedAt:   now,
      })
    })
  }, [setData])

  const handleCreate = useCallback((columnId: string, task: Task) => {
    setData(draft => {
      const col = draft.columns.find(c => c.id === columnId)
      col?.tasks.unshift(task)
    })
  }, [setData])

  const handleUpdate = useCallback((columnId: string, task: Task) => {
    setData(draft => {
      const col = draft.columns.find(c => c.id === columnId)
      if (!col) return
      const idx = col.tasks.findIndex(t => t.id === task.id)
      if (idx !== -1) col.tasks[idx] = task
    })
  }, [setData])

  const handleDelete = useCallback((columnId: string, taskId: string) => {
    setData(draft => {
      const col = draft.columns.find(c => c.id === columnId)
      if (!col) return
      col.tasks = col.tasks.filter(t => t.id !== taskId)
    })
  }, [setData])

  const handleMove = useCallback((taskId: string, fromColId: string, toColId: string) => {
    setData(draft => {
      const src  = draft.columns.find(c => c.id === fromColId)
      const dest = draft.columns.find(c => c.id === toColId)
      if (!src || !dest) return
      const idx  = src.tasks.findIndex(t => t.id === taskId)
      if (idx === -1) return
      const [task] = src.tasks.splice(idx, 1)
      task.updatedAt = nowISO()
      dest.tasks.push(task)
    })
  }, [setData])

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {/* Board — horizontal scroll on desktop, vertical stack on mobile */}
        <div className="flex lg:flex-row flex-col gap-3 h-full p-4 overflow-x-auto overflow-y-auto lg:overflow-y-hidden">
          {data.columns.map(col => (
            <TaskColumn
              key={col.id}
              column={col}
              onTaskClick={handleTaskClick}
              onQuickAdd={handleQuickAdd}
            />
          ))}

          {/* Mobile bottom padding */}
          <div className="lg:hidden h-4 shrink-0" />
        </div>

        {/* Drag overlay — ghost card while dragging */}
        <DragOverlay>
          {activeTask && (
            <div className="opacity-90 rotate-1 shadow-xl">
              <TaskCard
                task={activeTask}
                columnId=""
                onClick={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Edit / create dialog */}
      <TaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        task={dialogTask}
        columnId={dialogColId}
        columns={data.columns}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onMove={handleMove}
      />
    </>
  )
}
