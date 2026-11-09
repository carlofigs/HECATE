import type { ReactNode } from 'react'
import { cn } from './cn.ts'

/** design/components/empty-state.md */
export interface EmptyStateProps {
  /** Decorative. */
  icon?: ReactNode
  title: string
  /** Why it is empty, and how it fills. */
  children?: ReactNode
  action?: ReactNode
  /** The heading level that fits the page outline (R-13). */
  level?: 2 | 3
  className?: string
}

export function EmptyState({ icon, title, children, action, level = 2, className }: EmptyStateProps) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className={cn('flex flex-col items-center gap-stack-sm rounded-container border border-border-subtle bg-bg-surface p-inset-xl text-center', className)}>
      {icon ? <span className="text-text-muted">{icon}</span> : null}
      <Heading className="text-heading-4 text-text-primary">{title}</Heading>
      {children ? <div className="max-w-prose text-body-md text-text-secondary">{children}</div> : null}
      {action}
    </div>
  )
}
