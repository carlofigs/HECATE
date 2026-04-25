/**
 * TaskSnapshotRow — read-only task row for Archive and Week Log views
 *
 * Renders an id chip, title, and tags. No click, no drag, no edit.
 * Mirrors the visual weight of TaskListRow but is purely presentational.
 *
 * Props:
 *   showId   — show the ID chip column (default true). When true, null-ID rows
 *              render an empty w-8 placeholder so all titles align.
 *              When false (Week Log context), the title is parsed for a leading
 *              human ID token (e.g. "A65 – BAU validation") and rendered as a
 *              styled pill chip separate from the remaining title text.
 *   showTags — show tag pills (default true). Pass false in Week Log context.
 */

import { cn } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

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
   * Whether to render the structured ID chip column. Defaults true (Archive view).
   * When true, null-ID rows receive an empty w-8 placeholder so all titles align.
   * When false (Week Log), the title is parsed for a leading token like "A65 –"
   * and that token is rendered as a pill chip instead.
   */
  showId?: boolean
  /**
   * Whether to render tag pills. Defaults true (Archive view).
   * Pass false in Week Log context to reduce visual noise.
   */
  showTags?: boolean
}

/**
 * Parse a task title for a leading human ID token.
 * Matches patterns like: "A65 – title", "B30 title", "A47 – memo"
 * Returns { chip, text } — chip is null when no leading ID is found.
 */
function parseTitleId(title: string): { chip: string | null; text: string } {
  // [uppercase letter][digits] optionally followed by em/en/hyphen dash + space
  const m = title.match(/^([A-Z]\d+)\s*(?:[–\-—]\s*)?(.+)$/)
  if (m && m[2].trim()) return { chip: m[1], text: m[2].trim() }
  return { chip: null, text: title }
}

export function TaskSnapshotRow({
  snapshot,
  accent   = 'muted',
  showId   = true,
  showTags = true,
}: Props) {
  // In week log context (showId=false), parse the human ID from the title text.
  // In archive context (showId=true), leave the title untouched.
  const { chip: titleChip, text: titleText } = showId
    ? { chip: null, text: snapshot.title }
    : parseTitleId(snapshot.title)

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-1.5 text-xs border-l-2',
      accent === 'green' ? 'border-l-green-500/40' : 'border-l-border',
    )}>

      {/* Structured ID chip (archive context) — always reserves w-8 for alignment */}
      {showId && (
        <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 tabular-nums w-8">
          {snapshot.id ? displayId(snapshot.id) : ''}
        </span>
      )}

      {/* Inline human ID chip parsed from title (week log context only) */}
      {titleChip && (
        <span className="font-mono text-[10px] text-muted-foreground/60 bg-muted/60 rounded px-1.5 py-0.5 shrink-0 tabular-nums hover:bg-muted transition-colors cursor-default">
          {titleChip}
        </span>
      )}

      {/* Title — tooltip reveals full text when truncated */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-1 min-w-0 text-foreground truncate cursor-default">
            {titleText}
          </span>
        </TooltipTrigger>
        <TooltipContent>{snapshot.title}</TooltipContent>
      </Tooltip>

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
