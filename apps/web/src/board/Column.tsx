import type { BoardCard, BoardColumn } from '@hecate/core'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge, Button, TextField, cn } from '@hecate/ui'
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Card, DragHandle, type CardProps } from './Card.tsx'

type CardHandlers = Pick<CardProps, 'onOpen' | 'onComplete' | 'onReopen' | 'onMove' | 'statuses'>

function SortableCard({ card, closed, index, count, ...handlers }: { card: BoardCard; closed: boolean; index: number; count: number } & CardHandlers) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.key })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'opacity-(--opacity-muted)')}>
      <Card card={card} closed={closed} index={index} count={count} handle={<DragHandle ref={setActivatorNodeRef} taskKey={card.key} {...attributes} {...listeners} />} {...handlers} />
    </li>
  )
}

export interface ColumnProps extends CardHandlers {
  status: BoardColumn['status']
  /** The keys in this column, in order: the live arrangement while dragging. */
  keys: readonly string[]
  cards: ReadonlyMap<string, BoardCard>
  onAdd: (status: string, title: string) => string | null
  /** Shows the column's heading: false inside a tab, whose label already says it. */
  heading?: boolean
}

/** A status on the Board: its cards, a drop zone even when empty, and a quick add. design/components/board-column.md */
export function Column({ status, keys, cards, onAdd, heading = true, ...handlers }: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: status.id })
  const closed = status.category === 'done' || status.category === 'dropped'
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!title.trim()) return
    if (onAdd(status.id, title.trim())) setTitle('')
  }

  return (
    <section aria-labelledby={`column-${status.id}`} className="flex min-w-(--container-column) flex-1 flex-col gap-stack-sm rounded-container bg-bg-subtle p-inset-sm">
      <h2 id={`column-${status.id}`} className={cn('flex items-center gap-inline-sm px-inline-xs text-heading-4 text-text-primary', !heading && 'sr-only')}>
        {status.name}
        <Badge>{`${keys.length} ${keys.length === 1 ? 'task' : 'tasks'}`}</Badge>
      </h2>
      <SortableContext id={status.id} items={[...keys]} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-(--size-control-lg) flex-col gap-stack-sm">
          {keys.map((key, index) => {
            const card = cards.get(key)
            return card ? <SortableCard key={key} card={card} closed={closed} index={index} count={keys.length} {...handlers} /> : null
          })}
        </ul>
      </SortableContext>
      {keys.length === 0 ? <p className="px-inline-xs text-body-sm text-text-muted">Nothing here. Drag a task in, or add one.</p> : null}
      {adding ? (
        <form onSubmit={submit} className="flex flex-col gap-stack-xs">
          <TextField
            label={`New task in ${status.name}`}
            value={title}
            autoFocus
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <div className="flex gap-inline-xs">
            <Button type="submit" variant="primary">
              Add
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" className="self-start" icon={<Plus aria-hidden="true" className="size-(--size-icon-md)" />} onClick={() => setAdding(true)}>
          Add task
        </Button>
      )}
    </section>
  )
}
