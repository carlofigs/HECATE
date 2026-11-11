import { boardColumns, type BoardCard, type WorkspaceState } from '@hecate/core'
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Button } from '@hecate/ui'
import { Plus } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router'
import { PageShell } from '../shell/PageShell.tsx'
import { useBottomActionSlot } from '../shell/slots.ts'
import { Card } from './Card.tsx'
import { Column } from './Column.tsx'
import { arrangementOf, arrangeOver, containerOf, moveOp, type Arrangement } from './moves.ts'
import { TaskEditor } from './TaskEditor.tsx'
import { useBoardActions } from './useBoardActions.ts'
import { useMinWidth } from './useMinWidth.ts'

/** How far a pointer must travel before a press on the handle becomes a drag. */
const DRAG_DISTANCE = 6

interface Drag {
  key: string
  original: Arrangement
  arrangement: Arrangement
}

/** The Board: every status as a column, tasks in board order, written only through ops. */
export function Board() {
  const [params, setParams] = useSearchParams()
  const slot = useBottomActionSlot()
  const startNew = (): void => {
    setParams(p => {
      const next = new URLSearchParams(p)
      next.delete('task')
      next.set('new', '1')
      return next
    })
  }
  const newTask = (
    <Button variant="primary" icon={<Plus aria-hidden="true" className="size-(--size-icon-md)" />} onClick={startNew}>
      New task
    </Button>
  )
  return (
    <>
      <PageShell title="Board" actions={<div className="max-md:hidden">{newTask}</div>}>
        {snapshot => <BoardBody state={snapshot.state} params={params} setParams={setParams} />}
      </PageShell>
      {slot ? createPortal(newTask, slot) : null}
    </>
  )
}

interface BodyProps {
  state: WorkspaceState
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
}

function BoardBody({ state, params, setParams }: BodyProps) {
  const columns = boardColumns(state)
  const actions = useBoardActions(columns)
  const wide = useMinWidth('--breakpoint-lg')
  // The drag as dnd-kit reports it, read by the next event at once (events can outpace renders);
  // `drag` mirrors it for rendering.
  const dragging = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const cards = new Map<string, BoardCard>(columns.flatMap(c => c.cards.map(card => [card.key, card] as const)))
  const statusName = new Map(columns.map(c => [c.status.id, c.status.name]))
  const arrangement = drag?.arrangement ?? arrangementOf(columns)
  const statuses = columns.map(c => ({ id: c.status.id, name: c.status.name }))

  const setParam = (name: string, value: string | null): void =>
    setParams(p => {
      const next = new URLSearchParams(p)
      if (value === null) next.delete(name)
      else next.set(name, value)
      return next
    }, { replace: name === 'status' })
  const openTask = (key: string): void => setParam('task', key)
  const closeEditor = (): void =>
    setParams(p => {
      const next = new URLSearchParams(p)
      next.delete('task')
      next.delete('new')
      return next
    })

  const where = (key: UniqueIdentifier, layout: Arrangement): string => {
    const status = containerOf(layout, String(key))
    if (!status) return 'nowhere'
    const keys = layout[status] ?? []
    return `${statusName.get(status) ?? status}, position ${keys.indexOf(String(key)) + 1} of ${keys.length}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${String(active.id)}, in ${where(active.id, arrangement)}.`,
    onDragOver: ({ active, over }) => (over ? `${String(active.id)} is now in ${where(active.id, arrangeOver(arrangement, String(active.id), String(over.id)))}.` : `${String(active.id)} is not over a column.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${String(active.id)} in ${where(active.id, arrangement)}.` : `Dropped ${String(active.id)}. It stays where it was.`),
    onDragCancel: ({ active }) => `Moving ${String(active.id)} was cancelled. It is back where it was.`,
  }

  const track = (next: Drag | null): void => {
    dragging.current = next
    setDrag(next)
  }
  const onDragStart = ({ active }: DragStartEvent): void => {
    const original = arrangementOf(columns)
    track({ key: String(active.id), original, arrangement: original })
  }
  // dnd-kit's multiple-container pattern: crossing into another column moves the card there as it happens (so that
  // column's list makes room); within a column the sortable list shows the move, and the drop settles it once.
  const onDragOver = ({ active, over }: DragOverEvent): void => {
    const current = dragging.current
    if (!over || !current) return
    const from = containerOf(current.arrangement, String(active.id))
    const to = containerOf(current.arrangement, String(over.id))
    if (from && to && from !== to) track({ ...current, arrangement: arrangeOver(current.arrangement, String(active.id), String(over.id)) })
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const current = dragging.current
    if (current && over) {
      const final = arrangeOver(current.arrangement, String(active.id), String(over.id))
      const op = moveOp(current.original, final, String(active.id))
      if (op) actions.drop(op)
    }
    track(null)
  }

  const handlers = { statuses, onOpen: openTask, onComplete: actions.complete, onReopen: actions.reopen, onMove: actions.move }
  const column = (c: (typeof columns)[number], heading: boolean) => (
    <Column key={c.status.id} status={c.status} keys={arrangement[c.status.id] ?? []} cards={cards} onAdd={actions.add} heading={heading} {...handlers} />
  )
  const dragged = drag ? cards.get(drag.key) : undefined
  const firstTodo = columns.find(c => c.status.category === 'todo')?.status.id ?? columns[0]?.status.id ?? ''
  const tab = columns.some(c => c.status.id === params.get('status')) ? (params.get('status') as string) : firstTodo

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => track(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To move a task, press Space on its drag handle, use the arrow keys to move it, and press Space again to drop it. Escape cancels. The Move menu on each card does the same without dragging.',
          },
        }}
      >
        {wide ? (
          <div role="region" aria-label="Board columns" tabIndex={0} className="flex items-start gap-inline-md overflow-x-auto pb-stack-sm">
            {columns.map(c => column(c, true))}
          </div>
        ) : (
          <Tabs.Root value={tab} onValueChange={value => setParam('status', value)} className="flex flex-col gap-stack-md">
            <Tabs.List aria-label="Statuses" className="flex gap-inline-xs overflow-x-auto border-b border-border-subtle">
              {columns.map(c => (
                <Tabs.Trigger
                  key={c.status.id}
                  value={c.status.id}
                  className="inline-flex min-h-(--size-target-default) shrink-0 cursor-pointer items-center gap-inline-xs border-b-(length:--border-width-md) border-transparent px-inline-sm text-label text-text-secondary aria-selected:border-accent-text aria-selected:text-text-primary"
                >
                  {c.status.name}
                  <span className="text-caption">({c.cards.length})</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {columns.map(c => (
              // Not a tab stop of its own: the column inside has focusable cards and Add task (WAI-ARIA tabs pattern).
              <Tabs.Content key={c.status.id} value={c.status.id} tabIndex={-1}>
                {column(c, false)}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        )}
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <Card card={dragged} closed={false} statuses={statuses} index={0} count={1} onOpen={() => {}} onComplete={() => {}} onReopen={() => {}} onMove={() => {}} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {params.get('task') || params.get('new') ? (
        <TaskEditor
          key={params.get('task') ?? `new-${params.get('new') ?? ''}`}
          state={state}
          taskKey={params.get('task')}
          newStatus={wide ? undefined : tab}
          onClose={closeEditor}
          save={actions.save}
        />
      ) : null}
    </>
  )
}
