import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn.ts'

/** design/components/banner.md */
export type BannerTone = 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BannerTone, { classes: string; icon: ReactNode }> = {
  success: { classes: 'bg-status-success-bg text-status-success-text border-status-success-border', icon: <CircleCheck aria-hidden="true" className="size-(--size-icon-md) shrink-0 text-status-success-icon" /> },
  warning: { classes: 'bg-status-warning-bg text-status-warning-text border-status-warning-border', icon: <TriangleAlert aria-hidden="true" className="size-(--size-icon-md) shrink-0 text-status-warning-icon" /> },
  danger: { classes: 'bg-status-danger-bg text-status-danger-text border-status-danger-border', icon: <CircleAlert aria-hidden="true" className="size-(--size-icon-md) shrink-0 text-status-danger-icon" /> },
  info: { classes: 'bg-status-info-bg text-status-info-text border-status-info-border', icon: <Info aria-hidden="true" className="size-(--size-icon-md) shrink-0 text-status-info-icon" /> },
}

export interface BannerProps {
  tone: BannerTone
  /** What happened, in a few words (R-27). */
  title: string
  /** Why, and what to do next (R-27). */
  children?: ReactNode
  /** One action that resolves it, e.g. Retry. */
  action?: ReactNode
  className?: string
}

/** A condition that persists until resolved (M-app-05). Danger is announced at once; the rest politely. */
export function Banner({ tone, title, children, action, className }: BannerProps) {
  const { classes, icon } = TONES[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-wrap items-start gap-inline-md rounded-container border p-inset-md', classes, className)}>
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-stack-xs">
        <p className="text-label">{title}</p>
        {children ? <div className="text-body-sm">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
