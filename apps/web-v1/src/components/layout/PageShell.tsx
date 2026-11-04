/**
 * PageShell — standard page wrapper
 *
 * Handles the three states every data-driven page has:
 *   loading → skeleton
 *   error   → inline error with retry
 *   ready   → renders children
 *
 * Usage:
 *   <PageShell loading={loading} error={error} onRetry={reload} title="Tasks">
 *     <YourPageContent />
 *   </PageShell>
 */

import { ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PageShellProps {
  children:  ReactNode
  loading:   boolean
  error:     string | null
  onRetry?:  () => void
  title?:    string
  /** Extra classes for the outer container */
  className?: string
  /** Custom skeleton — defaults to generic block skeletons */
  skeleton?:  ReactNode
  /** Page-level actions rendered in the header (desktop) */
  actions?:   ReactNode
}

const DefaultSkeleton = () => (
  <div className="space-y-3 p-4">
    <Skeleton className="h-5 w-1/3" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-5 w-1/4 mt-6" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-4/5" />
  </div>
)

export function PageShell({
  children,
  loading,
  error,
  onRetry,
  title,
  className,
  skeleton,
  actions,
}: PageShellProps) {
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      {(title || actions) && (
        <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
          {title && (
            <h1 className="text-sm font-semibold text-foreground">{title}</h1>
          )}
          {actions && (
            <div className="flex items-center gap-2">{actions}</div>
          )}
        </header>
      )}

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && !error ? (
          skeleton ?? <DefaultSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

// ─── Error state ─────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Failed to load</p>
        <p className="text-xs text-muted-foreground max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </Button>
      )}
    </div>
  )
}
