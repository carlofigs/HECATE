/**
 * The pieces every page builds from: a titled section of items, an item with
 * its controls, and a task line. Today and Projects share them, so a list
 * reads and behaves the same everywhere.
 */
import { formatDay, type TaskSummary } from '@hecate/core'
import { Badge, IconButton, KeyChip, Menu, cn, type MenuItem } from '@hecate/ui'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { createContext, use, type ReactNode } from 'react'
import { Link } from 'react-router'
import { URGENCY_LABEL, URGENCY_TONE } from './format.ts'

/**
 * Where a task opens. By default `?task=KEY` on the current page, which opens
 * its editor there (the Board, a project); Today points it at the Board. A
 * task's title is the link; key chips stay labels, being too small a target (R-07).
 */
export const TaskLink = createContext<(key: string) => string>(key => `?task=${key}`)

export interface SectionProps {
  id: string
  title: string
  /** Shown when there are no items; leave out for a section that is not a list. */
  empty?: string
  children: ReactNode[]
  /** Shown after the list, before the actions: a closed day's note. */
  aside?: ReactNode
  /** The section's actions, always visible: Add, Close the day. */
  footer?: ReactNode
  className?: string
}

export function Section({ id, title, empty, children, aside, footer, className }: SectionProps) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-stack-sm rounded-container border border-border-subtle bg-bg-surface p-inset-lg', className)}>
      <h2 id={id} className="text-heading-3 text-text-primary">
        {title}
      </h2>
      {children.length > 0 ? <ul className="flex flex-col gap-stack-sm">{children}</ul> : empty ? <p className="text-body-sm text-text-muted">{empty}</p> : null}
      {aside}
      {footer ? <div className="flex flex-wrap items-center gap-inline-sm">{footer}</div> : null}
    </section>
  )
}

export const ICON = 'size-(--size-icon-md)'

/** An item and its controls: Edit, and either a menu (move, remove) or Remove. Nothing waits for hover. */
export function Item({ children, name, onEdit, menu, onRemove, className }: {
  children: ReactNode
  name: string
  onEdit: () => void
  menu?: MenuItem[]
  onRemove?: () => void
  className?: string
}) {
  return (
    <li className="flex items-start gap-inline-sm">
      <div className={cn('flex min-w-0 flex-1 flex-col gap-stack-xs', className)}>{children}</div>
      <div className="flex shrink-0 items-center">
        <IconButton label={`Edit “${name}”`} icon={<Pencil aria-hidden="true" className={ICON} />} onClick={onEdit} />
        {menu ? <Menu label={`More for “${name}”`} icon={<MoreVertical aria-hidden="true" className={ICON} />} items={menu} /> : null}
        {onRemove ? <IconButton label={`Remove “${name}”`} icon={<Trash2 aria-hidden="true" className={ICON} />} onClick={onRemove} /> : null}
      </div>
    </li>
  )
}

export const Keys = ({ keys }: { keys: readonly string[] }) =>
  keys.length > 0 ? (
    <span className="inline-flex flex-wrap gap-inline-xs">
      {keys.map(k => (
        <KeyChip key={k} taskKey={k} />
      ))}
    </span>
  ) : null

export function Urgency({ urgency }: { urgency: TaskSummary['urgency'] }) {
  return urgency ? <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge> : null
}

/** A task line: key, title, then the facts that decide what to do with it. `showProject` is off on a project's own page. */
export function TaskLine({ task, children, showProject = true }: { task: TaskSummary; children?: ReactNode; showProject?: boolean }) {
  return (
    <li className="flex flex-col gap-stack-xs">
      <span className="flex flex-wrap items-baseline gap-inline-sm">
        <KeyChip taskKey={task.key} />
        <Link to={use(TaskLink)(task.key)} className="inline-flex min-h-(--size-target-default) items-center text-body-md text-text-link underline">
          {task.title}
        </Link>
        <Urgency urgency={task.urgency} />
      </span>
      <span className="flex flex-wrap gap-x-inline-md text-body-sm text-text-secondary">
        {task.blockedBy.length > 0 ? <span>Blocked by {task.blockedBy.join(', ')}</span> : null}
        {task.due ? <span>Due {formatDay(task.due)}</span> : null}
        {showProject && task.projectSlug ? <span>Project {task.projectSlug}</span> : null}
        {children}
      </span>
    </li>
  )
}
