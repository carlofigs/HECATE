import type { ReactNode } from 'react'
import { cn } from './cn.ts'

/** design/components/badge.md */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-subtle text-text-secondary border-border-subtle',
  accent: 'bg-accent-bg-subtle text-accent-text border-accent-text',
  success: 'bg-status-success-bg text-status-success-text border-status-success-border',
  warning: 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
  danger: 'bg-status-danger-bg text-status-danger-text border-status-danger-border',
  info: 'bg-status-info-bg text-status-info-text border-status-info-border',
}

export interface BadgeProps {
  tone?: Tone
  /** Decorative: the text carries the meaning (R-04). */
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-inline-xs rounded-pill border px-inline-sm text-caption whitespace-nowrap', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export interface KeyChipProps {
  /** A task key: A12, B3. */
  taskKey: string
  /** Where the task opens, once the Board exists. */
  href?: string
  className?: string
}

/** A task key, set apart from the text around it. */
export function KeyChip({ taskKey, href, className }: KeyChipProps) {
  const classes = cn(
    'inline-flex items-center rounded-control border border-border-subtle bg-bg-subtle px-inline-xs font-mono text-code text-text-secondary whitespace-nowrap',
    href && 'text-text-link underline hover:bg-bg-surface-hover',
    className,
  )
  return href ? (
    <a href={href} className={classes} aria-label={`Task ${taskKey}`}>
      {taskKey}
    </a>
  ) : (
    <span className={classes}>{taskKey}</span>
  )
}
