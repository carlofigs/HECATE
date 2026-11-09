import type { BoardCard } from '@hecate/core'
import { formatDay } from '@hecate/core'
import { Badge, IconButton, KeyChip, Menu, cn, type MenuItem } from '@hecate/ui'
import { Check, GripVertical, MoveVertical, RotateCcw } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { URGENCY_LABEL, URGENCY_TONE } from '../format.ts'
import type { MenuMove } from './moves.ts'

const ICON = 'size-(--size-icon-md)'

export interface CardProps {
  card: BoardCard
  /** Done or dropped: the card offers Reopen instead of Complete. */
  closed: boolean
  statuses: readonly { id: string; name: string }[]
  /** Its position in its column, for the Move menu's limits. */
  index: number
  count: number
  onOpen: (key: string) => void
  onComplete: (card: BoardCard) => void
  onReopen: (card: BoardCard) => void
  onMove: (card: BoardCard, move: MenuMove) => void
  /** The drag handle (DragHandle), wired by the sortable wrapper; absent on the drag overlay, which shows the card only. */
  handle?: ReactNode
}

/** The control a drag starts from. Pointer and keyboard both start here, so nothing else on the card is draggable. */
export function DragHandle({ taskKey, ...props }: { taskKey: string } & ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      aria-label={`Drag ${taskKey}`}
      className="inline-flex size-(--size-control-default) shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-text-secondary hover:bg-bg-surface-hover"
      {...props}
    >
      <GripVertical aria-hidden="true" className={ICON} />
    </button>
  )
}

/** One task on the Board. Every action is a visible control: nothing appears only on hover. design/components/task-card.md */
export function Card({ card, closed, statuses, index, count, onOpen, onComplete, onReopen, onMove, handle }: CardProps) {
  const items: MenuItem[] = [
    { kind: 'label', label: 'Status' },
    ...statuses.map(s => ({ label: s.name, checked: s.id === card.status, onSelect: () => onMove(card, { status: s.id }) })),
    { kind: 'separator' },
    { kind: 'label', label: 'Position' },
    { label: 'Move to top', disabled: index === 0, onSelect: () => onMove(card, 'top') },
    { label: 'Move up', disabled: index === 0, onSelect: () => onMove(card, 'up') },
    { label: 'Move down', disabled: index >= count - 1, onSelect: () => onMove(card, 'down') },
    { label: 'Move to bottom', disabled: index >= count - 1, onSelect: () => onMove(card, 'bottom') },
  ]
  return (
    <article aria-label={`${card.key} ${card.title}`} className="flex flex-col gap-stack-xs rounded-container border border-border-subtle bg-bg-surface p-inset-sm shadow-raised">
      <div className="flex items-start gap-inline-xs">
        {handle}
        <div className="flex min-w-0 flex-1 flex-col gap-stack-xs">
          <span className="flex flex-wrap items-center gap-inline-xs">
            <KeyChip taskKey={card.key} />
            {card.urgency ? <Badge tone={URGENCY_TONE[card.urgency]}>{URGENCY_LABEL[card.urgency]}</Badge> : null}
            {card.blockedBy.length > 0 && !closed ? <Badge tone="warning">Blocked</Badge> : null}
          </span>
          <button
            type="button"
            onClick={() => onOpen(card.key)}
            className={cn(
              'min-h-(--size-target-default) cursor-pointer text-start text-body-md hover:underline',
              closed ? 'text-text-secondary line-through' : 'text-text-primary',
            )}
          >
            {card.title}
          </button>
          <span className="flex flex-wrap gap-x-inline-sm text-body-sm text-text-secondary">
            {card.due ? <span>Due {formatDay(card.due)}</span> : null}
            {card.blockedBy.length > 0 && !closed ? <span>Blocked by {card.blockedBy.join(', ')}</span> : null}
            {card.waitingOn ? <span>Waiting on {card.waitingOn}</span> : null}
            {card.projectSlug ? <span>Project {card.projectSlug}</span> : null}
            {card.tags.map(t => (
              <span key={t}>#{t}</span>
            ))}
          </span>
        </div>
      </div>
      {handle ? (
        <div className="flex justify-end gap-inline-xs">
          {closed ? (
            <IconButton label={`Reopen ${card.key}`} icon={<RotateCcw aria-hidden="true" className={ICON} />} onClick={() => onReopen(card)} />
          ) : (
            <IconButton label={`Complete ${card.key}`} icon={<Check aria-hidden="true" className={ICON} />} onClick={() => onComplete(card)} />
          )}
          <Menu label={`Move ${card.key}`} icon={<MoveVertical aria-hidden="true" className={ICON} />} items={items} />
        </div>
      ) : null}
    </article>
  )
}
