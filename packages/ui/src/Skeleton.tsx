import { cn } from './cn.ts'

/** design/components/skeleton.md */
export interface SkeletonProps {
  /** Lines of placeholder text. */
  lines?: number
  className?: string
}

/** A static placeholder (no shimmer, so nothing to reduce under R-12). The region around it carries aria-busy. */
export function Skeleton({ lines = 3, className }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-stack-sm', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cn('h-(--text-body-md) rounded-control bg-bg-subtle', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
