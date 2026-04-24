/**
 * TaskBoard — DnD context + cross-column move logic
 *
 * Receives CRUD callbacks from TasksPage so they can be shared
 * with TaskListView without duplicating logic.
 */

import { useState } from 'react'
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
import { nowISO } from '@/lib/utils'
import type { TasksData, Task } from '@/lib/schemas'

interface Props {
  data:        TasksData
  setData:     (updater: (draft: TasksData) => void) => void
  onTaskClick: (task: Task, columnId: string) => void
  onQuickAdd:  (columnId: string, title: string) => void
}

export function TaskBoard({ data, setData, onTaskClick, onQuickAdd }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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
      const srcColIdx = draft.columns.findIndex(c => c.tasks.some(t => t.id === activeId))
      if (srcColIdx === -1) return

      const destColIdx = draft.columns.findIndex(
        c => c.id === overId || c.tasks.some(t => t.id === overId),
      )
      if (destColIdx === -1) return

      const srcCol  = draft.columns[srcColIdx]
      const destCol = draft.columns[destColIdx]

      const taskIdx = srcCol.tasks.findIndex(t => t.id === activeId)
      const [task]  = srcCol.tasks.splice(taskIdx, 1)
      task.updatedAt = nowISO()

      if (overId === destCol.id) {
        destCol.tasks.push(task)
      } else {
        const overIdx = destCol.tasks.findIndex(t => t.id === overId)
        destCol.tasks.splice(overIdx >= 0 ? overIdx : destCol.tasks.length, 0, task)
      }
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex lg:flex-row flex-col gap-3 h-full p-4 overflow-x-auto overflow-y-auto lg:overflow-y-hidden">
        {data.columns.map(col => (
          <TaskColumn
            key={col.id}
            column={col}
            onTaskClick={onTaskClick}
            onQuickAdd={onQuickAdd}
          />
        ))}
        <div className="lg:hidden h-4 shrink-0" />
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="opacity-90 rotate-1 shadow-xl">
            <TaskCard task={activeTask} columnId="" onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
