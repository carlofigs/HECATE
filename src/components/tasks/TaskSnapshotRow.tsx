/**
 * TaskSnapshotRow — read-only task row for Archive and Week Log views
 *
 * Renders an id chip, title, and tags. No click, no drag, no edit.
 * Mirrors the visual weight of TaskListRow but is purely presentational.
 */

import { cn } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'

/**
 * Minimal shape accepted — structurally satisfied by both TaskSnapshot and
 * ArchivedTask so no union import is needed. `note` is intentionally omitted
 * from the row render; callers pass the full object without extra casting.
 */
interface SnapshotLike {
  id:    string | null
  title: string
  tags:  string[]
}

interface Props {
  snapshot: SnapshotLike
  /** Faint left accent colour for visual grouping (e.g. done vs not-doing) */
  accent?: 'green' | 'muted'
}

export function TaskSnapshotRow({ snapshot, accent = 'muted' }: Props) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-1.5 text-xs border-l-2',
      accent === 'green' ? 'border-l-green-500/40' : 'border-l-border',
    )}>
      {/* ID chip */}
      {snapshot.id && (
        <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 tabular-nums w-8">
          {displayId(snapshot.id)}
        </span>
      )}

      {/* Title */}
      <span className="flex-1 min-w-0 text-foreground truncate">
        {snapshot.title}
      </span>

      {/* Tags */}
      {snapshot.tags.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {snapshot.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5"
            >
              #{tag}
            </span>
          ))}
          {snapshot.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground/60">
              +{snapshot.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
