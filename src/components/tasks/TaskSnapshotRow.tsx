/**
 * TaskSnapshotRow — read-only task row for Archive and Week Log views
 *
 * Renders an id chip, title, and tags. No click, no drag, no edit.
 * Mirrors the visual weight of TaskListRow but is purely presentational.
 *
 * Props:
 *   showId   — show the ID chip column (default true). When true, null-ID rows
 *              render an empty w-8 placeholder so all titles align.
 *   showTags — show tag pills (default true). Pass false in Week Log context.
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
  /**
   * Whether to render the ID chip column. Defaults true (Archive view).
   * When true, null-ID rows receive an empty w-8 placeholder so all titles
   * align on the same column. Pass false in Week Log (narrative) context.
   */
  showId?: boolean
  /**
   * Whether to render tag pills. Defaults true (Archive view).
   * Pass false in Week Log context to reduce visual noise.
   */
  showTags?: boolean
}

export function TaskSnapshotRow({
  snapshot,
  accent   = 'muted',
  showId   = true,
  showTags = true,
}: Props) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-1.5 text-xs border-l-2',
      accent === 'green' ? 'border-l-green-500/40' : 'border-l-border',
    )}>

      {/* ID chip — always reserves w-8 when showId=true so titles stay aligned */}
      {showId && (
        <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 tabular-nums w-8">
          {snapshot.id ? displayId(snapshot.id) : ''}
        </span>
      )}

      {/* Title */}
      <span className="flex-1 min-w-0 text-foreground truncate">
        {snapshot.title}
      </span>

      {/* Tags — omitted in Week Log context (showTags=false) */}
      {showTags && snapshot.tags.length > 0 && (
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
